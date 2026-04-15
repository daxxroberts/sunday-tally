'use client'

// T9 — /onboarding/invite — Step 5
// IRIS_T9_ELEMENT_MAP.md: E1-E8 all implemented
// D-023: role picker scoped by inviter | D-015: viewer magic link | N60-N66

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import OnboardingLayout from '@/components/layouts/OnboardingLayout'
import { getTeamData, sendInviteAction } from './actions'

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: 'Can enter data and view reports. Can invite Editors and Viewers.',
  editor: 'Can enter Sunday data only — no reports.',
  viewer: "Can view reports only. Gets a magic link — no password needed.",
}

const ROLE_OPTIONS_OWNER = ['admin', 'editor', 'viewer']
const ROLE_OPTIONS_ADMIN = ['editor', 'viewer']

export default function OnboardingInvitePage() {
  const [myRole, setMyRole] = useState<string>('')
  const [churchId, setChurchId] = useState<string>('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [sentCount, setSentCount] = useState(0)
  const [lastSentEmail, setLastSentEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    getTeamData().then(data => {
      if (!data) return
      setMyRole(data.myRole)
      setChurchId(data.churchId)
      const roleOpts = data.myRole === 'owner' ? ROLE_OPTIONS_OWNER : ROLE_OPTIONS_ADMIN
      setRole(roleOpts[0])
    })
  }, [])

  const roleOptions = myRole === 'owner' ? ROLE_OPTIONS_OWNER : ROLE_OPTIONS_ADMIN

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !role || !churchId || isPending) return
    setError(null)

    startTransition(async () => {
      const result = await sendInviteAction(email.trim().toLowerCase(), role, churchId)
      if (result.error) { setError(result.error); return }
      setLastSentEmail(email.trim().toLowerCase())
      setSentCount(c => c + 1)
      setEmail('')
    })
  }

  return (
    <OnboardingLayout step={5} onBack={() => router.push('/onboarding/schedule')}>
      {/* E1 */}
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Your team</h1>
      <p className="text-sm text-gray-500 mb-8">
        Invite people who enter data or view reports. You can always do this from Settings.
      </p>

      {/* E5 — sent confirmation */}
      {lastSentEmail && (
        <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-sm text-gray-700">
            Invite sent to <span className="font-medium">{lastSentEmail}</span>. They&apos;ll get an email shortly.
          </p>
        </div>
      )}

      {/* E4 — Invite form */}
      <form onSubmit={handleSend} className="space-y-4 mb-8">
        <div>
          <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-700 mb-1">
            Who do you want to invite?
          </label>
          <input
            id="inviteEmail"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="team@church.com"
            disabled={isPending}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50"
          />
        </div>

        {/* E4b — Role picker (D-023 scoped) */}
        <div className="space-y-2">
          {roleOptions.map(r => (
            <label key={r} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
              role === r ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
            }`}>
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 capitalize">{r}</span>
                <p className="text-xs text-gray-500 mt-0.5">{ROLE_DESCRIPTIONS[r]}</p>
              </div>
            </label>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* E4c — Send */}
        <button
          type="submit"
          disabled={!email.trim() || isPending}
          className="w-full bg-gray-900 text-white rounded-lg py-3 font-medium text-sm hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? 'Sending...' : 'Send invite — they\'ll get an email with instructions.'}
        </button>
      </form>

      <div className="border-t border-gray-100 pt-6 space-y-3">
        {/* E7 — Done (after ≥1 sent) */}
        {sentCount > 0 && (
          <button
            onClick={() => router.push('/services')}
            className="w-full bg-gray-900 text-white rounded-lg py-3 font-medium text-sm hover:bg-gray-700 transition-colors"
          >
            Done — let&apos;s see your services. →
          </button>
        )}

        {/* E6 — Skip */}
        <button
          onClick={() => router.push('/services')}
          className="w-full text-center text-sm text-gray-400 hover:text-gray-700 transition-colors py-2"
        >
          Skip for now — you can invite your team from Settings anytime.
        </button>
      </div>
    </OnboardingLayout>
  )
}
