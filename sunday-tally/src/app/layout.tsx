import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SundaySessionProvider } from '@/contexts/SundaySessionContext'
import { DataReviewProvider } from '@/contexts/DataReviewContext'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://sundaytally.church'),
  title: 'Church Attendance & Giving Analytics | Sunday Tally',
  description:
    'Sunday Tally is church analytics software that tracks attendance, giving, and volunteers in one dashboard. See your ministry clearly. Start a 45-day free trial.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: 'https://sundaytally.church',
    siteName: 'Sunday Tally',
    title: 'Church Attendance & Giving Analytics | Sunday Tally',
    description:
      'Track attendance, giving, and volunteers in one simple dashboard. Start a 45-day free trial — no credit card.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Sunday Tally church analytics dashboard' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Church Attendance & Giving Analytics | Sunday Tally',
    description: 'Track attendance, giving, and volunteers in one simple dashboard. Start a 45-day free trial.',
    images: ['/og.png'],
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

const orgSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Sunday Tally',
      url: 'https://sundaytally.church',
      logo: 'https://sundaytally.church/og.png',
      description: 'Church analytics software for tracking attendance, giving, and volunteers.',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Sunday Tally',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://sundaytally.church',
      description:
        'Church analytics software that tracks weekly attendance, giving, and volunteer data in standardized dashboards for churches and multi-campus ministries.',
      offers: {
        '@type': 'Offer',
        price: '22.00',
        priceCurrency: 'USD',
        description: 'Base platform, per location, per month. 45-day free trial.',
      },
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-gray-900 font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
        />
        <SundaySessionProvider>
          <DataReviewProvider>
            {children}
          </DataReviewProvider>
        </SundaySessionProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
