'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Search } from 'lucide-react'
import type { PostMeta } from '@/lib/blog'

function formatDate(date: string): string {
  if (!date) return ''
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Category filter chips + client-side search over the Field Notes list.
export function BlogIndex({ posts }: { posts: PostMeta[] }) {
  const [active, setActive] = useState<string>('All')
  const [q, setQ] = useState('')

  const categories = useMemo(() => {
    const set = new Set<string>()
    posts.forEach((p) => p.category && set.add(p.category))
    return ['All', ...Array.from(set)]
  }, [posts])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return posts.filter((p) => {
      const catOk = active === 'All' || p.category === active
      const searchOk =
        !query ||
        p.title.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.tags.some((t) => t.toLowerCase().includes(query))
      return catOk && searchOk
    })
  }, [posts, active, q])

  return (
    <div>
      <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = active === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setActive(c)}
                aria-pressed={on}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  on
                    ? 'bg-stone-900 text-white'
                    : 'border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900'
                }`}
              >
                {c}
              </button>
            )
          })}
        </div>
        <div className="relative md:w-64">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search field notes…"
            className="w-full rounded-full border border-stone-200 bg-white py-2 pl-9 pr-4 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-[#4F6EF7]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-stone-500">No field notes match that search yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-stone-200/80">
          {filtered.map((post) => (
            <article key={post.slug} className="group py-8 first:pt-0">
              <Link
                href={`/blog/${post.slug}`}
                className="flex flex-col gap-5 sm:flex-row sm:items-start"
              >
                {post.coverImage && (
                  <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-stone-200/80 bg-stone-50 sm:w-56 sm:shrink-0">
                    <Image
                      src={post.coverImage}
                      alt={post.coverImageAlt || post.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 224px"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
                    <time dateTime={post.date}>{formatDate(post.date)}</time>
                    {post.category && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-[#4F6EF7]">{post.category}</span>
                      </>
                    )}
                  </div>
                  <h2 className="mb-2 text-2xl font-bold tracking-tight text-stone-900 transition-colors group-hover:text-[#4F6EF7]">
                    {post.title}
                  </h2>
                  <p className="mb-4 line-clamp-2 font-medium text-stone-500">{post.description}</p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-900 transition-all group-hover:gap-2.5">
                    Read article <ArrowRight size={16} />
                  </span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
