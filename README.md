# Up Next

Friends score games **Before** (hype) and **After** (played). Shared lists rank the games so the group knows what to play next.

- Scores live on your profile and fill into every list you're in, so you never score the same game twice.
- Your personal score is **30% Before + 70% After** when you have both, otherwise whichever one you have.
- A list's group score is the plain average of its members' personal scores. Members who haven't scored a game don't count.
- A game is ranked once half the members (rounded up, at least 2) have scored it.
- Scoring is blind: you see the group's scores on a game only after you score it yourself.
- "Only playable games" is on by default. A game waits outside the ranking when someone says they can't play it. The list creator can turn this off.

Built with Next.js 16, React 19, Tailwind 4 and Supabase (Postgres + Auth). All ranking rules live in the database (`supabase/migrations`) and are tested in `db/tests/rules.sql`.

---

## Run it on your computer

You need Node 20+ and Postgres 16 (Docker is not needed).

```bash
npm install
cp .env.example .env.local
```

In `.env.local` set:

```
AUTH_MODE=dev
DATABASE_URL=postgres://postgres@localhost:54322/upnext
```

Then:

```bash
npm run db:reset   # fresh local database with sample players, games and lists
npm run dev        # http://localhost:3000
```

`AUTH_MODE=dev` replaces sign-in with a picker of sample players (Zac, Karim, Yassine, Omar, Mehdi, Ilyas), so you can test as several friends. The app refuses to start in this mode on Vercel.

`scripts/db-local.sh` expects Postgres on `localhost:54322` as user `postgres`. Change `PGHOST`, `PGPORT` or `PGUSER` if yours differs. It loads `db/dev/stub-supabase.sql` first, a small stand-in for Supabase's `auth` schema. **Never run the stub on a real Supabase project.**

### Checks

```bash
npm run typecheck
npm run db:test             # rule checks: math, threshold, blind scoring, playable filter, permissions, search, pictures
npm run test:search         # search ranking: typos, partial words, DLC below games, merging Steam/IGDB results
npm run build && npm start  # then, in another terminal:
npm run db:reset && npm run e2e   # clicks through the app as Zac and Mehdi; screenshots go to e2e/shots/
```

The end-to-end flow changes data, so reseed before each run.

---

## Put it online

You'll set up four things: Supabase (database + sign-in), Discord (sign-in button), Twitch (the game catalog) and Vercel (hosting).

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com). The free plan allows two active projects. Pause or delete an old one if you're at the limit.
2. **SQL Editor** → paste all of `supabase/migrations/20261021120000_up_next.sql` → Run. (With the Supabase CLI: `supabase link` then `supabase db push`.)
3. Note these values:
   - **Project Settings → API**: Project URL → `NEXT_PUBLIC_SUPABASE_URL`, publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Connect → Transaction pooler** (port 6543) connection string, with your database password → `DATABASE_URL`

`DATABASE_URL` holds the database password. It is only read on the server, so never prefix it with `NEXT_PUBLIC_`.

### 2. Sign-in addresses

**Authentication → URL Configuration**

- Site URL: your live address, e.g. `https://upnext.vercel.app`
- Redirect URLs: add `https://upnext.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`

### 3. Discord sign-in

1. [discord.com/developers/applications](https://discord.com/developers/applications) → New Application → **OAuth2**.
2. Under Redirects, add `https://YOUR-PROJECT.supabase.co/auth/v1/callback` (the address of Supabase, not of your app).
3. Copy the Client ID and Client Secret.
4. Supabase → **Authentication → Sign In / Providers → Discord** → enable it and paste both.

Players get their Discord display name automatically and can change it in Account.

### 4. Email and password sign-in

Email sign-in is on by default in Supabase. Two things to decide:

- **Confirm email.** When it's on, new players must click a link before signing in. Supabase's built-in mailer only sends a few emails per hour, which is fine for a small circle. For more, add your own SMTP (e.g. Resend) under **Authentication → Emails → SMTP Settings**, or turn confirmation off while it's just friends.
- **Confirmation link that works on any device.** By default, the link only works in the browser where the player signed up. To make it work anywhere, open **Authentication → Emails → Confirm signup** and replace the link with:

  ```
  {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/
  ```

### 5. Game catalog (Steam + IGDB)

Game search asks three places at once and merges the answers: games already in Up Next (with typo-tolerant matching in the database), Steam's store search (no key needed; it corrects typos and knows what's popular), and IGDB, which also covers games that aren't on Steam. IGDB signs in through Twitch:

