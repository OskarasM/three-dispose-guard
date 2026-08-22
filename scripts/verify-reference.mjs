import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  captureToCsv,
  validateCaptureDocument,
} from './research-data.mjs'

const root = process.cwd()
const manifestPath = path.resolve(root, process.argv[2] ?? 'benchmarks/reference.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

if (manifest.schemaVersion !== 1) {
  throw new Error(`Unsupported reference manifest version: ${String(manifest.schemaVersion)}`)
}

const jsonPath = path.resolve(root, manifest.capture)
const csvPath = path.resolve(root, manifest.csv)
const capture = JSON.parse(await readFile(jsonPath, 'utf8'))
const errors = validateCaptureDocument(capture, { requirePassing: true })

if (capture.provenance?.git?.workingTreeDirty !== false) {
  errors.push('The public reference capture must come from a clean working tree.')
}

if (capture.runs < 5 || capture.cyclesPerRun < 50) {
  errors.push('The public reference must contain at least five 50-cycle runs.')
}

const committedCsv = await readFile(csvPath, 'utf8')
const generatedCsv = `${captureToCsv(capture)}\n`
if (committedCsv.replaceAll('\r\n', '\n') !== generatedCsv) {
  errors.push('The committed CSV does not match the reference JSON.')
}

if (errors.length > 0) {
  throw new Error(`Reference verification failed:\n- ${errors.join('\n- ')}`)
}

console.log(
  `Verified ${capture.captureId}: ${capture.runs} runs, ${capture.cyclesPerRun} cycles, six scenarios and matching CSV.`,
)
