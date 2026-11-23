import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { Aperture, X } from 'lucide-react'
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { productName, registrationVersion } from '../release.json'

export const enter = { opacity: 0, y: 8 }
export const visible = { opacity: 1, y: 0 }
export const leave = { opacity: 0, y: -6 }
export const timing = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }

export function Brand() {
  return <a className="brand" href="#/">
    <span className="brand-icon"><Aperture size={21} strokeWidth={2} /></span>
    <span>{productName}</span><small className="brand-version">{registrationVersion}</small>
  </a>
}

export function useMenuDismiss(open: boolean, close: (open: boolean) => void) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function pointer(event: PointerEvent) {
      if (event.target instanceof Node && !host.current?.contains(event.target)) close(false)
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      close(false)
      host.current?.querySelector('button')?.focus()
    }
    document.addEventListener('pointerdown', pointer)
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('pointerdown', pointer)
      document.removeEventListener('keydown', keyboard)
    }
  }, [open, close])
  return host
}

export function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" {...props} className={'icon-button ' + (props.className ?? '')}
    title={label} aria-label={label}>{children}</button>
}

export function Modal({ open, onClose, title, description, children, className }: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  children: ReactNode
  className?: string
}) {
  return <Dialog.Root open={open} onOpenChange={state => { if (!state) onClose() }}>
    <AnimatePresence>
      {open && <Dialog.Portal key="modal" forceMount>
        <Dialog.Overlay asChild forceMount>
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} transition={timing} />
        </Dialog.Overlay>
        <Dialog.Content asChild forceMount>
          <motion.div className={'modal ' + (className ?? '')} initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} transition={timing}>
            <Dialog.Close asChild><IconButton className="modal-close" label="关闭"><X size={19} /></IconButton></Dialog.Close>
            <Dialog.Title className="modal-title">{title}</Dialog.Title>
            <Dialog.Description className="modal-description">{description}</Dialog.Description>
            {children}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>}
    </AnimatePresence>
  </Dialog.Root>
}

export function EditText({ value, label, onCommit, multiline = false, required = false, numeric = false }: {
  value: string
  label: string
  onCommit: (value: string, group: string) => void
  multiline?: boolean
  required?: boolean
  numeric?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const group = useRef<string | undefined>(undefined)
  useEffect(() => { if (!group.current) setDraft(value) }, [value])
  const lastSent = useRef(value)
  function validate(text: string) {
    if (required && !text.trim()) return undefined
    if (numeric) {
      const number = Number(text)
      if (!Number.isFinite(number) || number <= 0 || number > 3600) return undefined
      return String(number)
    }
    return text
  }
  function change(text: string) {
    setDraft(text)
    const next = validate(text)
    if (!group.current) group.current = crypto.randomUUID()
    if (next !== undefined && next !== lastSent.current) {
      lastSent.current = next
      onCommit(next, group.current)
    }
  }
  const focus = () => { lastSent.current = value; group.current = crypto.randomUUID() }
  const blur = () => {
    if (validate(draft) === undefined) setDraft(lastSent.current)
    else if (numeric) setDraft(lastSent.current)
    group.current = undefined
  }
  return <label className="field">
    <span>{label}</span>
    {multiline
      ? <textarea value={draft} onFocus={focus} onChange={event => change(event.target.value)} onBlur={blur} maxLength={5000} rows={3} />
      : <input value={draft} required={required} inputMode={numeric ? 'decimal' : undefined} maxLength={120} onFocus={focus}
          onChange={event => change(event.target.value)} onBlur={blur}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />}
  </label>
}