1. [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → Register Your Application.
2. OAuth Redirect URL: `http://localhost`. Category: Application Integration. Client type: Confidential.
3. Copy the Client ID and create a secret → `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`.

Without these, search still uses Steam and the games already in the app, and players can add a game by name. Each search writes one `[search]` line to the server logs (the query, how many results each source gave, the top three and any source that failed).

### 6. Vercel

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Add the environment variables from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`
   - `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`
   - `NEXT_PUBLIC_SITE_URL` (your live address)
3. Deploy. Do **not** add `AUTH_MODE`.

### 7. Email reminders (optional, no domain needed)

When a group marks a game "played together", everyone who still owes an After score gets one email, in their language, with a link straight to that game. Nobody gets the same reminder twice, the person who marked it gets none, and anyone can turn them off in Account → Email reminders. The same reminder always shows in To score, emails or not.

Emails go out through a Gmail account:

1. Use a separate Gmail account for the app if you can (friends see its address as the sender).
2. Turn on 2-Step Verification for that account, then create an app password: Google Account → Security → 2-Step Verification → App passwords.
3. In Vercel, add `GMAIL_USER` (the Gmail address) and `GMAIL_APP_PASSWORD` (the 16 letters), then redeploy.

A personal Gmail account can send to about 500 people a day. With your own domain later, a service such as Resend can replace Gmail; only `src/lib/email.ts` changes. Each batch writes one `[email]` line to the server logs (the game, how many sent, how many failed).

### 8. Steam (import games, find Steam friends)

Players connect Steam from Account. They sign in on Steam's own page (Steam OpenID, no key needed), and the app confirms the sign-in with Steam before linking the account. With a Steam Web API key, the app then imports the games they own (each one joins their library once, as "I can play this"), reads playtime for the "Played on Steam" nudges in To score, and saves their Steam friends for Find friends.

1. Get a key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) (the Steam account must have spent at least $5). Domain: your live address.
2. In Vercel, add `STEAM_WEB_API_KEY`, then redeploy.

Without the key, players can still connect Steam; importing starts once the key is there (they tap Sync again). A player whose Steam "Game details" are private gets told how to make them public. Each sync writes one `[steam]` line to the server logs.

### 9. Discord friend suggestions (opt-in)

Discord doesn't let apps read friends lists. Instead, on Find friends a player can let Up Next read which Discord servers they're in; only servers with 100 members or fewer are kept, and two players are suggested to each other only when both turned this on and share one of those servers. The Discord token is handed back to Discord straight away.

1. In the Discord developer portal, open the app you use for sign-in → OAuth2 → Redirects, and add `https://YOUR-SITE/api/discord/callback`.
2. In Vercel, add `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` (same OAuth2 page), then redeploy.

---

## Where things are

| Path | What it holds |
| --- | --- |
| `supabase/migrations/` | Tables, row-level security and every rule as a Postgres function (`list_board`, `save_score`, `join_list`, …) |
| `db/tests/rules.sql` | Rule tests |
| `db/dev/` | Local-only auth stand-in and sample data |
| `src/app/(app)/` | Screens: lists, a list's board, game page, library, To score, account |
| `src/app/actions.ts` | Server actions; each one runs its database function as the signed-in player |
| `src/lib/db.ts` | `asUser()` sets the player for a transaction, so `auth.uid()` works inside the SQL functions |
| `src/lib/igdb.ts` | Game catalog search |
| `src/proxy.ts` | Keeps the Supabase session fresh and sends signed-out visitors to `/login` |
| `src/i18n/` | Languages: English (`messages/en.ts`, the source), French and Arabic. TypeScript checks every language has every message |
| `src/lib/connect/` | Steam sign-in check, Steam Web API, Discord servers |
| `e2e/flow.mjs` | Browser test of the main journey, including Steam, Discord, invites, Arabic (right to left) and French |
| `e2e/mock-services.mjs` | Fake Steam and Discord for that test (`npm run build && npm run e2e:serve`, then `npm run e2e`) |

### Languages

The app speaks English, French and Arabic. A player's choice (Account → Language, or the switcher on the sign-in page) is kept in a cookie on that device and on their profile, so it follows them to other devices; before they choose, the browser's language is used. To add or change a sentence, edit `src/i18n/messages/en.ts`, then the same key in `fr.ts` and `ar.ts` (`npm run typecheck` lists any that are missing). Arabic plurals have six forms; use `plural()` from `src/i18n/format.ts`. Layout uses logical classes (`ms-`, `pe-`, `start-`, `text-end`) so it mirrors on its own in Arabic.

## What's next

- **Phase 2:** live: After-score reminders in To score and by email, install to the home screen, French and Arabic.
- **Phase 3:** Connect Steam (import owned games, playtime nudges, Sync again), Find friends (Steam friends, small Discord servers), invites to lists.
- **Phase 4:** research other platforms (Xbox, PlayStation, Epic have no public library API; manual add covers them).
