import { createRoot } from 'react-dom/client'
import { ResearchApp } from './ResearchApp'
import './fonts.css'
import './tokens.css'
import './chrome.css'
import './styles.css'
import './research.css'
import './types'

// Every lab entry point loads on demand so the first paint does not carry
// Three.js and React Three Fiber. The visible controls use the same chunks.
window.__disposeGuard = {
  runBenchmark: async (cycles) => (await import('./webgl-lab')).runBenchmark(cycles),
  runSharedProof: async () => (await import('./webgl-lab')).runSharedAssetProof(),
  runScenario: async (scenario, cycles) =>
    (await import('./research-lab')).runScenario(scenario, cycles),
  runResearchSuite: async (runs, cyclesPerRun) =>
    (await import('./research-lab')).runResearchSuite(runs, cyclesPerRun),
  runR3FStories: async () => (await import('./r3f-stories')).runR3FStories(),
}

createRoot(document.getElementById('root')!).render(<ResearchApp />)
