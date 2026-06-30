import Link from 'next/link'

export const metadata = { title: 'Terms of Service | Sunday Tally' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm font-bold text-[#4F6EF7] hover:text-[#3D5BD4] transition-colors">
          ← Back to Sunday Tally
        </Link>
        <h1 className="text-3xl font-black text-stone-900 mt-8 mb-2">Terms of Service</h1>
        <p className="text-stone-500 text-sm mb-10">Last updated: June 2026</p>

        <div className="prose prose-stone max-w-none text-sm leading-relaxed space-y-6 text-stone-700">
          <p>
            By using Sunday Tally, you agree to these terms. Sunday Tally is a ministry analytics platform
            built to help churches track attendance, volunteers, and giving.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">Your account</h2>
          <p>
            You are responsible for keeping your account credentials secure. Each church account is owned
            by the person who registers it. You may invite team members and assign them roles within the app.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">Your data</h2>
          <p>
            Your church's data belongs to you. We do not sell it, share it with third parties, or use it
            for advertising. You can export or delete your data at any time by contacting us.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">Acceptable use</h2>
          <p>
            Sunday Tally is for church ministry use. You agree not to use the platform for any unlawful
            purpose or in ways that harm others.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">Subscriptions and billing</h2>
          <p>
            Paid plans are billed monthly. You may cancel at any time. Cancellation takes effect at the
            end of your current billing period.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">Changes to these terms</h2>
          <p>
            We may update these terms from time to time. We'll notify you of significant changes via email.
            Continued use of Sunday Tally after changes constitutes acceptance of the new terms.
          </p>

          <h2 className="text-base font-bold text-stone-900 mt-8">Contact</h2>
          <p>
            Questions? Email us at{' '}
            <a href="mailto:hello@sundaytally.church" className="text-[#4F6EF7] font-semibold">
              hello@sundaytally.church
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
