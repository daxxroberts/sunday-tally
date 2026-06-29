import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getAllPostsMeta } from '@/lib/blog'

export const metadata: Metadata = {
  title: 'Church Analytics Blog | Sunday Tally',
  description:
    'Practical writing on church analytics, attendance tracking, giving trends, and measuring ministry health, from the team behind Sunday Tally.',
  alternates: { canonical: '/blog' },
  openGraph: {
    type: 'website',
    url: 'https://sundaytally.church/blog',
    siteName: 'Sunday Tally',
    title: 'Church Analytics Blog | Sunday Tally',
    description:
      'Practical writing on church analytics, attendance tracking, and measuring ministry health.',
  },
}

function formatDate(date: string): string {
  if (!date) return ''
  // Parse YYYY-MM-DD as local time (not UTC) to avoid an off-by-one day.
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function BlogIndexPage() {
  const posts = getAllPostsMeta()

  return (
    <div className="container mx-auto px-4 md:px-8 py-16 md:py-24 max-w-4xl">
      <header className="mb-12 md:mb-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#4F6EF7] mb-3">
          Field Notes
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-stone-900 mb-4">
          Measuring what matters in ministry
        </h1>
        <p className="text-lg text-stone-500 font-medium max-w-2xl">
          Plain-language writing on church analytics, attendance, giving, and the
          numbers that actually help you pastor well.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-stone-500">No posts yet. Check back soon.</p>
      ) : (
        <div className="flex flex-col divide-y divide-stone-200/80">
          {posts.map((post) => (
            <article key={post.slug} className="group py-8 first:pt-0">
              <Link href={`/blog/${post.slug}`} className="block">
                <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                  {post.tags[0] && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-[#4F6EF7]">{post.tags[0]}</span>
                    </>
                  )}
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-stone-900 group-hover:text-[#4F6EF7] transition-colors mb-2">
                  {post.title}
                </h2>
                <p className="text-stone-500 font-medium mb-4 line-clamp-2">
                  {post.description}
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-900 group-hover:gap-2.5 transition-all">
                  Read article <ArrowRight size={16} />
                </span>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
