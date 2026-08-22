import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

const root = process.cwd()
const source = process.argv[2] ?? 'benchmarks/results/2026-08-21-windows-chromium.json'
const report = JSON.parse(await readFile(path.join(root, source), 'utf8'))
const isSchemaV2 = report.schemaVersion >= 2
const variants = [
  ['unmanaged', 'UNMANAGED', '#ff6545'],
  ['naive', 'NAÏVE EAGER', '#cf9bff'],
  ['native', isSchemaV2 ? 'NATIVE R3F' : 'DECLARATIVE-STYLE', '#7da8ff'],
  ['guarded', 'DISPOSE GUARD', '#d8ff53'],
]

const width = 1200
const height = 560
const left = 90
const right = 1110
const top = 150
const bottom = 450
const cycles = report.cyclesPerRun
const maximum = Math.max(
  4,
  ...report.benchmarks.flatMap((run) =>
    variants.flatMap(([variant]) =>
      run[variant].samples.map((sample) => sample.geometries + sample.textures),
    ),
  ),
)

const point = (cycle, value) => {
  const x = left + ((cycle - 1) / Math.max(1, cycles - 1)) * (right - left)
  const y = bottom - (value / maximum) * (bottom - top)
  return [x.toFixed(1), y.toFixed(1)]
}

const meanSeries = Object.fromEntries(variants.map(([variant]) => [
  variant,
  Array.from({ length: cycles }, (_, index) => {
    const values = report.benchmarks.map((run) => {
      const sample = run[variant].samples[index]
      return sample.geometries + sample.textures
    })
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }),
]))

const paths = variants.map(([variant, label, colour], index) => {
  const points = meanSeries[variant]
    .map((value, cycle) => point(cycle + 1, value).join(','))
    .join(' ')
  const final = report.summary[variant].mean
  const legendX = 580 + (index % 2) * 280
  const legendY = 62 + Math.floor(index / 2) * 34
  return [
    `<polyline points="${points}" fill="none" stroke="${colour}" stroke-width="${variant === 'unmanaged' ? 5 : 3}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<line x1="${legendX}" y1="${legendY}" x2="${legendX + 34}" y2="${legendY}" stroke="${colour}" stroke-width="4"/>`,
    `<text x="${legendX + 46}" y="${legendY + 5}" fill="#f3f5ee" font-size="12">${label} ${final}</text>`,
  ].join('\n')
}).join('\n')

const ticks = [0, 100, 200, 300, 400].map((value) => {
  const [, y] = point(1, value)
  return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#252a26"/><text x="42" y="${Number(y) + 4}" fill="#68716b" font-size="11">${value}</text>`
}).join('\n')

const description = isSchemaV2
  ? `Unmanaged finishes at ${report.summary.unmanaged.mean}. Naïve eager finishes at ${report.summary.naive.mean}, native R3F at ${report.summary.native.mean}, and Dispose Guard at ${report.summary.guarded.mean}.`
  : 'Unmanaged resources rise to 401. Naïve eager, declarative-style and Dispose Guard each finish at 1 with zero variance for unique resources.'
const footer = isSchemaV2
  ? [
      report.environment?.os,
      `${report.environment?.browser ?? 'browser'} ${report.environment?.browserVersion ?? ''}`.trim(),
      report.environment?.gpuRenderer ?? report.renderer,
      `captured ${String(report.capturedAt ?? report.measuredAt).slice(0, 10)}`,
    ].filter(Boolean).join(' · ')
  : 'Windows 10.0.26200 · Chromium 151.0.7922.34 · ANGLE SwiftShader · captured 2026-08-21'
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Measured Three.js resource counts over five 50-cycle runs</title>
  <desc id="desc">${description}</desc>
  <rect width="${width}" height="${height}" fill="#0b0d0c"/>
  <g font-family="ui-monospace, SFMono-Regular, Consolas, monospace">
    <text x="64" y="58" fill="#f3f5ee" font-size="22" font-weight="700">Five-run WebGL allocation study</text>
    <text x="64" y="86" fill="#9da69e" font-size="13">mean renderer.info.memory geometries + textures, 50 cycles per run</text>
    ${ticks}
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#4a514a"/>
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#4a514a"/>
    ${paths}
    <text x="${left}" y="482" fill="#68716b" font-size="11">cycle 1</text>
    <text x="${right - 58}" y="482" fill="#68716b" font-size="11">cycle 50</text>
    <text x="64" y="525" fill="#9da69e" font-size="11">${footer}</text>
  </g>
</svg>
`

await writeFile(path.join(root, 'docs', 'benchmark-result.svg'), svg, 'utf8')
console.log('Updated docs/benchmark-result.svg from', source)
