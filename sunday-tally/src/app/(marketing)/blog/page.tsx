import type { Metadata } from 'next'
import { getAllPostsMeta } from '@/lib/blog'
import { BlogIndex } from './BlogIndex'

export const metadata: Metadata = {
  title: 'Church Analytics Field Notes | Sunday Tally',
  description:
    'Practical writing on church analytics, attendance tracking, giving trends, and measuring ministry health, from the team behind Sunday Tally.',
  alternates: { canonical: '/blog' },
  openGraph: {
    type: 'website',
    url: 'https://sundaytally.church/blog',
    siteName: 'Sunday Tally',
    title: 'Church Analytics Field Notes | Sunday Tally',
    description:
      'Practical writing on church analytics, attendance tracking, and measuring ministry health.',
  },
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
        <BlogIndex posts={posts} />
      )}
    </div>
  )
}
