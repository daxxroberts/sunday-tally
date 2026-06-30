import Link from 'next/link'

export const metadata = { title: 'Privacy Policy | Sunday Tally' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm font-bold text-[#4F6EF7] hover:text-[#3D5BD4] transition-colors">
          ← Back to Sunday Tally
        </Link>
        <h1 className="text-3xl font-black text-stone-900 mt-8 mb-2">Privacy Policy</h1>
        <p className="text-stone-500 text-sm mb-10">Last updated: June 2026</p>

        <div className="prose prose-stone max-w-none text-sm leading-relaxed space-y-6 text-stone-700">
          <p>
            Sunday Tally is built for churches. We take privacy seriously and keep things simple:
            your data is yours, we protect it, and we never sell it.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">What we collect</h2>
          <p>
            We collect the information you provide when setting up your church account — name, email address,
            and church name. We also store the ministry data you enter: attendance counts, volunteer records,
            and giving totals.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">How we use it</h2>
          <p>
            We use your data solely to provide the Sunday Tally service — to display your dashboards,
            generate reports, and send transactional emails (like invites and billing receipts).
            We do not use your data for advertising or share it with third parties.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">Data storage</h2>
          <p>
            Your data is stored securely using Supabase (PostgreSQL) hosted on AWS infrastructure.
            Data is encrypted at rest and in transit.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">Your rights</h2>
          <p>
            You can request a full export of your church's data or ask us to delete your account at any time.
            Contact us and we'll handle it promptly.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">Cookies</h2>
          <p>
            We use cookies only to maintain your login session. We do not use tracking or advertising cookies.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">Contact</h2>
          <p>
            Questions about privacy? Email us at{' '}
            <a href="mailto:hello@sundaytally.church" className="text-[#4F6EF7] font-semibold">
              hello@sundaytally.church
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
