'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

export function MobileMenu() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-all"
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 bg-white border-b border-stone-200 shadow-lg md:hidden z-50">
          <nav className="container mx-auto px-4 py-3 flex flex-col gap-0.5">
            <Link href="/#features" onClick={close} className="px-3 py-2.5 text-sm font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-colors">
              Features
            </Link>
            <Link href="/#pricing" onClick={close} className="px-3 py-2.5 text-sm font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-colors">
              Pricing
            </Link>
            <Link href="/blog" onClick={close} className="px-3 py-2.5 text-sm font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-colors">
              Field Notes
            </Link>
            <Link href="/about" onClick={close} className="px-3 py-2.5 text-sm font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-colors">
              About
            </Link>
            <div className="border-t border-stone-100 mt-1.5 pt-1.5">
              <Link href="/auth/login" onClick={close} className="px-3 py-2.5 text-sm font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-colors block">
                Log in
              </Link>
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
