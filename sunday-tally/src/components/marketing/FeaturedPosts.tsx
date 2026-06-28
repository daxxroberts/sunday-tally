import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { PostMeta } from '@/lib/blog'

// "Field notes" band for the marketing homepage — surfaces featured blog posts
// so the landing page funnels readers (and SEO equity) into the content cluster.
// Server-safe presentational component; data comes in as a prop.

export function FeaturedPosts({ posts }: { posts: PostMeta[] }) {
  if (!posts || posts.length === 0) return null

  return (
    <section className="border-t border-stone-200/80 bg-stone-50/50 py-16 md:py-24">
      <div className="container mx-auto max-w-6xl px-4 md:px-8">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#4F6EF7]">
              Field notes
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">
              What the numbers actually tell you
            </h2>
            <p className="mt-3 max-w-xl font-medium text-stone-500">
              Short, plain-language reads on what church data reveals once you
              stop guessing, from 13 years in analytics applied to ministry.
            </p>
          </div>
          <Link
            href="/blog"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-stone-900 transition-all hover:gap-2.5"
          >
            All articles <ArrowRight size={16} />
          </Link>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-all hover:border-[#4F6EF7]/40 hover:shadow-md"
            >
              {post.tags[0] && (
                <span className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#B8860B]">
                  {post.tags[0]}
                </span>
              )}
              <h3 className="mb-2 text-lg font-bold leading-snug tracking-tight text-stone-900 transition-colors group-hover:text-[#4F6EF7]">
                {post.title}
              </h3>
              <p className="mb-4 line-clamp-3 flex-1 text-sm font-medium text-stone-500">
                {post.description}
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-900 transition-all group-hover:gap-2.5">
                Read <ArrowRight size={15} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
