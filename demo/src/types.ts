import type { BenchmarkReport, SharedAssetProof } from './webgl-lab'

declare global {
  interface Window {
    __disposeGuard: {
      runBenchmark: (cycles?: number) => Promise<BenchmarkReport>
      runSharedProof: () => SharedAssetProof
    }
  }
}

export {}
