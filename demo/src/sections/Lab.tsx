import { ArrowIcon, DownloadIcon, SectionHeading, TabPicker } from '../chrome'
import { AssertionList, ComparisonTable, MemoryChart, ResourceMetricsTable } from '../lab/readouts'
import { scenarios, type ScenarioId } from '../research-model'
import { flowByScenario, variantMeta, variants } from '../site'
import type { BenchmarkVariant, MemorySample } from '../webgl-lab'
import type { ScenarioReport } from '../research-lab'

function downloadScenario(report: ScenarioReport): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `dispose-guard-${report.scenario}-${report.measuredAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export interface LabProps {
  selected: ScenarioId
  onSelect: (scenario: ScenarioId) => void
  report: ScenarioReport | null
  series: Partial<Record<BenchmarkVariant, MemorySample[]>>
  running: boolean
  suiteRunning: boolean
  error: string | null
  resultStatus: string
  benchmarkTotals: Record<BenchmarkVariant, number> | null
  onRun: () => void
}

export function Lab({
  selected,
  onSelect,
  report,
  series,
  running,
  suiteRunning,
  error,
  resultStatus,
  benchmarkTotals,
  onRun,
}: LabProps) {
  const definition = scenarios.find((scenario) => scenario.id === selected) ?? scenarios[0]

  return (
    <section id="lab" className="lab research-lab section-shell" aria-labelledby="lab-title">
      <SectionHeading
        kicker="01 / REPRODUCIBLE LAB"
        title="Test the edge case you actually have."
        titleId="lab-title"
      >
        Every result is generated in this browser. The graph reports Three.js resource
        counts, never invented GPU-byte estimates.
      </SectionHeading>

      <TabPicker
        legend="Choose a research scenario"
        tabs={scenarios}
        selected={selected}
        onSelect={onSelect}
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
            onClick={onRun}
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
  )
}
