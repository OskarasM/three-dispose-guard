import { ArrowIcon, CodeCard } from '../chrome'
import { API_GUIDE_URL, R3F_GUIDE_URL } from '../site'

const example = `const registry = createResourceRegistry({
  mode: 'dispose',
})

const cache = createR3FResourceCache({ registry })

<R3FResourceCacheProvider cache={cache}>
  <ProductModel />
</R3FResourceCacheProvider>

function ProductModel() {
  const gltf = useGuardedLoader(GLTFLoader, '/shoe.glb')
  return <GuardedPrimitive object={gltf.scene} />
}

// Your cache policy decides when this runs.
// Never evict at module load.
export function releaseProductAssets() {
  cache.evict(GLTFLoader, '/shoe.glb')
}`

export function QuickStart() {
  return (
    <section id="quickstart" className="quickstart section-shell" aria-labelledby="quickstart-title">
      <div className="quickstart-copy">
        <span className="section-number">03 / FIVE-MINUTE START</span>
        <h2 id="quickstart-title">Make the cache an owner.</h2>
        <p>
          Use one cache guard for one R3F loader cache. Consumers borrow automatically;
          eviction is the only action that removes the cache protection.
        </p>
        <ol className="guide-steps compact-steps">
          <li><span>01</span><div><h3>Create</h3><p>Choose audit mode first, then enable disposal after reviewing events.</p></div></li>
          <li><span>02</span><div><h3>Provide</h3><p>Share one cache guard across every consumer of the same loader entries.</p></div></li>
          <li><span>03</span><div><h3>Evict</h3><p>Clear through the guard when the application cache policy expires.</p></div></li>
        </ol>
        <nav className="quickstart-links" aria-label="Developer documentation">
          <a href={R3F_GUIDE_URL}>
            R3F migration guide <ArrowIcon />
          </a>
          <a href={API_GUIDE_URL}>
            API reference <ArrowIcon />
          </a>
        </nav>
      </div>
      <CodeCard filename="ProductModel.tsx" status="cache safe">{example}</CodeCard>
    </section>
  )
}
