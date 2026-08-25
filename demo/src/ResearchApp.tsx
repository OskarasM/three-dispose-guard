/* The page: state, the three async operations, and the order of the sections.
 *
 * Everything that draws is in sections/ and lab/, everything portable is in
 * chrome/. What stays here is the part that genuinely cannot move: one guard
 * against concurrent runs, and the derived strings the live regions announce.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { SiteFooter, SiteHeader } from './chrome'
import { Hero } from './sections/Hero'
import { Lab } from './sections/Lab'
import { Findings } from './sections/Findings'
import { QuickStart } from './sections/QuickStart'
import { CtaBand, Limits, PrincipleStrip } from './sections/Static'
import { scenarios, type ScenarioId } from './research-model'
import { REPO_URL, formatElapsed, variants } from './site'
import type { BenchmarkVariant, MemorySample } from './webgl-lab'
import type { ResearchSuite, ScenarioReport } from './research-lab'

const BRAND = ['dispose', 'guard'] as const

const NAV = [
  { href: '#lab', label: 'Research lab' },
  { href: '#findings', label: 'Findings' },
  { href: '#quickstart', label: 'Quick start' },
] as const

const SIBLING_SITES = [
  { href: 'https://scene-narrator-demo.vercel.app', label: 'scene-narrator' },
  { href: 'https://realtime-3d-room.vercel.app', label: 'realtime-3d-room' },
] as const

export function ResearchApp() {
  const [selected, setSelected] = useState<ScenarioId>('unique')
  const [report, setReport] = useState<ScenarioReport | null>(null)
  const [series, setSeries] = useState<Partial<Record<BenchmarkVariant, MemorySample[]>>>({})
  const [suite, setSuite] = useState<ResearchSuite | null>(null)
  const [running, setRunning] = useState(false)
  const [suiteRunning, setSuiteRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suiteElapsedSeconds, setSuiteElapsedSeconds] = useState(0)
  const suiteStartedAt = useRef<number | null>(null)
  const activeOperation = useRef(false)
  const definition = useMemo(
    () => scenarios.find((scenario) => scenario.id === selected) ?? scenarios[0],
    [selected],
  )

  useEffect(() => {
    if (!suiteRunning || suiteStartedAt.current === null) return

    const updateElapsed = () => {
      if (suiteStartedAt.current !== null) {
        setSuiteElapsedSeconds(Math.floor((performance.now() - suiteStartedAt.current) / 1000))
      }
    }
    const interval = window.setInterval(updateElapsed, 1_000)
    updateElapsed()
    return () => window.clearInterval(interval)
  }, [suiteRunning])

  const selectScenario = (scenario: ScenarioId) => {
    if (activeOperation.current) return
    setSelected(scenario)
    setReport(null)
    setSeries({})
    setError(null)
  }

  const startScenario = async () => {
    if (activeOperation.current) return
    activeOperation.current = true
    setRunning(true)
    setReport(null)
    setSeries({})
    setError(null)
    try {
      const { runScenario } = await import('./research-lab')
      const next = await runScenario(selected, 50, (variant, sample) => {
        setSeries((current) => ({
          ...current,
          [variant]: [...(current[variant] ?? []), sample],
        }))
      })
      setSeries(next.series)
      setReport(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The WebGL proof could not run.')
    } finally {
      activeOperation.current = false
      setRunning(false)
    }
  }

  const startSuite = async () => {
    if (activeOperation.current) return
    activeOperation.current = true
    suiteStartedAt.current = performance.now()
    setSuiteElapsedSeconds(0)
    setSuiteRunning(true)
    setSuite(null)
    setError(null)
    try {
      const { runResearchSuite } = await import('./research-lab')
      setSuite(await runResearchSuite(5, 50))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The research suite could not run.')
    } finally {
      if (suiteStartedAt.current !== null) {
        setSuiteElapsedSeconds(Math.round((performance.now() - suiteStartedAt.current) / 1000))
      }
      suiteStartedAt.current = null
      activeOperation.current = false
      setSuiteRunning(false)
    }
  }

  const downloadSuite = async (format: 'json' | 'csv') => {
    if (!suite) return
    try {
      const { downloadResearchSuite } = await import('./research-lab')
      downloadResearchSuite(suite, format)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The results could not be downloaded.')
    }
  }

  const benchmarkTotals = report?.benchmark
    ? Object.fromEntries(
      variants.map((variant) => {
        const final = report.benchmark![variant].final
        return [variant, final.geometries + final.textures]
      }),
    ) as Record<BenchmarkVariant, number>
    : null

  const resultStatus = running
    ? `Running ${definition.title}.`
    : report
      ? `${report.title} complete. ${report.assertions.filter((item) => item.passed).length} of ${report.assertions.length} assertions passed.`
      : `${definition.title} ready.`
  const suiteStatus = suiteRunning
    ? `A warm-up pass across six scenarios and five measured runs are in progress. Elapsed ${formatElapsed(suiteElapsedSeconds)}.`
    : suite
      ? `Full suite complete in ${formatElapsed(suiteElapsedSeconds)}.`
      : 'The full suite warms up all six scenarios, then repeats each one in five measured runs.'

  return (
    <div id="top">
      <SiteHeader name={BRAND} nav={NAV} sourceUrl={REPO_URL} />

      <main id="main">
        <Hero />
        <PrincipleStrip />
        <Lab
          selected={selected}
          onSelect={selectScenario}
          report={report}
          series={series}
          running={running}
          suiteRunning={suiteRunning}
          error={error}
          resultStatus={resultStatus}
          benchmarkTotals={benchmarkTotals}
          onRun={() => void startScenario()}
        />
        <Findings
          suite={suite}
          suiteRunning={suiteRunning}
          running={running}
          suiteElapsedSeconds={suiteElapsedSeconds}
          suiteStatus={suiteStatus}
          onRunSuite={() => void startSuite()}
          onDownload={(format) => void downloadSuite(format)}
        />
        <QuickStart />
        <Limits />
        <CtaBand />
      </main>

      <SiteFooter
        name={BRAND}
        blurb="Ownership-aware Three.js cleanup. MIT licensed."
        links={SIBLING_SITES}
      />
    </div>
  )
}
