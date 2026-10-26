import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'
import { db } from './db'
import { siteUrl } from './env'
import { dictionaries } from '@/i18n/messages'
import { dirOf, isLocale, type Locale } from '@/i18n/config'

// Email reminders, sent through a Gmail account (no domain needed):
//   GMAIL_USER=the Gmail address the emails come from
//   GMAIL_APP_PASSWORD=a 16-letter app password for that account (Google Account → Security →
//     2-Step Verification → App passwords)
// Without both, no email is sent and the app works as before (reminders stay in To score).
// Local testing: EMAIL_TRANSPORT=log prints each email to the server log instead of sending it.

type Config = { kind: 'gmail'; user: string; pass: string } | { kind: 'log' }

export function emailConfig(): Config | null {
  if (process.env.EMAIL_TRANSPORT === 'log' && !process.env.VERCEL) return { kind: 'log' }
  const user = process.env.GMAIL_USER?.trim()
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '')
  return user && pass ? { kind: 'gmail', user, pass } : null
}

let cached: { key: string; transport: Transporter } | null = null
function transportFor(cfg: Config): Transporter {
  const key = cfg.kind === 'gmail' ? `gmail:${cfg.user}` : 'log'
  if (cached?.key === key) return cached.transport
  const transport =
    cfg.kind === 'gmail'
      ? nodemailer.createTransport({ service: 'gmail', auth: { user: cfg.user, pass: cfg.pass } })
      : nodemailer.createTransport({ jsonTransport: true })
  cached = { key, transport }
  return transport
}

/** Local testing: keep a copy of each logged email to open in a browser. */
async function saveCopy(dir: string, name: string, html: string) {
  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(dir, { recursive: true })
  await writeFile(`${dir}/${name.replace(/[^\w-]+/g, '_')}.html`, html)
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export type AfterReminder = { locale: Locale; game: string; list: string; who: string; link: string; accountLink: string }

/** The After-score reminder in the reader's language: subject, plain text and HTML. */
export function afterReminderEmail({ locale, game, list, who, link, accountLink }: AfterReminder) {
  const t = dictionaries[locale].email
  const dir = dirOf(locale)
  const align = dir === 'rtl' ? 'right' : 'left'
  const subject = t.subject(game)
  const text = [t.heading(game), '', t.body(who, list), '', `${t.button}: ${link}`, '', t.missed, '', `${t.footer} ${t.turnOff}: ${accountLink}`].join('\n')
  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Arial,'Segoe UI',Tahoma,sans-serif;color:#17191e">
  <div dir="${dir}" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;text-align:${align}">
    <div dir="ltr" style="font-weight:700;font-size:15px;color:#4d6b00;margin-bottom:18px;text-align:${align}">&#187; Up Next</div>
    <h1 style="font-size:22px;line-height:28px;margin:0 0 12px">${esc(t.heading(game))}</h1>
    <p style="font-size:15px;line-height:22px;margin:0 0 22px;color:#3a3f4a">${esc(t.body(who, list))}</p>
    <a href="${esc(link)}" style="display:inline-block;background:#c6f432;color:#0e0f12;font-weight:700;font-size:15px;text-decoration:none;padding:12px 18px;border-radius:10px">${esc(t.button)}</a>
    <p style="font-size:13px;line-height:19px;margin:22px 0 0;color:#6f7480">${esc(t.missed)}</p>
  </div>
  <p dir="${dir}" style="max-width:480px;margin:14px auto 0;font-size:12px;line-height:18px;color:#8e939e;text-align:center">
    ${esc(t.footer)} <a href="${esc(accountLink)}" style="color:#6f7480">${esc(t.turnOff)}</a>
  </p>
</body>
</html>`
  return { subject, text, html }
}

/**
 * After the group marks a game "played together": one email to each member who still owes an
 * After score (not the person who marked it, not anyone who turned emails off, never twice).
 * Runs after the response is sent, so a slow mail server never slows the app down.
 */
export async function sendAfterReminders(listId: string, gameId: number, actorId: string): Promise<void> {
  const cfg = emailConfig()
  if (!cfg) {
    console.log('[email] not set up (GMAIL_USER / GMAIL_APP_PASSWORD): after-score emails skipped')
    return
  }
  const sql = db()
  const [info] = await sql<{ list: string; game: string; who: string }[]>`
    select l.name as list, g.title as game, p.display_name as who
    from public.lists l, public.games g, public.profiles p
    where l.id = ${listId}::uuid and g.id = ${gameId}::bigint and p.id = ${actorId}::uuid`
  if (!info) return
  const people = await sql<{ user_id: string; email: string; name: string; locale: string | null }[]>`
    select * from public.after_email_recipients(${listId}::uuid, ${gameId}::bigint, ${actorId}::uuid)`
  if (!people.length) return

  const base = siteUrl().replace(/\/$/, '')
  const link = `${base}/lists/${listId}/games/${gameId}?played=1`
  const accountLink = `${base}/account#email`
  const transport = transportFor(cfg)
  const from = cfg.kind === 'gmail' ? { name: 'Up Next', address: cfg.user } : 'Up Next <upnext@localhost>'
  let sent = 0
  let failed = 0
  for (const person of people) {
    const locale: Locale = isLocale(person.locale) ? person.locale : 'en'
    const message = afterReminderEmail({ locale, game: info.game, list: info.list, who: info.who, link, accountLink })
    try {
      const result = await transport.sendMail({ from, to: { name: person.name, address: person.email }, ...message })
      if (cfg.kind === 'log') {
        console.log('[email] (log)', JSON.stringify({ to: person.name, locale, subject: message.subject, size: String(result.message).length }))
        if (process.env.EMAIL_LOG_DIR) await saveCopy(process.env.EMAIL_LOG_DIR, `${person.name}-${locale}`, message.html)
      }
      await sql`
        insert into public.after_emails_sent (user_id, list_id, game_id)
        values (${person.user_id}::uuid, ${listId}::uuid, ${gameId}::bigint)
        on conflict do nothing`
      sent++
    } catch (e) {
      failed++
      console.error('[email] send failed:', (e as Error).message)
    }
  }
  console.log('[email] after-score reminders', JSON.stringify({ game: info.game, sent, failed }))
}
