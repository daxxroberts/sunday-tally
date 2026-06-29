import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#FAFAFA] text-stone-900 selection:bg-stone-200 flex flex-col font-sans">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-stone-200/80 bg-white/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-stone-900 text-white flex items-center justify-center font-extrabold text-lg shadow-sm">
              S
            </div>
            <Link href="/" className="text-xl font-bold tracking-tight text-stone-900 hover:opacity-85 transition-opacity">
              Sunday Tally
            </Link>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-stone-600">
            <Link href="/#features" className="hover:text-stone-900 transition-colors">Features</Link>
            <Link href="/#pricing" className="hover:text-stone-900 transition-colors">Pricing</Link>
            <Link href="/blog" className="hover:text-stone-900 transition-colors">Field Notes</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link 
              href="/auth/login" 
              className="hidden md:block text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors"
            >
              Log in
            </Link>
            <Link 
              href="/auth/login" 
              className="rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#4F6EF7] transition-all hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200/80 bg-white py-12 md:py-16">
        <div className="container mx-auto px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-extrabold text-md shadow-sm">
              S
            </div>
            <span className="text-lg font-bold text-stone-900 tracking-tight">Sunday Tally</span>
          </div>
          <p className="text-sm text-stone-500 font-medium">
            © {new Date().getFullYear()} Sunday Tally. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm font-medium text-stone-500">
            <Link href="/#features" className="hover:text-stone-900 transition-colors">Features</Link>
            <Link href="/#pricing" className="hover:text-[#4F6EF7] transition-colors">Pricing</Link>
            <Link href="/blog" className="hover:text-[#4F6EF7] transition-colors">Field Notes</Link>
            <Link href="/about" className="hover:text-[#4F6EF7] transition-colors">About</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

