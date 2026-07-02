// Email templates — pure render logic (no 'server-only'), so it can be unit
// tested and previewed/sent from a standalone script as well as from the
// server-only Resend sender in ./resend.ts.
//
// Brand (see BRAND.md / VOICE.md): indigo #4F6EF7 primary, gold #B8860B/#D4A017
// accent, ink #111827, sage/amber status (never red). Two-color wordmark,
// indigo→gold top rule. Voice: clear, warm, value-first — show the church's own
// numbers before any ask. Email clients don't load web fonts reliably, so
// numerals are bold system text here (the Fira Code rule is for the app UI).

export type EmailTemplate =
  | 'trialEnding7d'
  | 'trialEnding1d'
  | 'invite'
  | 'churchArchiving7d'
  | 'churchArchived'
  | 'churchPurging7d'
  | 'welcome'
  | 'nurtureDay2Setup'
  | 'nurtureDay2FirstEntry'
  | 'nurtureDay2Value'
  | 'nurtureDay5'
  | 'nurtureDay10'
  | 'nurtureDay21'
  | 'trialLapsedWinback'

export interface EmailStats {
  weeksTracked?: number
  attendance?: number
  giving?: number
  volunteers?: number
  servicesLogged?: number
}

export interface TemplateData {
  churchName?:       string
  firstName?:        string | null
  // CTAs / deep links
  billingUrl?:       string
  dashboardUrl?:     string
  accountUrl?:       string
  helpUrl?:          string
  inviteUrl?:        string
  onboardingUrl?:    string
  entriesUrl?:       string
  aiUrl?:            string
  articleUrl?:       string
  // invite
  inviterName?:      string
  role?:             string
  inviteExpiryDays?: number
  // lifecycle
  daysLeft?:         number
  activeLocations?:  number
  // value + plan
  stats?:            EmailStats
  recommendedTier?:  string  // label, e.g. "Starter AI"
  planMonthly?:      number
  locations?:        number
}

// ── palette ──────────────────────────────────────────────────────────────────
const INK = '#111827'
const INDIGO = '#4F6EF7'
const INDIGO_DEEP = '#3D5BD4'
const GOLD = '#B8860B'
const GOLD_TINT = '#FBF6E9'
const SLATE = '#475569'
const MUTED = '#94A3B8'
const BORDER = '#E2E8F0'

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://sundaytally.church'
}

const fmt = (n: number) => n.toLocaleString('en-US')

function chip(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;font-size:11px;font-weight:600;color:${color};background:${bg};padding:5px 11px;border-radius:999px;">${text}</span>`
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:block;text-align:center;background:${INDIGO};color:#ffffff;font-size:15px;font-weight:600;padding:13px;border-radius:10px;text-decoration:none;">${label}</a>`
}

function backLink(href: string | undefined, label: string): string {
  if (!href) return ''
  return `<a href="${href}" style="display:block;text-align:center;color:${INDIGO_DEEP};font-size:14px;font-weight:600;padding:12px;text-decoration:none;">${label}</a>`
}

function statCell(value: string, label: string, color: string): string {
  return `<td align="center" style="padding:4px 6px;">
    <div style="font-size:21px;font-weight:700;color:${color};">${value}</div>
    <div style="font-size:12px;color:${SLATE};">${label}</div>
  </td>`
}

function statStrip(d: TemplateData): string {
  const s = d.stats
  if (!s) return ''
  const cells: string[] = []
  if (s.weeksTracked) cells.push(statCell(fmt(s.weeksTracked), 'weeks tracked', INDIGO))
  if (s.attendance)   cells.push(statCell(fmt(s.attendance), 'attendances', INDIGO))
  if (s.giving)       cells.push(statCell('$' + fmt(s.giving), 'giving logged', GOLD))
  if (s.volunteers)   cells.push(statCell(fmt(s.volunteers), 'volunteer slots', GOLD))
  if (cells.length === 0) return ''
  return `<div style="margin:18px 0;background:#F8FAFC;border:1px solid ${BORDER};border-radius:12px;padding:16px 14px;">
    <div style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:${MUTED};margin-bottom:10px;text-align:center;">Your ministry so far</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${cells.join('')}</tr></table>
  </div>`
}

function planCard(d: TemplateData): string {
  if (!d.recommendedTier || !d.planMonthly) return ''
  const locs = d.locations ? `${d.locations} location${d.locations === 1 ? '' : 's'} + ` : ''
  return `<div style="margin:0 0 4px;border:1px solid #E7DCBF;background:${GOLD_TINT};border-radius:12px;padding:14px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td>
        <div style="font-size:13px;color:${GOLD};font-weight:600;">Recommended for you</div>
        <div style="font-size:15px;color:${INK};font-weight:600;margin-top:2px;">${locs}${d.recommendedTier}</div>
      </td>
      <td align="right" style="white-space:nowrap;">
        <span style="font-size:24px;font-weight:700;color:${INK};">$${fmt(d.planMonthly)}</span><span style="font-size:13px;color:${SLATE};">/mo</span>
      </td>
    </tr></table>
  </div>`
}

