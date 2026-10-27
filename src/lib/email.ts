import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'
import { db } from './db'
import { siteUrl } from './env'
import { dictionaries } from '@/i18n/messages'
import { dirOf, intlLocale, isLocale, type Locale } from '@/i18n/config'

// Emails (After-score reminders and list invites), sent through a Gmail account (no domain needed):
//   GMAIL_USER=the Gmail address the emails come from
//   GMAIL_APP_PASSWORD=a 16-letter app password for that account (Google Account → Security →
//     2-Step Verification → App passwords)
// Without both, no email is sent and the app works as before (reminders stay in To score,
// invites on Lists). Local testing: EMAIL_TRANSPORT=log prints each email to the server log.

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

type Message = { subject: string; text: string; html: string }
type Layout = { locale: Locale; heading: string; body: string; button: string; link: string; note?: string; accountLink: string }

/** One email in the reader's language: a heading, a sentence, a button and a footer to turn emails off. */
function layout({ locale, heading, body, button, link, note, accountLink }: Layout) {
  const t = dictionaries[locale].email
  const dir = dirOf(locale)
  const align = dir === 'rtl' ? 'right' : 'left'
  const text = [heading, '', body, '', `${button}: ${link}`, ...(note ? ['', note] : []), '', `${t.footer} ${t.turnOff}: ${accountLink}`].join('\n')
  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Arial,'Segoe UI',Tahoma,sans-serif;color:#17191e">
  <div dir="${dir}" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;text-align:${align}">
    <div dir="ltr" style="font-weight:700;font-size:15px;color:#4d6b00;margin-bottom:18px;text-align:${align}">&#187; Up Next</div>
    <h1 style="font-size:22px;line-height:28px;margin:0 0 12px">${esc(heading)}</h1>
    <p style="font-size:15px;line-height:22px;margin:0 0 22px;color:#3a3f4a">${esc(body)}</p>
    <a href="${esc(link)}" style="display:inline-block;background:#c6f432;color:#0e0f12;font-weight:700;font-size:15px;text-decoration:none;padding:12px 18px;border-radius:10px">${esc(button)}</a>
    ${note ? `<p style="font-size:13px;line-height:19px;margin:22px 0 0;color:#6f7480">${esc(note)}</p>` : ''}
  </div>
  <p dir="${dir}" style="max-width:480px;margin:14px auto 0;font-size:12px;line-height:18px;color:#8e939e;text-align:center">
    ${esc(t.footer)} <a href="${esc(accountLink)}" style="color:#6f7480">${esc(t.turnOff)}</a>
  </p>
</body>
</html>`
  return { text, html }
}

export type AfterReminder = { locale: Locale; game: string; list: string; who: string; link: string; accountLink: string }

/** The After-score reminder in the reader's language: subject, plain text and HTML. */
export function afterReminderEmail({ locale, game, list, who, link, accountLink }: AfterReminder): Message {
  const t = dictionaries[locale].email
  return {
    subject: t.subject(game),
    ...layout({ locale, heading: t.heading(game), body: t.body(who, list), button: t.button, link, note: t.missed, accountLink }),
  }
}

async function deliver(cfg: Config, to: { name: string; address: string }, locale: Locale, message: Message) {
  const from = cfg.kind === 'gmail' ? { name: 'Up Next', address: cfg.user } : 'Up Next <upnext@localhost>'
  const result = await transportFor(cfg).sendMail({ from, to, ...message })
  if (cfg.kind === 'log') {
    console.log('[email] (log)', JSON.stringify({ to: to.name, locale, subject: message.subject, size: String(result.message).length }))
    if (process.env.EMAIL_LOG_DIR) await saveCopy(process.env.EMAIL_LOG_DIR, `${to.name}-${locale}-${message.subject.slice(0, 24)}`, message.html)
  }
}

const links = () => {
  const base = siteUrl().replace(/\/$/, '')
  return { base, accountLink: `${base}/account#email` }
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

  const { base, accountLink } = links()
  const link = `${base}/lists/${listId}/games/${gameId}?played=1`
  let sent = 0
  let failed = 0
  for (const person of people) {
    const locale: Locale = isLocale(person.locale) ? person.locale : 'en'
    try {
      const message = afterReminderEmail({ locale, game: info.game, list: info.list, who: info.who, link, accountLink })
      await deliver(cfg, { name: person.name, address: person.email }, locale, message)
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

/** "Zac invited you to Squad Night": sent when someone is invited from Find friends. */
export async function sendInviteEmail(listId: string, toUser: string, fromUser: string): Promise<void> {
  const cfg = emailConfig()
  if (!cfg) return
  const sql = db()
  const [row] = await sql<{ email: string; name: string; locale: string | null; list_name: string; from_name: string }[]>`
    select * from public.invite_email_info(${listId}::uuid, ${toUser}::uuid, ${fromUser}::uuid)`
  if (!row) return
  const [members] = await sql<{ names: string[] }[]>`
    select coalesce(array_agg(p.display_name order by m.joined_at), '{}') as names
    from public.list_members m join public.profiles p on p.id = m.user_id where m.list_id = ${listId}::uuid`
  const locale: Locale = isLocale(row.locale) ? row.locale : 'en'
  const t = dictionaries[locale].email
  const names = new Intl.ListFormat(intlLocale(locale), { type: 'conjunction' }).format(members?.names ?? [])
  const { base, accountLink } = links()
  const message: Message = {
    subject: t.inviteSubject(row.from_name, row.list_name),
    ...layout({
      locale,
      heading: t.inviteHeading(row.list_name),
      body: t.inviteBody(row.from_name, names),
      button: t.inviteButton,
      link: `${base}/lists`,
      accountLink,
    }),
  }
  try {
    await deliver(cfg, { name: row.name, address: row.email }, locale, message)
    console.log('[email] invite sent')
  } catch (e) {
    console.error('[email] invite failed:', (e as Error).message)
  }
}
