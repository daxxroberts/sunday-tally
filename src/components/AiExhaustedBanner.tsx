// D-059: paid AI budget is not advertised — message shows no numbers.

export default function AiExhaustedBanner() {
  return (
    <div
      role="status"
      className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-medium">You&rsquo;ve used all your AI for this period.</p>
      <p className="mt-1 text-amber-800">
        AI will be available again in your next billing period.
      </p>
    </div>
  )
}
