import type { MetadataRoute } from 'next'

const SITE = 'https://sundaytally.church'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/', '/dashboard', '/settings', '/onboarding'],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  }
}
