// AuthLayout — minimal layout for /auth/login, /auth/invite/[token], /signup
// No nav bar. No tab bar. Centred content. (NAV_MANIFEST: AuthLayout)

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand mark */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 mb-3 shadow-lg shadow-blue-200">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-xl font-bold text-gray-900 tracking-tight">Sunday Tally</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
