import { useEffect, useRef, useState } from 'react'
import type { BenchmarkReport, MemorySample, SharedAssetProof } from './webgl-lab'
import { mountHeroScene, runBenchmark, runSharedAssetProof } from './webgl-lab'

const codeExample = `const guard = createResourceRegistry({ mode: 'dispose' })

const first = guard.acquire(model, {
  ownership: 'owned',
  label: 'product card A',
})
const second = guard.acquire(model, {
  ownership: 'owned',
  label: 'product card B',
})

first.release()   // shared GPU resources survive
second.release()  // final owner releases, dispose runs`

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
      <path d="M4 10h11M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
      <path d="m4 10 4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function HeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    return mountHeroScene(canvasRef.current)
  }, [])

  return (
    <div className="hero-visual" aria-label="Live WebGL scene with two shared resource layers">
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="visual-label visual-label-top">
        <span className="live-dot" />
        WebGL 2 live
      </div>
      <div className="visual-label visual-label-bottom">
        <span>2 owners</span>
        <strong>1 GPU resource</strong>
      </div>
      <div className="orbital-line orbital-line-a" />
      <div className="orbital-line orbital-line-b" />
    </div>
  )
}

interface ChartProps {
  unmanaged: MemorySample[]
  guarded: MemorySample[]
  running: boolean
}

