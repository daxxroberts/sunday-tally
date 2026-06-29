import type { MetadataRoute } from 'next'
import { getAllPostsMeta } from '@/lib/blog'

const SITE = 'https://sundaytally.church'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/features`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE}/pricing`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE}/blog`, changeFrequency: 'weekly', priority: 0.7 },
  ]

  const postRoutes: MetadataRoute.Sitemap = getAllPostsMeta().map((post) => ({
    url: `${SITE}/blog/${post.slug}`,
    lastModified: post.lastUpdated || post.date || undefined,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...postRoutes]
}
