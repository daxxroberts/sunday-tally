import type { Metadata } from 'next'
import Link from 'next/link'

const SITE = 'https://sundaytally.church'

export const metadata: Metadata = {
  title: 'About Sunday Tally — Why We Built It | Daxx Roberts',
  description:
    'Sunday Tally was built by a data and business analyst who spent 13 years consulting for S&P 500 and S&P 100 companies, then joined his own church board, saw the manual reporting and missing database, and made church analytics every church can afford.',
  alternates: { canonical: '/about' },
  openGraph: {
    type: 'profile',
    url: `${SITE}/about`,
    siteName: 'Sunday Tally',
    title: 'About Sunday Tally — Why We Built It',
    description:
      'Why a data and business analyst who spent 13 years consulting for S&P 500 companies built affordable church analytics for every church, no matter its size.',
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
      'Founder of Sunday Tally. Spent 13 years as a data and business analyst consulting for S&P 500 and S&P 100 companies before building affordable church analytics software.',
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
        Why we built Sunday Tally
      </p>
      <h1 className="mb-6 text-4xl font-bold leading-[1.1] tracking-tight text-stone-900 md:text-5xl">
        Bringing Real Analytics to Every Church
      </h1>

      <div className="blog-prose">
        <p>
          I spent thirteen years as a data and business analyst, most of it at a
          consulting firm working inside S&amp;P 500 and S&amp;P 100 companies.
          That put me inside hundreds of organizations &mdash; every department,
          every level of leadership &mdash; and I watched, over and over, what
          happened when a company could finally see itself clearly. It changes things. Then that lens followed me to church.
        </p>

        <p>
          I joined my own church&apos;s board expecting to help with decisions.
          What I found instead was our staff rebuilding the same reports from
          scratch every week &mdash; copying numbers between spreadsheets late
          into the evening, losing hours to questions that should have taken
          seconds. And the thing that stopped me cold: there was no database. No
          place where the church&apos;s own history lived. Every
          &ldquo;how are we doing on&hellip;&rdquo; conversation started
          from nothing.
        </p>

        <p>
          These weren&apos;t disorganized people. They were faithful, capable,
          and buried &mdash; doing by hand what software should have been doing
          for them. And when I looked at what was actually available for
          churches, the gap was plain: the few tools that existed were either
          missing the metrics that actually matter to a pastor, or so complicated
          you needed a specialist to run them. The kind of clarity I&apos;d
          watched transform businesses simply wasn&apos;t within reach for the
          churches that needed it most.
        </p>

        <h2>The principle behind it</h2>
        <p>
          There&apos;s a principle called Pearson&apos;s Law: when performance
          is measured, it improves; and when it&apos;s measured and reported
          back, the rate of improvement accelerates. I&apos;ve watched it hold
          true in every organization I&apos;ve ever worked with, and I&apos;ve
          come to believe it&apos;s just as true in ministry, and in our own
          walk with Christ. What we pay honest, regular attention to tends
          to grow.
        </p>
        <p>
          That&apos;s the whole idea behind Sunday Tally. Not numbers for their
          own sake, but attention for the sake of the people those numbers
          represent: the family quietly drifting, the volunteer carrying too
          much, the ministry flourishing in a corner where no one was looking.
        </p>

        <h2>Built to be affordable, on purpose</h2>
        <p>
          So I built Sunday Tally to do the hard part for any church, regardless
          of size or budget. The affordability isn&apos;t a discount or a
          promotion. It&apos;s the point. A church of sixty should be able to
          see itself as clearly as a church of six thousand.
        </p>
        <p>
          And affordable was never meant to mean less. I wanted the opposite:
          to wildly over-deliver &mdash; more clarity and care than the price
          would suggest &mdash; because this isn&apos;t
          really about software. It&apos;s for churches, and for the kingdom
          of God. That conviction is why this exists. The dashboards, the
          charts, the weekly entry that takes a few minutes &mdash; those are
          just how we keep that promise.
        </p>

        <h2>An older idea than software</h2>
        <p>
          Long before anyone called it Pearson&apos;s Law, Jesus taught the
          deeper version of it. In the parable of the talents, the servant who
          tended what he was entrusted with saw it multiply; the one who buried
          his out of fear lost even that. What we give honest attention to
          &mdash; in a church, and in our own walk with God &mdash; is what
          grows. I wrote more about that here:{' '}
          <Link
            href="/blog/what-a-church-tends-to-grow"
            className="text-[#4F6EF7] hover:underline"
          >
            What a Church Tends to Grow
          </Link>
          .
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