function MemoryChart({ unmanaged, guarded, running }: ChartProps) {
  const width = 760
  const height = 250
  const inset = 24
  const all = [...unmanaged, ...guarded]
  const maxCycle = Math.max(1, ...all.map((sample) => sample.cycle))
  const maxValue = Math.max(4, ...all.map((sample) => sample.geometries + sample.textures))
  const points = (samples: MemorySample[]) => samples
    .map((sample) => {
      const x = inset + (sample.cycle / maxCycle) * (width - inset * 2)
      const total = sample.geometries + sample.textures
      const y = height - inset - (total / maxValue) * (height - inset * 2)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="chart-wrap">
      <svg
        className="memory-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby="chart-title chart-description"
      >
        <title id="chart-title">Allocated Three.js resource count by mount cycle</title>
        <desc id="chart-description">
          The unmanaged line shows resources retained after unmount. The guarded line shows
          resources after ownership-aware disposal.
        </desc>
        {[0, 1, 2, 3, 4].map((line) => {
          const y = inset + (line / 4) * (height - inset * 2)
          return <line key={line} x1={inset} x2={width - inset} y1={y} y2={y} className="grid-line" />
        })}
        <line x1={inset} x2={inset} y1={inset} y2={height - inset} className="axis-line" />
        <line x1={inset} x2={width - inset} y1={height - inset} y2={height - inset} className="axis-line" />
        {unmanaged.length > 0 && (
          <polyline className="chart-line chart-line-unmanaged" points={points(unmanaged)} />
        )}
        {guarded.length > 0 && (
          <polyline className="chart-line chart-line-guarded" points={points(guarded)} />
        )}
      </svg>
      {all.length === 0 && (
        <div className="chart-empty">
          <span className="chart-empty-mark">50</span>
          <p>{running ? 'Measuring live WebGL allocations…' : 'Run the local 50-cycle measurement'}</p>
        </div>
      )}
      <div className="chart-axis-label chart-axis-y">resources</div>
      <div className="chart-axis-label chart-axis-x">mount cycles</div>
    </div>
  )
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function AppHeader() {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Three Dispose Guard home">
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span>dispose<span className="brand-accent">guard</span></span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="#lab">Live test</a>
        <a href="#model">Ownership</a>
        <a href="#guide">Guide</a>
      </nav>
      <a className="header-link" href="https://github.com/OskarasM/three-dispose-guard">
        View source <ArrowIcon />
      </a>
    </header>
  )
}

export function App() {
  const [report, setReport] = useState<BenchmarkReport | null>(null)
  const [unmanaged, setUnmanaged] = useState<MemorySample[]>([])
  const [guarded, setGuarded] = useState<MemorySample[]>([])
  const [sharedProof, setSharedProof] = useState<SharedAssetProof | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startBenchmark = async () => {
    setRunning(true)
    setError(null)
    setReport(null)
    setUnmanaged([])
    setGuarded([])
    try {
      const nextReport = await runBenchmark(50, {
        onUnmanagedSample: (sample) => setUnmanaged((current) => [...current, sample]),
        onGuardedSample: (sample) => setGuarded((current) => [...current, sample]),
      })
      setReport(nextReport)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The WebGL test could not run.')
    } finally {
      setRunning(false)
    }
  }

  const verifySharedAsset = () => {
    setError(null)
    try {
      setSharedProof(runSharedAssetProof())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The shared resource proof could not run.')
    }
  }

  const unmanagedTotal = report
    ? report.unmanaged.final.geometries + report.unmanaged.final.textures
    : null
  const guardedTotal = report
    ? report.guarded.final.geometries + report.guarded.final.textures
    : null

  return (
    <div id="top">
      <AppHeader />
      <main id="main">
        <section className="hero section-shell" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span>v0.1</span> Safe GPU resource lifecycle</div>
            <h1 id="hero-title">Dispose what is <em>orphaned.</em><br />Protect what is shared.</h1>
            <p className="hero-lede">
              Ownership-aware cleanup for Three.js. Measure leaks, track every user and release
              GPU resources only when the final owner is genuinely finished.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#lab">Run the live test <ArrowIcon /></a>
              <code>npm i three-dispose-guard</code>
            </div>
            <ul className="trust-list" aria-label="Package guarantees">
              <li><CheckIcon /> Audit-only by default</li>
              <li><CheckIcon /> Zero runtime dependencies</li>
              <li><CheckIcon /> Shared-asset tests</li>
            </ul>
          </div>
          <HeroScene />
        </section>

        <section className="principle-strip" aria-label="Core principle">
          <p>JavaScript collection is not GPU disposal.</p>
          <span>Three.js keeps WebGL resources until <code>dispose()</code> is called.</span>
        </section>

        <section id="lab" className="lab section-shell" aria-labelledby="lab-title">
          <div className="section-heading">
            <div>
              <span className="section-number">01 / LIVE LAB</span>
              <h2 id="lab-title">Watch the memory graph choose a direction.</h2>
            </div>
            <p>
              Both runs create four unique geometries and textures per cycle. Only the second
              run releases an owned scope after every unmount.
            </p>
          </div>

          <div className="lab-panel">
            <div className="lab-toolbar">
              <div className="chart-legend" aria-label="Chart legend">
                <span><i className="legend-unmanaged" /> unmanaged</span>
                <span><i className="legend-guarded" /> dispose guard</span>
              </div>
              <button className="button button-run" type="button" onClick={startBenchmark} disabled={running}>
                <span className={running ? 'run-icon is-running' : 'run-icon'} aria-hidden="true" />
                {running ? 'Running measurement' : 'Run 50 cycles'}
              </button>
            </div>

            <MemoryChart unmanaged={unmanaged} guarded={guarded} running={running} />

            <div className="metric-grid" aria-live="polite">
              <Metric label="Unmanaged after 50" value={unmanagedTotal === null ? 'not run' : `${unmanagedTotal} resources`} tone="warn" />
              <Metric label="Guarded after 50" value={guardedTotal === null ? 'not run' : `${guardedTotal} resources`} tone="safe" />
              <Metric label="Cycles measured" value={report ? String(report.cycles) : '0'} />
              <Metric label="Signal" value="renderer.info" />
            </div>

            {report && (
              <div className="measurement-note">
                <span className="live-dot" />
                Captured locally at {new Date(report.measuredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <span className="device-name">{report.renderer}</span>
              </div>
            )}
            {error && <p className="error-message" role="alert">{error}</p>}
          </div>
        </section>

        <section id="model" className="ownership section-shell" aria-labelledby="ownership-title">
          <div className="section-heading section-heading-compact">
            <div>
              <span className="section-number">02 / OWNERSHIP MODEL</span>
              <h2 id="ownership-title">Reference counts solve the easy part. Ownership solves the dangerous part.</h2>
            </div>
          </div>

          <div className="ownership-grid">
            <article className="ownership-card ownership-card-wide">
              <div className="card-kicker">Shared asset proof</div>
              <h3>One texture, two live users.</h3>
              <p>
                The test renders an actual WebGL texture, releases the first mesh and checks the
                underlying GPU handle. Disposal is allowed only after the second release.
              </p>
              <div className="owner-diagram" aria-label="Two owners reference one protected texture">
                <div className="owner-node"><span>A</span> owner 1</div>
                <div className="connector connector-left" />
                <div className="resource-node"><span className="resource-core" />GPU texture</div>
                <div className="connector connector-right" />
                <div className="owner-node"><span>B</span> owner 2</div>
              </div>
              <button className="button button-secondary" type="button" onClick={verifySharedAsset}>
                Verify in this browser <ArrowIcon />
              </button>
              {sharedProof && (
                <div className="proof-result" aria-live="polite">
                  <span className={sharedProof.survivedFirstRelease ? 'proof-pass' : 'proof-fail'}>
                    <CheckIcon /> First release: {sharedProof.survivedFirstRelease ? 'GPU handle preserved' : 'failed'}
                  </span>
                  <span className={sharedProof.disposedAfterLastRelease ? 'proof-pass' : 'proof-fail'}>
                    <CheckIcon /> Final release: {sharedProof.disposedAfterLastRelease ? 'resource disposed' : 'failed'}
                  </span>
                </div>
              )}
            </article>

            <article className="ownership-card ownership-card-code">
              <div className="code-header">
                <span>ownership.ts</span>
                <span className="code-status">deterministic</span>
              </div>
              <pre><code>{codeExample}</code></pre>
            </article>

            <article className="ownership-card rule-card rule-audit">
              <span className="rule-index">A</span>
              <h3>Audit first</h3>
              <p>The default mode reports orphan candidates without mutating live resources.</p>
            </article>
            <article className="ownership-card rule-card rule-cache">
              <span className="rule-index">B</span>
              <h3>Protect caches</h3>
              <p>A cache protection survives component releases and lifts only during explicit eviction.</p>
            </article>
            <article className="ownership-card rule-card rule-borrow">
              <span className="rule-index">C</span>
              <h3>Borrow safely</h3>
              <p>Borrowed assets are visible to diagnostics, but never become disposal candidates.</p>
            </article>
          </div>
        </section>

        <section id="guide" className="guide section-shell" aria-labelledby="guide-title">
          <div className="guide-intro">
            <span className="section-number">03 / THE HONEST GUIDE</span>
            <h2 id="guide-title">R3F is not the leak. Ambiguous ownership is.</h2>
            <p>
              React Three Fiber already attempts to dispose declarative objects on unmount. Cached
              <code>useLoader</code> assets and primitive objects are the exception that needs an
              explicit lifecycle, not another blind traversal.
            </p>
          </div>
          <ol className="guide-steps">
            <li>
              <span>01</span>
              <div><h3>Observe</h3><p>Start in audit mode and name every scope.</p></div>
            </li>
            <li>
              <span>02</span>
              <div><h3>Declare</h3><p>Mark roots as owned, borrowed or cache-protected.</p></div>
            </li>
            <li>
              <span>03</span>
              <div><h3>Prove</h3><p>Test shared handles before enabling disposal.</p></div>
            </li>
          </ol>
        </section>

        <section className="cta section-shell" aria-labelledby="cta-title">
          <div>
            <span className="section-number">READY WHEN OWNERSHIP IS</span>
            <h2 id="cta-title">Make your memory graph boring.</h2>
          </div>
          <a className="button button-primary button-large" href="https://github.com/OskarasM/three-dispose-guard">
            Read the guide <ArrowIcon />
          </a>
        </section>
      </main>

      <footer className="site-footer section-shell">
        <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true"><span /></span> disposeguard</a>
        <p>Ownership-aware Three.js cleanup. MIT licensed.</p>
        <a href="#top">Back to top</a>
      </footer>
    </div>
  )
}
