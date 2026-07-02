'use client'

// Phone number is never present as plain text in this file, in the rendered
// HTML, or anywhere in the shipped JS bundle as a contiguous string — it's
// reassembled in the browser only when someone clicks the button, so static
// scrapers/crawlers reading source or server-rendered markup find nothing.
const OFFSET = 7
const ENCODED = [50, 56, 59, 62, 64, 57, 57, 57, 57, 61, 59, 63]

function callNow() {
  const number = ENCODED.map((n) => String.fromCharCode(n - OFFSET)).join('')
  window.location.href = `tel:${number}`
}

export default function ContactPage() {
  return (
    <article className="container mx-auto max-w-2xl px-4 py-16 text-center md:px-8 md:py-24">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#4F6EF7]">
        Get in touch
      </p>
      <h1 className="mb-6 text-4xl font-bold leading-[1.1] tracking-tight text-stone-900 md:text-5xl">
        Talk to a real person
      </h1>
      <p className="mx-auto mb-8 max-w-md text-lg text-stone-600">
        Questions about your account, billing, or getting set up — call us directly.
      </p>
      <button
        onClick={callNow}
        className="inline-flex items-center rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#4F6EF7]"
      >
        Call us
      </button>
    </article>
  )
}
