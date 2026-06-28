import 'server-only'
import { Resend } from 'resend'
import { renderEmail, type EmailTemplate, type TemplateData } from './templates'

// Re-export so existing call sites (`@/lib/email/resend`) keep working.
export type { EmailTemplate, TemplateData }

let _client: Resend | null = null
function resend(): Resend {
  if (_client) return _client
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  _client = new Resend(key)
  return _client
}

function from(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'Sunday Tally <noreply@sundaytally.church>'
}

export async function sendEmail(
  to:       string,
  template: EmailTemplate,
  data:     TemplateData = {},
): Promise<{ id?: string; error?: string }> {
  const { subject, html } = renderEmail(template, data)
  try {
    const res = await resend().emails.send({ from: from(), to, subject, html })
    if (res.error) return { error: res.error.message }
    return { id: res.data?.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'send_failed' }
  }
}
