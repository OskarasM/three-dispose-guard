import { createRoot } from 'react-dom/client'
import { App } from './App'
import { runBenchmark, runSharedAssetProof } from './webgl-lab'
import './styles.css'
import './a11y.css'
import './types'

window.__disposeGuard = {
  runBenchmark,
  runSharedProof: runSharedAssetProof,
}

createRoot(document.getElementById('root')!).render(<App />)
