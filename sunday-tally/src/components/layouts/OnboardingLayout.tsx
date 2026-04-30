// OnboardingLayout — linear onboarding. Progress indicator at top.
// No tab bar. Back button. Step counter. (NAV_MANIFEST: OnboardingLayout)

interface OnboardingLayoutProps {
  children: React.ReactNode
  step: number        // 1–5
  totalSteps?: number // default 5
  onBack?: () => void
  showBack?: boolean
}

export default function OnboardingLayout({
  children,
  step,
  totalSteps = 5,
  onBack,
  showBack = true,
}: OnboardingLayoutProps) {
  const progress = (step / totalSteps) * 100

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Progress bar */}
      <div className="h-1 bg-gray-100 w-full">
        <div
          className="h-1 bg-gray-900 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
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
