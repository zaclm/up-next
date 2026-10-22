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
npm run db:test             # 36 rule checks: math, threshold, blind scoring, playable filter, permissions
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

### 5. Game catalog (IGDB)

Game search uses IGDB, which signs in through Twitch:

1. [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → Register Your Application.
2. OAuth Redirect URL: `http://localhost`. Category: Application Integration. Client type: Confidential.
3. Copy the Client ID and create a secret → `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`.

Without these, search still finds games already in the app, and players can add a game by name.

### 6. Vercel

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Add the environment variables from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`
   - `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`
   - `NEXT_PUBLIC_SITE_URL` (your live address)
3. Deploy. Do **not** add `AUTH_MODE`.

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
| `e2e/flow.mjs` | Browser test of the main journey |

## What's next

- **Phase 2:** Arabic and French, profile pages, notifications when a friend adds a game.
- **Phase 3:** Steam import (owned games and playtime, to fill "can play" and suggest After scores).
