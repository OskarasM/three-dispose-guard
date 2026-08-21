import { createRoot } from 'react-dom/client'
import { ResearchApp } from './ResearchApp'
import { runBenchmark, runSharedAssetProof } from './webgl-lab'
import { runResearchSuite, runScenario } from './research-lab'
import './styles.css'
import './a11y.css'
import './research.css'
import './types'

window.__disposeGuard = {
  runBenchmark,
  runSharedProof: runSharedAssetProof,
  runScenario,
  runResearchSuite,
}

createRoot(document.getElementById('root')!).render(<ResearchApp />)
