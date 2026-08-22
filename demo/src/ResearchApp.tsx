import { useEffect, useMemo, useRef, useState } from 'react'
import type { BenchmarkVariant, MemorySample } from './webgl-lab'
import { scenarios, type ScenarioId } from './research-model'
import type { ResearchSuite, ScenarioReport } from './research-lab'

const variantMeta: Record<BenchmarkVariant, { label: string; className: string }> = {
  unmanaged: { label: 'unmanaged', className: 'series-unmanaged' },
  naive: { label: 'naïve eager', className: 'series-naive' },
  native: { label: 'native R3F', className: 'series-native' },
  guarded: { label: 'Dispose Guard', className: 'series-guarded' },
}

const flowByScenario: Record<ScenarioId, readonly string[]> = {
  unique: ['mount', 'allocate', 'unmount', 'release'],
  shared: ['owner A', 'owner B', 'release A', 'release B'],
  cache: ['load', 'protect cache', 'zero users', 'evict'],
  canvas: ['mount Canvas', 'release scene', 'dispose renderer', 'remount'],
  churn: ['acquire next', 'release previous', 'repeat', 'evict pool'],
  'in-flight': ['request', 'evict', 'late resolve', 'clean stale'],
}
const variants = Object.keys(variantMeta) as BenchmarkVariant[]
const installCommand = 'npm i three-dispose-guard'
const apiGuideUrl = 'https://github.com/OskarasM/three-dispose-guard/blob/main/docs/api.md'
const r3fGuideUrl = 'https://github.com/OskarasM/three-dispose-guard/blob/main/docs/r3f-guide.md'

