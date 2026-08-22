import type { BenchmarkReport, SharedAssetProof } from './webgl-lab'
import type {
  ResearchSuite,
  ScenarioId,
  ScenarioReport,
} from './research-lab'
import type { R3FStoryReport } from './r3f-stories'

declare global {
  interface Window {
    __disposeGuard: {
      runBenchmark: (cycles?: number) => Promise<BenchmarkReport>
      runSharedProof: () => Promise<SharedAssetProof>
      runScenario: (scenario: ScenarioId, cycles?: number) => Promise<ScenarioReport>
      runResearchSuite: (runs?: number, cyclesPerRun?: number) => Promise<ResearchSuite>
      runR3FStories: () => Promise<R3FStoryReport>
    }
  }
}

export {}
