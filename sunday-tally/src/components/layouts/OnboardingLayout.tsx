// OnboardingLayout — linear onboarding. Progress indicator at top.
// No tab bar. Back button. Step counter. (NAV_MANIFEST: OnboardingLayout)
// Branding: S monogram + wordmark top-left. Exit setup link top-right (all steps).

import Link from 'next/link'

interface OnboardingLayoutProps {
  children: React.ReactNode
  step: number        // 1–5
  totalSteps?: number // default 5
  onBack?: () => void
  showBack?: boolean
  exitHref?: string   // default /auth/login
}

export default function OnboardingLayout({
  children,
  step,
  totalSteps = 5,
  onBack,
  showBack = true,
  exitHref = '/auth/login',
}: OnboardingLayoutProps) {
  const progress = (step / totalSteps) * 100

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Brand + exit row */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-stone-900 text-white flex items-center justify-center font-extrabold text-sm shadow-sm group-hover:bg-[#4F6EF7] transition-all">
            S
          </div>
          <span className="text-sm font-bold tracking-tight text-stone-900">Sunday Tally</span>
        </Link>
        <Link
          href={exitHref}
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          Exit setup
        </Link>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100 w-full">
        <div
          className="h-1 bg-[#4F6EF7] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Back + step counter row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        {showBack && onBack ? (
          <button
            onClick={onBack}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors py-1"
            aria-label="Go back"
          >
            ← Back
          </button>
        ) : (
          <div />
        )}
        <span className="text-xs text-gray-400">
          Step {step} of {totalSteps}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-4 pb-8 max-w-lg mx-auto w-full">
        {children}
      </div>
    </div>
  )
}
