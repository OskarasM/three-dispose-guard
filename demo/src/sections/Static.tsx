import { ArrowIcon } from '../chrome'
import { REPO_URL } from '../site'

/* The three sections that hold no state and take no props. Grouped because
 * splitting a nine-line band into its own module is filing, not architecture. */

/** Full-bleed accent band. Punctuation, used twice on the page and no more. */
export function PrincipleStrip() {
  return (
    <section className="principle-strip" aria-label="Core principle">
      <p>Collection is not disposal. Unmount is not ownership.</p>
      <span>The safe moment is when owners, borrowers and cache protections all reach zero.</span>
    </section>
  )
}

export function Limits() {
  return (
    <section className="limits section-shell" aria-labelledby="limits-title">
      <span className="section-number">04 / HONEST LIMITS</span>
      <h2 id="limits-title">What this cannot decide for you.</h2>
      <div className="limits-grid">
        <p><strong>GPU bytes</strong> Three.js reports resource counts, not driver allocation size.</p>
        <p><strong>Context lifecycle</strong> The host still owns renderer disposal and context loss.</p>
        <p><strong>Foreign caches</strong> Every external cache needs an explicit protection or custom collector.</p>
        <p><strong>No dispose method</strong> Resources without a disposal capability remain outside the guarantee.</p>
      </div>
    </section>
  )
}

export function CtaBand() {
  return (
    <section className="cta section-shell" aria-labelledby="cta-title">
      <div>
        <span className="section-number">AUDIT BEFORE DISPOSAL</span>
        <h2 id="cta-title">Make ownership visible.</h2>
      </div>
      <a className="button button-large" href={REPO_URL}>
        Read the full guide <ArrowIcon />
      </a>
    </section>
  )
}
