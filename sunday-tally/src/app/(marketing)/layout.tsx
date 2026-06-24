import Link from 'next/link'
import { Sparkles } from 'lucide-react'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#FAFAFA] text-stone-900 selection:bg-stone-200">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-stone-200 bg-[#FAFAFA]/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white">
              <Sparkles size={18} />
            </div>
            <Link href="/" className="text-xl font-bold tracking-tight text-stone-900 hover:opacity-80 transition-opacity">
              Sunday Tally
            </Link>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-500">
            <Link href="/#features" className="hover:text-stone-900 transition-colors">Features</Link>
            <Link href="/#pricing" className="hover:text-stone-900 transition-colors">Pricing</Link>
            <Link href="/contact" className="hover:text-stone-900 transition-colors">Contact</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link 
              href="/auth/login" 
              className="hidden md:block text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
            >
              Log in
            </Link>
            <Link 
              href="/auth/login" 
              className="rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 transition-all hover:scale-105 active:scale-95"
            >
              Start 45-Day Trial
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-12 md:py-16">
        <div className="container mx-auto px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-stone-900 text-white">
              <Sparkles size={12} />
            </div>
            <span className="text-lg font-semibold text-stone-900 tracking-tight">Sunday Tally</span>
          </div>
          <p className="text-sm text-stone-500">
            © {new Date().getFullYear()} Sunday Tally. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-stone-500">
            <Link href="/#features" className="hover:text-stone-900 transition-colors">Features</Link>
            <Link href="/#pricing" className="hover:text-stone-900 transition-colors">Pricing</Link>
            <Link href="/contact" className="hover:text-stone-900 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
