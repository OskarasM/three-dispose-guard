import { DownloadIcon, SectionHeading } from '../chrome'
import { SuiteSummaryTable } from '../lab/readouts'
import { formatElapsed } from '../site'
import type { ResearchSuite } from '../research-lab'

export interface FindingsProps {
  suite: ResearchSuite | null
  suiteRunning: boolean
  running: boolean
  suiteElapsedSeconds: number
  suiteStatus: string
  onRunSuite: () => void
  onDownload: (format: 'json' | 'csv') => void
}

export function Findings({
  suite,
  suiteRunning,
  running,
  suiteElapsedSeconds,
  suiteStatus,
  onRunSuite,
  onDownload,
}: FindingsProps) {
  return (
    <section id="findings" className="findings section-shell" aria-labelledby="findings-title">
      <SectionHeading
        kicker="02 / WHAT THE DATA MEANS"
        title="Use the smallest ownership system that is correct."
        titleId="findings-title"
      >
        Dispose Guard does not compete with declarative R3F cleanup. It covers the point
        where a component is no longer the only authority over a resource.
      </SectionHeading>

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
            onClick={onRunSuite}
            disabled={suiteRunning || running}
          >
            {suiteRunning ? `Running · ${formatElapsed(suiteElapsedSeconds)}` : 'Run five-run suite'}
          </button>
          {suite && (
            <>
              <button className="text-button" type="button" onClick={() => onDownload('json')}>
                <DownloadIcon /> JSON
              </button>
              <button className="text-button" type="button" onClick={() => onDownload('csv')}>
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
  )
}
