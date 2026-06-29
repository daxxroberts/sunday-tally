import type { Metadata } from 'next'
import Link from 'next/link'

const SITE = 'https://sundaytally.church'

export const metadata: Metadata = {
  title: 'About Sunday Tally — Why We Built It | Daxx Roberts',
  description:
    'Sunday Tally was built by a 13-year analytics professional who joined his own church board, saw the manual reporting and missing database, and made church analytics every church can afford.',
  alternates: { canonical: '/about' },
  openGraph: {
    type: 'profile',
    url: `${SITE}/about`,
    siteName: 'Sunday Tally',
    title: 'About Sunday Tally — Why We Built It',
    description:
      'Why a 13-year analytics professional built affordable church analytics for every church, no matter its size.',
  },
}

const aboutSchema = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  url: `${SITE}/about`,
  mainEntity: {
    '@type': 'Person',
    name: 'Daxx Roberts',
    jobTitle: 'Founder',
    description:
      'Founder of Sunday Tally. Spent 13 years working in data analytics before building affordable church analytics software.',
    worksFor: {
      '@type': 'Organization',
      name: 'Sunday Tally',
      url: SITE,
    },
  },
}

export default function AboutPage() {
  return (
    <article className="container mx-auto max-w-3xl px-4 py-16 md:px-8 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
      />

      <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#4F6EF7]">
        Why we built this
      </p>
      <h1 className="mb-6 text-4xl font-bold leading-[1.1] tracking-tight text-stone-900 md:text-5xl">
        Every church deserves to see itself clearly
      </h1>

      <div className="blog-prose">
        <p>
          I spent thirteen years working in data analytics. I know what it looks
          like when an organization can finally see itself clearly, and what it
          costs when it can&apos;t. For most of my career that work happened in
          businesses. Then it followed me to church.
        </p>

        <p>
          I joined my own church&apos;s board, expecting to help with decisions.
          What I found instead was our staff rebuilding the same reports by hand
          every single week, copying numbers between spreadsheets late into the
          evening. And underneath it all, the thing that stopped me cold: there
          was no database. No real place where the church&apos;s own history
          lived. Every report started from scratch, and every question that
          started with &ldquo;how are we doing on&hellip;&rdquo; took hours to
          answer, if it could be answered at all.
        </p>

        <p>
          These weren&apos;t disorganized people. They were faithful, capable,
          and buried, doing by hand what software should have been doing for
          them. And I realized the churches that most needed to see their
          ministries clearly were the ones least able to afford the tools that
          would let them.
        </p>

        <h2>The principle behind it</h2>
        <p>
          There&apos;s a principle called Pearson&apos;s Law: when performance is
          measured, it improves; and when it&apos;s measured and reported back,
          the rate of improvement accelerates. I&apos;ve watched it hold true in
          every organization I&apos;ve ever worked with. I&apos;ve come to
          believe it&apos;s just as true in ministry, and in our own walk with
          Christ. What we pay honest attention to tends to grow.
        </p>
        <p>
          That&apos;s the whole idea behind Sunday Tally. Not numbers for the
          sake of numbers, but attention for the sake of the people those numbers
          represent: the family quietly drifting, the volunteer carrying too
          much, the ministry flourishing where no one was looking.
        </p>

        <h2>Built to be affordable, on purpose</h2>
        <p>
          So I built Sunday Tally to do the hard part for any church, regardless
          of size or budget. The affordability isn&apos;t a discount or a
          promotion. It&apos;s the point. A church of sixty should be able to see
          itself as clearly as a church of six thousand. I priced it so that the
          churches who need it most are the ones who can finally have it.
        </p>
        <p>
          That conviction is why this exists. Everything else, the dashboards,
          the charts, the weekly entry that takes a few minutes, is just how we
          keep that promise.
        </p>
      </div>

      <div className="mt-12 rounded-2xl bg-stone-900 p-8 text-center text-white md:p-10">
        <h2 className="mb-3 text-2xl font-bold tracking-tight">See your ministry clearly</h2>
        <p className="mx-auto mb-6 max-w-md font-medium text-stone-300">
          Turn your weekly numbers into a dashboard your whole leadership can read
          in seconds. Built so any church can afford it.
        </p>
        <Link
          href="/auth/login"
          className="inline-flex items-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-stone-900 transition-all hover:bg-[#4F6EF7] hover:text-white"
        >
          Start a free trial
        </Link>
      </div>
    </article>
  )
}
