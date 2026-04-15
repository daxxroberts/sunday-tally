// AuthLayout — minimal layout for /auth/login, /auth/invite/[token], /signup
// No nav bar. No tab bar. Centred content. (NAV_MANIFEST: AuthLayout)

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        {/* App wordmark */}
        <div className="mb-8 text-center">
          <span className="text-2xl font-semibold text-gray-900 tracking-tight">
            Sunday Tally
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}
