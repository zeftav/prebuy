// Shared Tooltip — the canonical way to attach inline help to a non-obvious
// control (Brett's help-from-the-onset rule). Accessible: shows on hover AND
// keyboard focus, dismisses on Escape, and is wired to the trigger via
// aria-describedby so screen readers announce it.
//
// Usage:
//   <Tooltip text="N-number is the aircraft's FAA tail number.">
//     <button>…</button>
//   </Tooltip>
// or the bundled info dot when there's no natural control to wrap:
//   <Tooltip text="…"><InfoDot /></Tooltip>

import { cloneElement, useEffect, useId, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import './Tooltip.css'

export function InfoDot({ label = 'More info' }) {
  return (
    <span className="tooltip__infodot" aria-label={label}>
      <HelpCircle size={15} aria-hidden="true" />
    </span>
  )
}

export default function Tooltip({ text, children, placement = 'top' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const show = () => setOpen(true)
  const hide = () => setOpen(false)

  // Merge our handlers onto the wrapped control so focus/hover both work and we
  // don't clobber any handlers it already had.
  const trigger = cloneElement(children, {
    'aria-describedby': open ? id : undefined,
    onMouseEnter: chain(children.props.onMouseEnter, show),
    onMouseLeave: chain(children.props.onMouseLeave, hide),
    onFocus: chain(children.props.onFocus, show),
    onBlur: chain(children.props.onBlur, hide),
  })

  return (
    <span className="tooltip" ref={wrapRef}>
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={`tooltip__bubble tooltip__bubble--${placement}`}
        data-open={open ? 'true' : 'false'}
      >
        {text}
      </span>
    </span>
  )
}

function chain(existing, added) {
  return (e) => {
    if (typeof existing === 'function') existing(e)
    added(e)
  }
}
