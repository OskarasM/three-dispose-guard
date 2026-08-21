import { useEffect, useMemo, useRef, useState } from 'react'
import type { BenchmarkVariant, MemorySample } from './webgl-lab'
import { mountHeroScene } from './webgl-lab'
import {
  downloadResearchSuite,
  runResearchSuite,
  runScenario,
  scenarios,
  type ResearchSuite,
  type ScenarioId,
  type ScenarioReport,
} from './research-lab'

const variantMeta: Record<BenchmarkVariant, { label: string; className: string }> = {
  unmanaged: { label: 'unmanaged', className: 'series-unmanaged' },
  naive: { label: 'naïve eager', className: 'series-naive' },
  native: { label: 'declarative-style', className: 'series-native' },
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

    try {
      const unmount = mountHeroScene(canvas)
      setWebglStatus('live')
      return unmount
    } catch {
      setWebglStatus('fallback')
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

  return (
    <div className="chart-wrap research-chart-wrap">
      <svg
        className="memory-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby="research-chart-title research-chart-description"
      >
        <title id="research-chart-title">Three.js resource count by mount cycle</title>
        <desc id="research-chart-description">
          Four lines compare unmanaged, eager, declarative-style and ownership-guarded cleanup.
        </desc>
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
}: {
  selected: ScenarioId
  onSelect: (scenario: ScenarioId) => void
}) {
  return (
    <div className="scenario-picker" role="tablist" aria-label="Research scenarios">
      {scenarios.map((scenario) => (
        <button
          key={scenario.id}
          className="scenario-tab"
          type="button"
          role="tab"
          aria-selected={selected === scenario.id}
          onClick={() => onSelect(scenario.id)}
        >
          <span>{scenario.index}</span>
          {scenario.title}
        </button>
      ))}
    </div>
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
  const definition = useMemo(
    () => scenarios.find((scenario) => scenario.id === selected) ?? scenarios[0],
    [selected],
  )

  const selectScenario = (scenario: ScenarioId) => {
    setSelected(scenario)
    setReport(null)
    setSeries({})
    setError(null)
  }

  const startScenario = async () => {
    setRunning(true)
    setReport(null)
    setSeries({})
    setError(null)
    try {
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
      setRunning(false)
    }
  }

  const startSuite = async () => {
    setSuiteRunning(true)
    setSuite(null)
    setError(null)
    try {
      setSuite(await runResearchSuite(5, 50))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The research suite could not run.')
    } finally {
      setSuiteRunning(false)
    }
  }

  const benchmarkTotals = report?.benchmark
    ? Object.fromEntries(
      (Object.keys(variantMeta) as BenchmarkVariant[]).map((variant) => {
        const final = report.benchmark![variant].final
        return [variant, final.geometries + final.textures]
      }),
    ) as Record<BenchmarkVariant, number>
    : null

  return (
    <div id="top">
      <a className="skip-link" href="#main">Skip to content</a>
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
              <code>npm i three-dispose-guard</code>
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

          <ScenarioPicker selected={selected} onSelect={selectScenario} />

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
                disabled={running}
              >
                {running ? 'Running proof…' : 'Run selected proof'}
                {!running && <ArrowIcon />}
              </button>
            </article>

            <article className="lab-panel experiment-results" aria-live="polite">
              <div className="lab-toolbar">
                <div className="chart-legend" aria-label="Chart legend">
                  {(Object.keys(variantMeta) as BenchmarkVariant[]).map((variant) => (
                    <span key={variant}>
                      <i className={variantMeta[variant].className} />
                      {variantMeta[variant].label}
                    </span>
                  ))}
                </div>
                <span className="measurement-status">
                  <i className={running ? 'live-dot is-running' : 'live-dot'} />
                  {running ? 'measuring' : report ? 'captured' : 'ready'}
                </span>
              </div>

              <MemoryChart series={series} running={running} />

              {benchmarkTotals && (
                <div className="metric-grid research-metrics">
                  {(Object.keys(variantMeta) as BenchmarkVariant[]).map((variant) => (
                    <div className="metric" key={variant}>
                      <span>{variantMeta[variant].label}</span>
                      <strong>{benchmarkTotals[variant]} resources</strong>
                    </div>
                  ))}
                </div>
              )}

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
                disabled={suiteRunning}
              >
                {suiteRunning ? 'Running full suite…' : 'Run five-run suite'}
              </button>
              {suite && (
                <>
                  <button className="text-button" type="button" onClick={() => downloadResearchSuite(suite, 'json')}>
                    <DownloadIcon /> JSON
                  </button>
                  <button className="text-button" type="button" onClick={() => downloadResearchSuite(suite, 'csv')}>
                    <DownloadIcon /> CSV
                  </button>
                </>
              )}
            </div>
            {suite && (
              <div className="suite-summary" aria-live="polite">
                {(Object.keys(variantMeta) as BenchmarkVariant[]).map((variant) => (
                  <div key={variant}>
                    <span>{variantMeta[variant].label}</span>
                    <strong>{suite.summary[variant].mean.toFixed(1)}</strong>
                    <small>
                      range {suite.summary[variant].minimum}–{suite.summary[variant].maximum},
                      variance {suite.summary[variant].variance.toFixed(2)}
                    </small>
                  </div>
                ))}
              </div>
            )}
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

// Your cache policy decides when this happens.
cache.evict(GLTFLoader, '/shoe.glb')`}</code></pre>
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
