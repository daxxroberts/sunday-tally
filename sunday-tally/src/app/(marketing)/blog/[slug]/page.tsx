import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { compileMDX } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { getAllPostSlugs, getPostBySlug } from '@/lib/blog'
import { StatGroup, TrendChart } from '@/components/blog/ChartKit'

const SITE = 'https://sundaytally.church'

export function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }))
}

// dynamicParams stays true (default): new post files render without a rebuild, and
// getPostBySlug already 404s any non-post (no title+date frontmatter) by direct URL.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}

  const url = `${SITE}/blog/${post.slug}`
  const images = post.ogImage || post.coverImage
    ? [{ url: (post.ogImage || post.coverImage) as string, width: 1200, height: 630, alt: post.coverImageAlt || post.title }]
    : undefined

  return {
    title: `${post.title} | Sunday Tally`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      url,
      siteName: 'Sunday Tally',
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      modifiedTime: post.lastUpdated,
      authors: [post.author],
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: images?.map((i) => i.url),
    },
  }
}

function formatDate(date: string): string {
  if (!date) return ''
  // Parse YYYY-MM-DD as local time (not UTC) to avoid an off-by-one day.
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  const url = `${SITE}/blog/${post.slug}`
  const image = post.ogImage || post.coverImage

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.lastUpdated,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    ...(image ? { image: image.startsWith('http') ? image : `${SITE}${image}` } : {}),
    author: {
      '@type': 'Person',
      name: post.author,
      url: `${SITE}/blog`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Sunday Tally',
      url: SITE,
      logo: { '@type': 'ImageObject', url: `${SITE}/og.png` },
    },
  }

  const faqSchema = post.faqs.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: post.faqs.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      }
    : null

  // .mdx posts compile to real React (so they can use StatCard/TrendChart);
  // .md posts render the pre-built HTML string.
  const rendered =
    post.format === 'mdx'
      ? (
          await compileMDX({
            source: post.body,
            components: { StatGroup, TrendChart },
            options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
          })
        ).content
      : null

  return (
    <article className="container mx-auto px-4 md:px-8 py-12 md:py-20 max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-stone-900 transition-colors mb-8"
      >
        <ArrowLeft size={16} /> All articles
      </Link>

      <header className="mb-10">
        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          {(post.category ?? post.tags[0]) && (
            <>
              <span aria-hidden>·</span>
              <span className="text-[#4F6EF7]">{post.category ?? post.tags[0]}</span>
            </>
          )}
        </div>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-stone-900 leading-[1.1] mb-5">
          {post.title}
        </h1>
        <p className="text-lg text-stone-500 font-medium">{post.description}</p>
        <p className="mt-6 text-sm font-semibold text-stone-600">
          By{' '}
          <Link href="/about" className="text-[#4F6EF7] hover:underline">
            {post.author}
          </Link>
        </p>
      </header>

      {post.coverImage && (
        <div className="relative mb-12 aspect-[16/9] w-full overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-50">
          <Image
            src={post.coverImage}
            alt={post.coverImageAlt || post.title}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
            priority
          />
        </div>
      )}

      {rendered ? (
        <div className="blog-prose">{rendered}</div>
      ) : (
        <div className="blog-prose" dangerouslySetInnerHTML={{ __html: post.html }} />
      )}

      <div className="mt-16 rounded-2xl bg-stone-900 text-white p-8 md:p-10 text-center">
        <h2 className="text-2xl font-bold tracking-tight mb-3">
          See your ministry clearly
        </h2>
        <p className="text-stone-300 font-medium mb-6 max-w-md mx-auto">
          Sunday Tally turns your weekly numbers into a dashboard your board can
          read in seconds. Built so any church can afford it.
        </p>
        <Link
          href="/auth/login"
          className="inline-flex items-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-stone-900 hover:bg-[#4F6EF7] hover:text-white transition-all"
        >
          Start a free trial
        </Link>
      </div>
    </article>
  )
}
