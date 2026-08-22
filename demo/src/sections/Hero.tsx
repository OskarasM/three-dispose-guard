import { useEffect, useRef, useState } from 'react'
import { ArrowIcon, InstallCommand } from '../chrome'
import { INSTALL_COMMAND } from '../site'
import type { HeroOwnershipState } from '../webgl-lab'

/* The hero canvas is the one thing on the page that has to survive a machine
 * with no WebGL2, so its three states are explicit and the label says which one
 * you are looking at rather than leaving a blank rectangle. */
function HeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [webglStatus, setWebglStatus] = useState<'initialising' | 'live' | 'fallback'>(
    'initialising',
  )
  const [ownership, setOwnership] = useState<HeroOwnershipState | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    })
    if (!context) {
      setWebglStatus('fallback')
      return
    }

    let cancelled = false
    let unmount: (() => void) | undefined

    void import('../webgl-lab')
      .then(({ mountHeroScene }) => {
        if (cancelled) return
        try {
          unmount = mountHeroScene(canvas, setOwnership)
          setWebglStatus('live')
        } catch {
          setWebglStatus('fallback')
        }
      })
      .catch(() => {
        if (!cancelled) setWebglStatus('fallback')
      })

    return () => {
      cancelled = true
      unmount?.()
    }
  }, [])

  const liveLabel = webglStatus === 'fallback'
    ? 'Static fallback'
    : webglStatus === 'live'
      ? 'WebGL live'
      : 'Initialising WebGL'

  return (
    <div
      className="hero-visual"
      role="img"
      aria-label={webglStatus === 'fallback'
        ? 'Static illustration of three components sharing one GPU asset'
        : 'Live WebGL scene: three components release one shared GPU asset in turn'}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="visual-label visual-label-top">
        {webglStatus === 'live' && <span className="live-dot" />}
        {liveLabel}
      </div>
      <div className="visual-label visual-label-bottom">
        <span>owners</span>
        <strong className={ownership && ownership.owners === 0 ? 'is-zero' : undefined}>
          {ownership ? `${ownership.owners} / 3` : '3 / 3'}
        </strong>
        <span className="visual-verdict">
          {ownership?.alive === false ? 'disposed' : 'shared asset alive'}
        </span>
      </div>
      <div className="orbital-line orbital-line-a" />
      <div className="orbital-line orbital-line-b" />
      <p className="sr-only" role="status" aria-live="polite">
        {ownership
          ? ownership.owners > 0
            ? `${ownership.owners} of 3 components still own the shared asset, so it stays on the GPU.`
            : 'The last owner released. The shared asset is disposed.'
          : 'Three components share one geometry, one texture and one material.'}
      </p>
    </div>
  )
}

export function Hero() {
  return (
    <section className="hero section-shell" aria-labelledby="hero-title">
      <div className="hero-copy">
        <div className="eyebrow"><span>v0.1</span> WebGL ownership, measured</div>
        <h1 id="hero-title">Dispose the orphan.<br /><em>Keep the shared.</em></h1>
        <p className="hero-lede">
          Three components, one geometry, one texture. Watch them let go one at a time:
          the asset survives until the last owner releases it. A zero-runtime-dependency
          ownership layer for Three.js, plus a reproducible lab for the shared and cached
          cases that ordinary unmount cleanup cannot decide.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href="#lab">Open the research lab <ArrowIcon /></a>
          <InstallCommand command={INSTALL_COMMAND} />
        </div>
        <ul className="trust-list" aria-label="Package guarantees">
          <li><span aria-hidden="true">01</span> Audit-only default</li>
          <li><span aria-hidden="true">02</span> R3F cache adapter</li>
          <li><span aria-hidden="true">03</span> Raw measurements</li>
        </ul>
      </div>
      <HeroScene />
    </section>
  )
}
