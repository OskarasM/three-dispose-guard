import type { BenchmarkReport, SharedAssetProof } from './webgl-lab'
import type {
  ResearchSuite,
  ScenarioId,
  ScenarioReport,
} from './research-lab'

declare global {
  interface Window {
    __disposeGuard: {
      runBenchmark: (cycles?: number) => Promise<BenchmarkReport>
      runSharedProof: () => Promise<SharedAssetProof>
      runScenario: (scenario: ScenarioId, cycles?: number) => Promise<ScenarioReport>
      runResearchSuite: (runs?: number, cyclesPerRun?: number) => Promise<ResearchSuite>
    }
  }
}

export {}