const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`


function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
      <path d="M4 10h11M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
      <path d="M10 3v9m0 0 4-4m-4 4L6 8M4 15h12" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}
function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
      <rect x="6" y="6" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 12H3V3h9v1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function HeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [webglStatus, setWebglStatus] = useState<'initialising' | 'live' | 'fallback'>(
    'initialising',
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    })
    if (!context) {
      setWebglStatus('fallback')
      return
    }

    let cancelled = false
    let unmount: (() => void) | undefined

    void import('./webgl-lab')
      .then(({ mountHeroScene }) => {
        if (cancelled) return
        try {
          unmount = mountHeroScene(canvas)
          setWebglStatus('live')
        } catch {
          setWebglStatus('fallback')
        }
      })
      .catch(() => {
        if (!cancelled) setWebglStatus('fallback')
      })

    return () => {
      cancelled = true
      unmount?.()
    }
  }, [])

  const liveLabel = webglStatus === 'fallback'
    ? 'Static fallback'
    : webglStatus === 'live'
      ? 'WebGL live'
      : 'Initialising WebGL'

  return (
    <div
      className="hero-visual"
      role="img"
      aria-label={webglStatus === 'fallback'
        ? 'Static illustration representing shared GPU ownership'
        : 'Live WebGL scene representing shared GPU ownership'}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="visual-label visual-label-top">
        {webglStatus === 'live' && <span className="live-dot" />}
        {liveLabel}
      </div>
      <div className="visual-label visual-label-bottom">
        <span>ownership explicit</span>
        <strong>disposal deterministic</strong>
      </div>
      <div className="orbital-line orbital-line-a" />
      <div className="orbital-line orbital-line-b" />
    </div>
  )
}

interface MemoryChartProps {
  series: Partial<Record<BenchmarkVariant, MemorySample[]>>
  running: boolean
}

function MemoryChart({ series, running }: MemoryChartProps) {
  const width = 760
  const height = 280
  const inset = 28
  const populated = Object.entries(series) as [BenchmarkVariant, MemorySample[]][]
  const all = populated.flatMap(([, samples]) => samples)
  const maxCycle = Math.max(1, ...all.map((sample) => sample.cycle))
  const maxValue = Math.max(4, ...all.map((sample) => sample.geometries + sample.textures))
  const points = (samples: MemorySample[]) => samples.map((sample) => {
    const x = inset + (sample.cycle / maxCycle) * (width - inset * 2)
    const total = sample.geometries + sample.textures
    const y = height - inset - (total / maxValue) * (height - inset * 2)
    return `${x},${y}`
  }).join(' ')
  const chartDescription = all.length === 0
    ? 'No measurement has been captured yet.'
    : populated.map(([variant, samples]) => {
      const final = samples.at(-1)
      return `${variantMeta[variant].label} ends at ${(final?.geometries ?? 0) + (final?.textures ?? 0)} resources.`
    }).join(' ')

  return (
    <div className="chart-wrap research-chart-wrap">
      <svg
        className="memory-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby="research-chart-title research-chart-description"
      >
        <title id="research-chart-title">Three.js resource count by mount cycle</title>
        <desc id="research-chart-description">{chartDescription}</desc>
        {[0, 1, 2, 3, 4].map((line) => {
          const y = inset + (line / 4) * (height - inset * 2)
          return <line key={line} x1={inset} x2={width - inset} y1={y} y2={y} className="grid-line" />
        })}
        <line x1={inset} x2={inset} y1={inset} y2={height - inset} className="axis-line" />
        <line x1={inset} x2={width - inset} y1={height - inset} y2={height - inset} className="axis-line" />
        {populated.map(([variant, samples]) => samples.length > 0 && (
          <polyline
            key={variant}
            className={`chart-line ${variantMeta[variant].className}`}
            points={points(samples)}
          />
        ))}
      </svg>
      {all.length === 0 && (
        <div className="chart-empty">
          <span className="chart-empty-mark">06</span>
          <p>{running ? 'Running the selected WebGL proof…' : 'Select a scenario, then run its proof'}</p>
        </div>
      )}
      <div className="chart-axis-label chart-axis-y">Three.js resources</div>
      <div className="chart-axis-label chart-axis-x">mount cycles</div>
    </div>
  )
}

function ScenarioPicker({
  selected,
  onSelect,
  disabled,
}: {
  selected: ScenarioId
  onSelect: (scenario: ScenarioId) => void
  disabled: boolean
}) {
  return (
    <fieldset className="scenario-picker" disabled={disabled}>
      <legend className="sr-only">Choose a research scenario</legend>
      {scenarios.map((scenario) => (
        <button
          key={scenario.id}
          className="scenario-tab"
          type="button"
          aria-pressed={selected === scenario.id}
          onClick={() => onSelect(scenario.id)}
        >
          <span>{scenario.index}</span>
          {scenario.title}
        </button>
      ))}
    </fieldset>
  )
}

function AssertionList({ report }: { report: ScenarioReport | null }) {
  if (!report) {
    return <p className="result-placeholder">No result yet. The lab never substitutes sample numbers.</p>
  }

  return (
    <ul className="assertion-list">
      {report.assertions.map((assertion) => (
        <li key={assertion.label} className={assertion.passed ? 'assertion-pass' : 'assertion-fail'}>
          <span className="assertion-mark">{assertion.passed ? 'PASS' : 'FAIL'}</span>
          <div>
            <strong>{assertion.label}</strong>
            <p>{assertion.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
function ComparisonTable({ report }: { report: ScenarioReport }) {
  return (
    <div className="metrics-table-wrap comparison-table-wrap">
      <table className="metrics-table comparison-table">
        <caption>Four-behaviour comparison for this scenario</caption>
        <thead>
          <tr>
            <th scope="col">Behaviour</th>
            <th scope="col">Outcome</th>
            <th scope="col">Evidence</th>
            <th scope="col">Interpretation</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => {
            const comparison = report.comparisons.find((item) => item.variant === variant)
            return (
              <tr key={variant}>
                <th scope="row">{variantMeta[variant].label}</th>
                <td>{comparison?.outcome.replaceAll('-', ' ') ?? 'not reported'}</td>
                <td>{comparison?.measured ? 'Measured' : 'Not measured'}</td>
                <td>{comparison?.detail ?? 'No comparison was reported.'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}


function ResourceMetricsTable({ totals }: { totals: Record<BenchmarkVariant, number> }) {
  return (
    <div className="metrics-table-wrap">
      <table className="metrics-table">
        <caption>Final Three.js resource count after the selected run</caption>
        <thead>
          <tr>
            <th scope="col">Behaviour</th>
            <th scope="col">Final resources</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => (
            <tr key={variant}>
              <th scope="row">
                <span className="series-key">
                  <i className={variantMeta[variant].className} aria-hidden="true" />
                  {variantMeta[variant].label}
                </span>
              </th>
              <td><strong>{totals[variant]}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SuiteSummaryTable({ suite }: { suite: ResearchSuite }) {
  return (
    <div className="suite-summary">
      <table>
        <caption>Five-run final resource-count summary</caption>
        <thead>
          <tr>
            <th scope="col">Behaviour</th>
            <th scope="col">Mean</th>
            <th scope="col">Range</th>
            <th scope="col">Variance</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => (
            <tr key={variant}>
              <th scope="row">{variantMeta[variant].label}</th>
              <td>{suite.summary[variant].mean.toFixed(1)}</td>
              <td>{suite.summary[variant].minimum}–{suite.summary[variant].maximum}</td>
              <td>{suite.summary[variant].variance.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function downloadScenario(report: ScenarioReport): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `dispose-guard-${report.scenario}-${report.measuredAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function ResearchApp() {
  const [selected, setSelected] = useState<ScenarioId>('unique')
  const [report, setReport] = useState<ScenarioReport | null>(null)
  const [series, setSeries] = useState<Partial<Record<BenchmarkVariant, MemorySample[]>>>({})
  const [suite, setSuite] = useState<ResearchSuite | null>(null)
  const [running, setRunning] = useState(false)
  const [suiteRunning, setSuiteRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
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


  const copyInstallCommand = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(installCommand)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
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
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Dispose Guard home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>dispose<span className="brand-accent">guard</span></span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#lab">Research lab</a>
          <a href="#findings">Findings</a>
          <a href="#quickstart">Quick start</a>
        </nav>
        <a className="header-link" href="https://github.com/OskarasM/three-dispose-guard">
          Source <ArrowIcon />
        </a>
      </header>

      <main id="main">
        <section className="hero section-shell" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span>v0.1</span> WebGL ownership, measured</div>
            <h1 id="hero-title">Dispose the orphan.<br /><em>Keep the shared.</em></h1>
            <p className="hero-lede">
              A zero-runtime-dependency ownership layer for Three.js, plus a reproducible lab
              for the shared and cached cases that ordinary unmount cleanup cannot decide.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#lab">Open the research lab <ArrowIcon /></a>
              <div className="install-command">
                <code id="install-command">{installCommand}</code>
                <button
                  className="copy-button"
                  type="button"
                  aria-describedby="install-command"
                  onClick={copyInstallCommand}
                >
                  <CopyIcon /> {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy'}
                </button>
              </div>
            </div>
            <ul className="trust-list" aria-label="Package guarantees">
              <li><span aria-hidden="true">01</span> Audit-only default</li>
              <li><span aria-hidden="true">02</span> R3F cache adapter</li>
              <li><span aria-hidden="true">03</span> Raw measurements</li>
            </ul>
          </div>
          <HeroScene />
        </section>

        <section className="principle-strip" aria-label="Core principle">
          <p>Collection is not disposal. Unmount is not ownership.</p>
          <span>The safe moment is when owners, borrowers and cache protections all reach zero.</span>
        </section>

        <section id="lab" className="lab research-lab section-shell" aria-labelledby="lab-title">
          <div className="section-heading">
            <div>
              <span className="section-number">01 / REPRODUCIBLE LAB</span>
              <h2 id="lab-title">Test the edge case you actually have.</h2>
            </div>
            <p>
              Every result is generated in this browser. The graph reports Three.js resource
              counts, never invented GPU-byte estimates.
            </p>
          </div>

          <ScenarioPicker
            selected={selected}
            onSelect={selectScenario}
            disabled={running || suiteRunning}
          />

          <div className="experiment-layout">
            <article className="experiment-brief" aria-labelledby="scenario-title">
              <span className="scenario-index">{definition.index} / 06</span>
              <h3 id="scenario-title">{definition.title}</h3>
              <p className="experiment-question">{definition.question}</p>
              <p>{definition.description}</p>

              <ol className="ownership-timeline" aria-label="Lifecycle timeline">
                {flowByScenario[selected].map((step, index) => (
                  <li key={step}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    {step}
                  </li>
                ))}
              </ol>

              <button
                className="button button-primary experiment-run"
                type="button"
                onClick={startScenario}
                disabled={running || suiteRunning}
              >
                {running ? 'Running proof…' : 'Run selected proof'}
                {!running && <ArrowIcon />}
              </button>
            </article>

            <article className="lab-panel experiment-results">
              <p className="sr-only" role="status" aria-live="polite">{resultStatus}</p>
              <div className="lab-toolbar">
                {selected === 'unique' ? (
                  <div className="chart-legend" aria-label="Chart legend">
                    {variants.map((variant) => (
                      <span key={variant}>
                        <i className={variantMeta[variant].className} aria-hidden="true" />
                        {variantMeta[variant].label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="result-mode">Lifecycle assertions</span>
                )}
                <span className="measurement-status">
                  <i className={running ? 'live-dot is-running' : 'live-dot'} />
                  {running ? 'measuring' : report ? 'captured' : 'ready'}
                </span>
              </div>

              {selected === 'unique' ? (
                <MemoryChart series={series} running={running} />
              ) : (
                <div className="proof-stage">
                  <span className="proof-stage-kicker">HANDLE-LEVEL PROOF</span>
                  <div className="proof-flow" aria-hidden="true">
                    {flowByScenario[selected].map((step) => (
                      <span key={step}>{step}</span>
                    ))}
                  </div>
                  <p>This scenario reports WebGL lifecycle assertions rather than a resource-count series.</p>
                </div>
              )}

              {benchmarkTotals && <ResourceMetricsTable totals={benchmarkTotals} />}

              <div className="proof-panel">
                <div className="proof-heading">
                  <div>
                    <span className="section-number">ASSERTIONS</span>
                    <strong>{report ? report.measuredAt.slice(11, 19) : 'waiting for a run'}</strong>
                  </div>
                  {report && (
                    <button className="text-button" type="button" onClick={() => downloadScenario(report)}>
                      <DownloadIcon /> JSON
                    </button>
                  )}
                </div>
                <AssertionList report={report} />
                {report && <ComparisonTable report={report} />}
                {report && (
                  <div className="evidence-note">
                    <span>{report.renderer}</span>
                    <span>{report.cycles} lifecycle {report.cycles === 1 ? 'step' : 'steps'}</span>
                  </div>
                )}
              </div>
            </article>
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
        </section>

        <section id="findings" className="findings section-shell" aria-labelledby="findings-title">
          <div className="section-heading">
            <div>
              <span className="section-number">02 / WHAT THE DATA MEANS</span>
              <h2 id="findings-title">Use the smallest ownership system that is correct.</h2>
            </div>
            <p>
              Dispose Guard does not compete with declarative R3F cleanup. It covers the point
              where a component is no longer the only authority over a resource.
            </p>
          </div>

          <div className="finding-grid">
            <article>
              <span className="finding-state">NATIVE IS ENOUGH</span>
              <h3>Unique declarative objects</h3>
              <p>When one component creates and owns one object tree, normal unmount disposal is simpler.</p>
            </article>
            <article>
              <span className="finding-state finding-state-acid">OWNERSHIP HELPS</span>
              <h3>Shared or cached assets</h3>
              <p>Reference counts and cache protections prevent both eager destruction and silent retention.</p>
            </article>
            <article>
              <span className="finding-state">OUTSIDE THIS PACKAGE</span>
              <h3>Renderer and driver memory</h3>
              <p>Contexts, driver allocation and GPU bytes require browser and renderer-level instrumentation.</p>
            </article>
          </div>

          <div className="suite-panel">
            <div>
              <span className="section-number">FULL MEASUREMENT</span>
              <h3>Five runs, 50 cycles, one discarded warm-up.</h3>
              <p>
                Run the complete local protocol, then download every sample. Variance is calculated
                from final Three.js resource counts for each strategy.
              </p>
            </div>
            <div className="suite-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={startSuite}
                disabled={suiteRunning || running}
              >
                {suiteRunning ? `Running · ${formatElapsed(suiteElapsedSeconds)}` : 'Run five-run suite'}
              </button>
              {suite && (
                <>
                  <button className="text-button" type="button" onClick={() => void downloadSuite('json')}>
                    <DownloadIcon /> JSON
                  </button>
                  <button className="text-button" type="button" onClick={() => void downloadSuite('csv')}>
                    <DownloadIcon /> CSV
                  </button>
                </>
              )}
            </div>
            <div className="suite-progress" role="status" aria-live="polite">
              <p>{suiteStatus}</p>
              {suiteRunning && (
                <div
                  className="suite-progress-track"
                  role="progressbar"
                  aria-label="Full research suite"
                  aria-valuetext={suiteStatus}
                >
                  <span />
                </div>
              )}
            </div>
            {suite && <SuiteSummaryTable suite={suite} />}
          </div>
        </section>

        <section id="quickstart" className="quickstart section-shell" aria-labelledby="quickstart-title">
          <div className="quickstart-copy">
            <span className="section-number">03 / FIVE-MINUTE START</span>
            <h2 id="quickstart-title">Make the cache an owner.</h2>
            <p>
              Use one cache guard for one R3F loader cache. Consumers borrow automatically;
              eviction is the only action that removes the cache protection.
            </p>
            <ol className="guide-steps compact-steps">
              <li><span>01</span><div><h3>Create</h3><p>Choose audit mode first, then enable disposal after reviewing events.</p></div></li>
              <li><span>02</span><div><h3>Provide</h3><p>Share one cache guard across every consumer of the same loader entries.</p></div></li>
              <li><span>03</span><div><h3>Evict</h3><p>Clear through the guard when the application cache policy expires.</p></div></li>
            </ol>
            <nav className="quickstart-links" aria-label="Developer documentation">
              <a href={r3fGuideUrl}>
                R3F migration guide <ArrowIcon />
              </a>
              <a href={apiGuideUrl}>
                API reference <ArrowIcon />
              </a>
            </nav>
          </div>
          <article className="quickstart-code">
            <div className="code-header">
              <span>ProductModel.tsx</span>
              <span className="code-status">cache safe</span>
            </div>
            <pre><code>{`const registry = createResourceRegistry({
  mode: 'dispose',
})

const cache = createR3FResourceCache({ registry })

<R3FResourceCacheProvider cache={cache}>
  <ProductModel />
</R3FResourceCacheProvider>

function ProductModel() {
  const gltf = useGuardedLoader(GLTFLoader, '/shoe.glb')
  return <GuardedPrimitive object={gltf.scene} />
}

// Your cache policy decides when this runs.
// Never evict at module load.
export function releaseProductAssets() {
  cache.evict(GLTFLoader, '/shoe.glb')
}`}</code></pre>
          </article>
        </section>

        <section className="limits section-shell" aria-labelledby="limits-title">
          <span className="section-number">04 / HONEST LIMITS</span>
          <h2 id="limits-title">What this cannot decide for you.</h2>
          <div className="limits-grid">
            <p><strong>GPU bytes</strong> Three.js reports resource counts, not driver allocation size.</p>
            <p><strong>Context lifecycle</strong> The host still owns renderer disposal and context loss.</p>
            <p><strong>Foreign caches</strong> Every external cache needs an explicit protection or custom collector.</p>
            <p><strong>No dispose method</strong> Resources without a disposal capability remain outside the guarantee.</p>
          </div>
        </section>

        <section className="cta section-shell" aria-labelledby="cta-title">
          <div>
            <span className="section-number">AUDIT BEFORE DISPOSAL</span>
            <h2 id="cta-title">Make ownership visible.</h2>
          </div>
          <a className="button button-large" href="https://github.com/OskarasM/three-dispose-guard">
            Read the full guide <ArrowIcon />
          </a>
        </section>
      </main>

      <footer className="site-footer section-shell">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          disposeguard
        </a>
        <p>Ownership-aware Three.js cleanup. MIT licensed.</p>
        <a href="#top">Back to top</a>
      </footer>
    </div>
  )
}
