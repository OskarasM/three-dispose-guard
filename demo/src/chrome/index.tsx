/* The portable half of the site.
 *
 * These are the pieces the other two sites in this set reuse verbatim: the
 * header and footer, the numbered section heading, the install command with its
 * copy states, the code card, and the tab picker with its fieldset and
 * aria-pressed semantics. They carry no colour and no project-specific string,
 * so they read from the shared tokens and take everything else as props.
 *
 * One file rather than seven, because the unit of reuse is "copy this into the
 * next repo", and one file is what that copies.
 */

import { useState, type ReactNode } from 'react'

export function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
      <path d="M4 10h11M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
      <path d="M10 3v9m0 0 4-4m-4 4L6 8M4 15h12" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

export function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
      <rect x="6" y="6" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 12H3V3h9v1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

interface BrandProps {
  /** Split so the second half can take the accent colour. */
  name: readonly [string, string]
  href?: string
  label?: string
}

export function Brand({ name, href = '#top', label }: BrandProps) {
  return (
    <a className="brand" href={href} {...(label ? { 'aria-label': label } : {})}>
      <span className="brand-mark" aria-hidden="true"><span /></span>
      <span>{name[0]}<span className="brand-accent">{name[1]}</span></span>
    </a>
  )
}

export function SiteHeader({
  name,
  nav,
  sourceUrl,
}: {
  name: readonly [string, string]
  nav: readonly { href: string; label: string }[]
  sourceUrl: string
}) {
  return (
    <header className="site-header">
      <Brand name={name} label={`${name[0]}${name[1]} home`} />
      <nav aria-label="Primary navigation">
        {nav.map((item) => (
          <a key={item.href} href={item.href}>{item.label}</a>
        ))}
      </nav>
      <a className="header-link" href={sourceUrl}>
        Source <ArrowIcon />
      </a>
    </header>
  )
}

export function SiteFooter({
  name,
  blurb,
  links,
}: {
  name: readonly [string, string]
  blurb: string
  links?: readonly { href: string; label: string }[]
}) {
  return (
    <footer className="site-footer section-shell">
      <Brand name={name} />
      <p>{blurb}</p>
      <nav className="footer-links" aria-label="Related projects">
        {links?.map((link) => (
          <a key={link.href} href={link.href}>{link.label}</a>
        ))}
        <a href="#top">Back to top</a>
      </nav>
    </footer>
  )
}

/** The kicker, the heading and the optional lede beside it. */
export function SectionHeading({
  kicker,
  title,
  titleId,
  children,
}: {
  kicker: string
  title: string
  titleId: string
  children?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="section-number">{kicker}</span>
        <h2 id={titleId}>{title}</h2>
      </div>
      {children ? <p>{children}</p> : null}
    </div>
  )
}

/** Copy states are part of the component: a button that silently does nothing
 *  when the clipboard is unavailable is worse than one that says so. */
export function InstallCommand({ command, id = 'install-command' }: { command: string; id?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(command)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div className="install-command">
      <code id={id}>{command}</code>
      <button className="copy-button" type="button" aria-describedby={id} onClick={copy}>
        <CopyIcon /> {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy'}
      </button>
    </div>
  )
}

export function CodeCard({
  filename,
  status,
  children,
}: {
  filename: string
  status?: string
  children: string
}) {
  return (
    <article className="quickstart-code">
      <div className="code-header">
        <span>{filename}</span>
        {status ? <span className="code-status">{status}</span> : null}
      </div>
      <pre><code>{children}</code></pre>
    </article>
  )
}

/** A tab strip that is a real fieldset with a real legend, so a screen reader
 *  announces what the group is for before announcing which tab is pressed. */
export function TabPicker<Id extends string>({
  legend,
  tabs,
  selected,
  onSelect,
  disabled = false,
  className = 'scenario-picker',
  tabClassName = 'scenario-tab',
}: {
  legend: string
  tabs: readonly { id: Id; index?: string; title: string }[]
  selected: Id
  onSelect: (id: Id) => void
  disabled?: boolean
  className?: string
  tabClassName?: string
}) {
  return (
    <fieldset className={className} disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={tabClassName}
          type="button"
          aria-pressed={selected === tab.id}
          onClick={() => onSelect(tab.id)}
        >
          {tab.index ? <span>{tab.index}</span> : null}
          {tab.title}
        </button>
      ))}
    </fieldset>
  )
}
