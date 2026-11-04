import { useState } from 'react'
import { Tex } from '../Tex.tsx'

interface Props {
  label: string
  symbol?: string
  description?: string
  htmlFor?: string
}

/**
 * パラメータ名。説明があるときは、マウスを乗せる（スマホではタップする）と表示する。
 */
export function ParamLabel({ label, symbol, description, htmlFor }: Props) {
  const [open, setOpen] = useState(false)
  const content = (
    <>
      {label}
      {symbol && <Tex tex={symbol} className="ml-1 text-slate-400" />}
    </>
  )
  if (!description) {
    return (
      <label htmlFor={htmlFor} className="text-sm text-slate-300">
        {content}
      </label>
    )
  }
  return (
    <span className="relative text-sm text-slate-300">
      <button
        type="button"
        className="cursor-help text-left underline decoration-slate-600 decoration-dotted underline-offset-4"
        title={description}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {content}
      </button>
      {open && <span className="mt-1 block text-xs leading-relaxed text-slate-400">{description}</span>}
    </span>
  )
}