// Escape church-/user-controlled strings (churchName, firstName, inviterName)
// before they land in email HTML, so a name containing markup can't break the
// layout or inject content. Same-church recipients only, so this is hygiene, not
// a cross-tenant vector — but cheap and correct.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function shell(opts: { preheader: string; chip: string; headline: string; intro: string; body: string; footerNote: string; d: TemplateData }): string {
  const { d } = opts
  const hi = d.firstName ? `Hi ${escapeHtml(d.firstName)},` : 'Hi,'
  const links = [
    d.accountUrl ? `<a href="${d.accountUrl}" style="color:${SLATE};text-decoration:underline;">Account</a>` : '',
    d.billingUrl ? `<a href="${d.billingUrl}" style="color:${SLATE};text-decoration:underline;">Billing</a>` : '',
    d.helpUrl ? `<a href="${d.helpUrl}" style="color:${SLATE};text-decoration:underline;">Help</a>` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ')

  return `<!doctype html>
<html><body style="margin:0;background:#F1F5F9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
<div style="padding:24px 12px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
    <div style="height:4px;background:linear-gradient(90deg,${INDIGO},${'#D4A017'});"></div>
    <div style="padding:22px 28px 0;">
      <span style="display:inline-block;vertical-align:middle;width:30px;height:30px;border-radius:8px;background:${INK};color:#ffffff;text-align:center;line-height:30px;font-weight:800;font-size:15px;">S</span>
      <span style="vertical-align:middle;margin-left:8px;font-size:17px;font-weight:700;letter-spacing:-.01em;"><span style="color:${INK};">Sunday</span><span style="color:${INDIGO};"> Tally</span></span>
    </div>
    <div style="padding:18px 28px 22px;">
      ${opts.chip ? `<div style="margin-bottom:14px;">${opts.chip}</div>` : ''}
      <h1 style="font-size:23px;font-weight:700;color:${INK};margin:0 0 8px;letter-spacing:-.01em;">${opts.headline}</h1>
      <p style="font-size:15px;line-height:1.6;color:${SLATE};margin:0 0 4px;">${hi} ${opts.intro}</p>
      ${opts.body}
    </div>
    <div style="border-top:1px solid #EEF2F6;padding:16px 28px 22px;font-size:12px;color:${MUTED};line-height:1.7;">
      ${opts.footerNote}${links ? `<br>${links}` : ''}
      <div style="margin-top:8px;color:#CBD5E1;">Sunday Tally · Simple analytics for growing churches</div>
    </div>
  </div>
</div>
</body></html>`
}

