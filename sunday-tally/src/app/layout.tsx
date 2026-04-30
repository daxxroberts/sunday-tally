import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SundaySessionProvider } from '@/contexts/SundaySessionContext'
import { DataReviewProvider } from '@/contexts/DataReviewContext'

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Sunday Tally',
  description: 'Weekly ministry data for churches',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-gray-900 font-sans">
        <SundaySessionProvider>
          <DataReviewProvider>
            {children}
          </DataReviewProvider>
        </SundaySessionProvider>
      </body>
    </html>
  )
}
