// Marketing homepage. Server wrapper: renders the client landing
// (HomeLanding.tsx) and server-renders the "Field notes" featured-blog band
// beneath it, so featured posts ship in the initial HTML (SEO) without making
// the whole landing a server component.

import LandingPage from './HomeLanding'
import { FeaturedPosts } from '@/components/marketing/FeaturedPosts'
import { getFeaturedPostsMeta } from '@/lib/blog'

export default function Page() {
  return (
    <>
      <LandingPage />
      <FeaturedPosts posts={getFeaturedPostsMeta(3)} />
    </>
  )
}