export function renderEmail(template: EmailTemplate, d: TemplateData): { subject: string; html: string } {
  const church = escapeHtml(d.churchName ?? 'your church')
  const billing = d.billingUrl ?? `${appUrl()}/settings/account?tab=billing`
  const dd = { ...d, billingUrl: billing }

  switch (template) {
    case 'trialEnding7d':
      return {
        subject: `Your Sunday Tally trial ends in 7 days`,
        html: shell({
          d: dd,
          preheader: `Keep your numbers flowing — your trial for ${church} ends in 7 days.`,
          chip: chip('Trial ends in 7 days', '#FEF3E2', '#B45309'),
          headline: 'Keep your numbers flowing.',
          intro: `your trial for <strong style="color:${INK};">${church}</strong> ends in a week. Here's what you've built so far — pick a plan and nothing skips a beat.`,
          body: `${statStrip(dd)}${planCard(dd)}<div style="padding-top:14px;">${button(billing, 'Choose your plan')}${backLink(dd.dashboardUrl, 'Open your dashboard →')}</div>`,
          footerNote: `You're getting this because your Sunday Tally trial is ending.`,
        }),
      }
    case 'trialEnding1d':
      return {
        subject: `Your Sunday Tally trial ends tomorrow`,
        html: shell({
          d: dd,
          preheader: `One day left on your ${church} trial.`,
          chip: chip('Trial ends tomorrow', '#FEF3E2', '#B45309'),
          headline: 'One day left on your trial.',
          intro: `your trial for <strong style="color:${INK};">${church}</strong> ends tomorrow. After that, data entry pauses until you choose a plan — your dashboards stay visible.`,
          body: `${statStrip(dd)}${planCard(dd)}<div style="padding-top:14px;">${button(billing, 'Choose your plan')}${backLink(dd.dashboardUrl, 'Open your dashboard →')}</div>`,
          footerNote: `You're getting this because your Sunday Tally trial is ending.`,
        }),
      }
    case 'churchArchiving7d':
      return {
        subject: `${church} will be archived in ${d.daysLeft ?? 7} days`,
        html: shell({
          d: dd,
          preheader: `Don't lose your history — ${church} is archived in ${d.daysLeft ?? 7} days.`,
          chip: chip(`Archived in ${d.daysLeft ?? 7} days`, '#FEF3E2', '#B45309'),
          headline: "Don't lose your history.",
          intro: `your trial for <strong style="color:${INK};">${church}</strong> has ended, so your data will be archived in ${d.daysLeft ?? 7} days. Choose a plan before then and you pick up right where you left off.`,
          body: `${statStrip(dd)}${planCard(dd)}<div style="padding-top:14px;">${button(billing, 'Choose a plan')}${backLink(dd.dashboardUrl, 'Open your dashboard →')}</div>`,
          footerNote: `You're getting this about your Sunday Tally church.`,
        }),
      }
    case 'churchArchived':
      return {
        subject: `${church} is archived — your data is safe`,
        html: shell({
          d: dd,
          preheader: `Your data is safe. You have ${d.daysLeft ?? 60} days to bring ${church} back.`,
          chip: chip('Archived', GOLD_TINT, '#8A6608'),
          headline: 'Your church is on hold.',
          intro: `<strong style="color:${INK};">${church}</strong> has been archived, but nothing's gone — your data is safe, and you have ${d.daysLeft ?? 60} days to bring it all back.`,
          body: `${statStrip(dd)}${planCard(dd)}<div style="padding-top:14px;">${button(billing, 'Restore my church')}${backLink(dd.helpUrl, 'Talk to us →')}</div>`,
          footerNote: `You're getting this about your archived Sunday Tally church.`,
        }),
      }
    case 'churchPurging7d':
      return {
        subject: `Last chance — ${church} is deleted in ${d.daysLeft ?? 7} days`,
        html: shell({
          d: dd,
          preheader: `Final reminder: ${church} is permanently deleted in ${d.daysLeft ?? 7} days.`,
          chip: chip('Final reminder', '#FEF3E2', '#B45309'),
          headline: 'Last chance to keep your data.',
          intro: `this is a final reminder: <strong style="color:${INK};">${church}</strong> will be permanently deleted in ${d.daysLeft ?? 7} days, along with everything below. Choose a plan now and it all comes back.`,
          body: `${statStrip(dd)}${planCard(dd)}<div style="padding-top:14px;">${button(billing, 'Restore my church')}${backLink(dd.helpUrl, 'Talk to us →')}</div>`,
          footerNote: `You're getting this about your archived Sunday Tally church.`,
        }),
      }
    case 'invite':
      return {
        subject: `You've been invited to ${church} on Sunday Tally`,
        html: shell({
          d: dd,
          preheader: `${escapeHtml(d.inviterName ?? 'A team member')} invited you to ${church} on Sunday Tally.`,
          chip: chip("You're invited", '#EEF1FE', INDIGO_DEEP),
          headline: `Join ${church} on Sunday Tally.`,
          intro: `${escapeHtml(d.inviterName ?? 'A team member')} invited you to join <strong style="color:${INK};">${church}</strong> as <strong style="color:${INK};">${d.role ?? 'a team member'}</strong>.`,
          body: `<div style="padding-top:14px;">${button(d.inviteUrl ?? billing, 'Accept invitation')}</div><p style="font-size:12px;color:${MUTED};margin:12px 0 0;">This link expires in ${d.inviteExpiryDays ?? 14} days.</p>`,
          footerNote: `You're getting this because you were invited to a church on Sunday Tally.`,
        }),
      }
    case 'welcome':
      return {
        subject: `You're in — here's your first step`,
        html: shell({
          d: dd,
          preheader: `Your trial for ${church} just started. Here's where to begin.`,
          chip: chip("You're in", '#EEF1FE', INDIGO_DEEP),
          headline: `Let's get your first Sunday in.`,
          intro: `your trial for <strong style="color:${INK};">${church}</strong> just started. One thing unlocks everything else — setting up your service schedule.`,
          body: `<div style="padding-top:14px;">${button(d.onboardingUrl ?? dd.dashboardUrl ?? billing, 'Set up your first service')}${backLink(dd.helpUrl, 'Questions? Talk to us →')}</div>`,
          footerNote: `You're getting this because you started a Sunday Tally trial.`,
        }),
      }
    case 'nurtureDay2Setup':
      return {
        subject: `One thing left before Sunday`,
        html: shell({
          d: dd,
          preheader: `You're a few minutes from your first entry for ${church}.`,
          chip: '',
          headline: `Finish your setup — it takes a few minutes.`,
          intro: `you're a few minutes away from your first entry for <strong style="color:${INK};">${church}</strong>. Once your schedule's in, everything else follows.`,
          body: `<div style="padding-top:14px;">${button(d.onboardingUrl ?? dd.dashboardUrl ?? billing, 'Finish setup')}${backLink(dd.helpUrl, 'Questions? Talk to us →')}</div>`,
          footerNote: `You're getting this because your Sunday Tally trial is in progress.`,
        }),
      }
    case 'nurtureDay2FirstEntry':
      return {
        subject: `Log this Sunday's numbers — it takes two minutes`,
        html: shell({
          d: dd,
          preheader: `Your setup for ${church} is ready — log this week's numbers.`,
          chip: '',
          headline: `Log this Sunday in two minutes.`,
          intro: `your setup for <strong style="color:${INK};">${church}</strong> is ready. The next step is just logging what happened this week.`,
          body: `<div style="padding-top:14px;">${button(d.entriesUrl ?? dd.dashboardUrl ?? billing, 'Log this week')}${backLink(dd.dashboardUrl, 'Open your dashboard →')}</div>`,
          footerNote: `You're getting this because your Sunday Tally trial is in progress.`,
        }),
      }
    case 'nurtureDay2Value':
      return {
        subject: `The one principle behind every church that measures well`,
        html: shell({
          d: dd,
          preheader: `A short piece on why some churches see themselves clearly and others don't.`,
          chip: '',
          headline: `The principle behind every church that measures well.`,
          intro: `there's a simple idea behind why some churches see themselves clearly and others don't. Worth two minutes.`,
          body: `<div style="padding-top:14px;">${button(d.articleUrl ?? dd.dashboardUrl ?? billing, 'Read the piece')}${backLink(dd.dashboardUrl, 'Open your dashboard →')}</div>`,
          footerNote: `You're getting this because your Sunday Tally trial is in progress.`,
        }),
      }
    case 'nurtureDay5':
      return {
        subject: `Ask your dashboard a question, get a straight answer`,
        html: shell({
          d: dd,
          preheader: `${church}'s data can answer questions in plain English now.`,
          chip: '',
          headline: `Ask your dashboard a question.`,
          intro: `<strong style="color:${INK};">${church}</strong>'s data can answer questions in plain English now — no spreadsheet required.`,
          body: `<div style="padding-top:14px;">${button(d.aiUrl ?? dd.dashboardUrl ?? billing, 'Try the AI widget builder')}${backLink(dd.articleUrl, 'See how it works →')}</div>`,
          footerNote: `You're getting this because your Sunday Tally trial is in progress.`,
        }),
      }
    case 'nurtureDay10':
      return {
        subject: `Attendance went up. Why did it feel smaller?`,
        html: shell({
          d: dd,
          preheader: `A rising total can hide a shrinking church — here's the pattern.`,
          chip: '',
          headline: `Attendance went up. Why did it feel smaller?`,
          intro: `a rising total can hide a shrinking church. I saw this pattern again and again over 13 years in analytics, and it's just as true in ministry.<br><span style="color:${MUTED};">— Daxx, founder of Sunday Tally</span>`,
          body: `<div style="padding-top:14px;">${button(dd.dashboardUrl ?? billing, 'See what your numbers say')}${backLink(dd.articleUrl, 'Read the full piece →')}</div>`,
          footerNote: `You're getting this because your Sunday Tally trial is in progress.`,
        }),
      }
    case 'nurtureDay21':
      return {
        subject: `Three weeks in — here's what your numbers already show`,
        html: shell({
          d: dd,
          preheader: `Here's what ${church} has already logged.`,
          chip: '',
          headline: `Three weeks in — here's what you've already built.`,
          intro: `here's what <strong style="color:${INK};">${church}</strong> has logged so far.`,
          body: `${statStrip(dd)}<div style="padding-top:14px;">${button(dd.dashboardUrl ?? billing, 'Open your dashboard')}</div>`,
          footerNote: `You're getting this because your Sunday Tally trial is in progress.`,
        }),
      }
    case 'trialLapsedWinback':
      return {
        subject: `Your numbers are still here when you're ready`,
        html: shell({
          d: dd,
          preheader: `${church}'s trial ended, but nothing is gone.`,
          chip: chip('We saved your spot', GOLD_TINT, '#8A6608'),
          headline: `Your numbers are still here.`,
          intro: `<strong style="color:${INK};">${church}</strong>'s trial ended, but nothing is gone. Pick a plan and pick up right where you left off.`,
          body: `${statStrip(dd)}${planCard(dd)}<div style="padding-top:14px;">${button(billing, 'Come back and pick up where you left off')}${backLink(dd.dashboardUrl, 'Open your dashboard →')}</div>`,
          footerNote: `You're getting this about your Sunday Tally trial.`,
        }),
      }
  }
}
