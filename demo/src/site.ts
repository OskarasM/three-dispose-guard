// Everything on the page that is a fact about this project rather than a fact
// about the layout. Kept apart so the sections stay presentational and the two
// sibling sites can copy a section without dragging this repo's strings along.

import type { BenchmarkVariant } from './webgl-lab'
import type { ScenarioId } from './research-model'

export const REPO_URL = 'https://github.com/OskarasM/three-dispose-guard'
export const INSTALL_COMMAND = 'npm i three-dispose-guard'
export const API_GUIDE_URL = `${REPO_URL}/blob/main/docs/api.md`
export const R3F_GUIDE_URL = `${REPO_URL}/blob/main/docs/r3f-guide.md`

export const variantMeta: Record<BenchmarkVariant, { label: string; className: string }> = {
  unmanaged: { label: 'unmanaged', className: 'series-unmanaged' },
  naive: { label: 'naïve eager', className: 'series-naive' },
  native: { label: 'native R3F', className: 'series-native' },
  guarded: { label: 'Dispose Guard', className: 'series-guarded' },
}

export const variants = Object.keys(variantMeta) as BenchmarkVariant[]

export const flowByScenario: Record<ScenarioId, readonly string[]> = {
  unique: ['mount', 'allocate', 'unmount', 'release'],
  shared: ['owner A', 'owner B', 'release A', 'release B'],
  cache: ['load', 'protect cache', 'zero users', 'evict'],
  canvas: ['mount Canvas', 'release scene', 'dispose renderer', 'remount'],
  churn: ['acquire next', 'release previous', 'repeat', 'evict pool'],
  'in-flight': ['request', 'evict', 'late resolve', 'clean stale'],
}

export const formatElapsed = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
