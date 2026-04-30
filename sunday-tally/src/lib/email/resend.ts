import 'server-only'
import { Resend } from 'resend'

let _client: Resend | null = null
function resend(): Resend {
  if (_client) return _client
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  _client = new Resend(key)
  return _client
}

function from(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'Sunday Tally <noreply@sundaytally.app>'
}

export type EmailTemplate =
  | 'trialEnding7d'
  | 'trialEnding1d'
  | 'paymentFailed'
  | 'invite'
  | 'aiSetupExhausted'

export interface TemplateData {
  churchName?:   string
  daysLeft?:     number
  billingUrl?:   string
  inviteUrl?:    string
  inviterName?:  string
  role?:         string
}

export async function sendEmail(
  to:       string,
  template: EmailTemplate,
  data:     TemplateData = {},
): Promise<{ id?: string; error?: string }> {
  const { subject, html } = render(template, data)
  try {
    const res = await resend().emails.send({ from: from(), to, subject, html })
    if (res.error) return { error: res.error.message }
    return { id: res.data?.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'send_failed' }
  }
}

function render(template: EmailTemplate, d: TemplateData): { subject: string; html: string } {
  const church = d.churchName ?? 'your church'
  const billing = d.billingUrl ?? `${appUrl()}/billing`

  switch (template) {
    case 'trialEnding7d':
      return {
        subject: 'Your Sunday Tally trial ends in 7 days',
        html: wrap(`
          <p>Hi,</p>
          <p>Your Sunday Tally trial for <strong>${church}</strong> ends in 7 days.</p>
          <p>Subscribe now to keep logging attendance, volunteers, giving, and stats without interruption — $22/month, cancel anytime.</p>
          <p><a href="${billing}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Subscribe</a></p>
        `),
      }
    case 'trialEnding1d':
      return {
        subject: 'Your Sunday Tally trial ends tomorrow',
        html: wrap(`
          <p>Hi,</p>
          <p>Your Sunday Tally trial for <strong>${church}</strong> ends <strong>tomorrow</strong>. After that, data entry is locked until you subscribe.</p>
          <p>Your dashboards stay visible regardless.</p>
          <p><a href="${billing}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Subscribe</a></p>
        `),
      }
    case 'paymentFailed':
      return {
        subject: 'Payment failed — Sunday Tally',
        html: wrap(`
          <p>Hi,</p>
          <p>Your most recent payment for <strong>${church}</strong> didn't go through. Update your card to keep your subscription active.</p>
          <p><a href="${billing}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Update billing</a></p>
        `),
      }
    case 'invite':
      return {
        subject: `You've been invited to ${church} on Sunday Tally`,
        html: wrap(`
          <p>Hi,</p>
          <p>${d.inviterName ?? 'A team member'} invited you to join <strong>${church}</strong> on Sunday Tally as <strong>${d.role ?? 'a team member'}</strong>.</p>
          <p><a href="${d.inviteUrl}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Accept invitation</a></p>
          <p style="color:#6b7280;font-size:12px;">This link expires in 7 days.</p>
        `),
      }
    case 'aiSetupExhausted':
      return {
        subject: 'Trial AI quota reached — Sunday Tally',
        html: wrap(`
          <p>Hi,</p>
          <p>You've used the AI setup helper as much as the trial allows. You can still set things up manually, or subscribe for a monthly AI budget that covers both setup and analytics chat.</p>
          <p><a href="${billing}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">See plans</a></p>
        `),
      }
  }
}

function wrap(content: string): string {
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; max-width:560px;margin:0 auto;padding:24px;color:#111827;">
<h1 style="font-size:18px;margin:0 0 16px;">Sunday Tally</h1>
${content}
<p style="margin-top:32px;color:#9ca3af;font-size:12px;">Sunday Tally · Weekly ministry analytics</p>
</body></html>`
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://sundaytally.app'
}
