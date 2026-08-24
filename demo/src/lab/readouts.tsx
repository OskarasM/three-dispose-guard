/* Everything that renders a measurement. Charts and tables only: no state, no
 * running, no fetching. Each one takes a finished result and draws it, which is
 * why they are all trivially testable and why the chart can carry a text
 * description without asking anyone.
 */

import type { BenchmarkVariant, MemorySample } from '../webgl-lab'
import type { ResearchSuite, ScenarioReport } from '../research-lab'
import { variantMeta, variants } from '../site'

interface MemoryChartProps {
  series: Partial<Record<BenchmarkVariant, MemorySample[]>>
  running: boolean
}

export function MemoryChart({ series, running }: MemoryChartProps) {
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
          <p>{running ? 'Running the selected WebGL proof...' : 'Select a scenario, then run its proof'}</p>
        </div>
      )}
      <div className="chart-axis-label chart-axis-y">Three.js resources</div>
      <div className="chart-axis-label chart-axis-x">mount cycles</div>
    </div>
  )
}

export function AssertionList({ report }: { report: ScenarioReport | null }) {
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

export function ComparisonTable({ report }: { report: ScenarioReport }) {
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

export function ResourceMetricsTable({ totals }: { totals: Record<BenchmarkVariant, number> }) {
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

export function SuiteSummaryTable({ suite }: { suite: ResearchSuite }) {
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
              <td>{suite.summary[variant].minimum}-{suite.summary[variant].maximum}</td>
              <td>{suite.summary[variant].variance.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
