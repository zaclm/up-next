// End-to-end check against a running local build (AUTH_MODE=dev, sample data loaded).
//   node e2e/flow.mjs [baseUrl] [screenshotDir]
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:3000'
const out = process.argv[3] ?? 'e2e/shots'
const problems = []
const log = (m) => console.log('•', m)
const expect = (ok, what) => { if (!ok) { problems.push(what); console.log('  ✗', what) } else console.log('  ✓', what) }

const browser = await chromium.launch()

async function session(name, viewport) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} console: ${m.text()}`) })
  page.on('pageerror', (e) => problems.push(`${name} page error: ${e.message}`))
  return { ctx, page }
}
async function signIn(page, who) {
  await page.goto(base + '/login')
  await page.getByRole('button', { name: who, exact: true }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}

// --- Zac on a phone ---------------------------------------------------------------------
const zac = await session('zac', { width: 390, height: 844 })
await zac.page.goto(base + '/')
expect(zac.page.url().includes('/login'), 'signed-out visitor is sent to /login')
await zac.page.screenshot({ path: `${out}/01-login-phone.png` })
await signIn(zac.page, 'Zac')
await zac.page.waitForSelector('text=Next up')
expect(await zac.page.getByRole('heading', { name: 'Squad Night' }).isVisible(), 'Zac lands on Squad Night')
expect(await zac.page.locator('section[aria-label="Next up"]').getByText('Helldivers 2').first().isVisible(), 'Helldivers 2 is next up')
expect((await zac.page.locator('section[aria-label="Next up"]').innerText()).includes('8.4'), 'group score 8.4 shows')
await zac.page.screenshot({ path: `${out}/02-board-phone.png`, fullPage: true })

log('blind scoring: open Lethal Company before scoring')
await zac.page.goto(base + '/')
await zac.page.locator('a', { hasText: 'Score' }).first().click()
await zac.page.waitForSelector('text=Have you played it?')
const before = await zac.page.locator('section[aria-labelledby="group-h"]').innerText()
expect(before.includes('?') && before.includes('Hidden'), 'others’ scores are hidden before Zac scores')
expect(!before.includes('8.4') && !before.includes('7.7'), 'no numbers leak before scoring')
await zac.page.screenshot({ path: `${out}/03-game-blind-phone.png`, fullPage: true })

log('Zac scores it: played, Before 8, After 6')
await zac.page.getByRole('button', { name: 'Yes, I have' }).click()
await zac.page.locator('#score-before').fill('8')
await zac.page.locator('#score-after').fill('6')
await zac.page.getByRole('button', { name: 'Save and show scores' }).click()
await zac.page.waitForSelector('text=/ranks #\\d/', { timeout: 10000 })
const after = await zac.page.locator('section[aria-labelledby="group-h"]').innerText()
expect(after.includes('7.8'), 'group score revealed: 7.8')
expect(after.includes('#3'), 'rank revealed: #3')
await zac.page.screenshot({ path: `${out}/04-game-revealed-phone.png`, fullPage: true })

log('library details view and add to lists')
await zac.page.goto(base + '/library')
await zac.page.getByRole('radio', { name: 'Details view' }).click()
await zac.page.screenshot({ path: `${out}/05-library-details-phone.png`, fullPage: true })
await zac.page.getByRole('button', { name: 'Select', exact: true }).click()
for (const t of ['Valheim', 'Raft', 'Phasmophobia']) await zac.page.getByRole('row', { name: new RegExp(t) }).click()
await zac.page.getByRole('button', { name: 'Add to lists' }).click()
await zac.page.waitForSelector('role=dialog')
await zac.page.screenshot({ path: `${out}/06-add-to-lists-phone.png` })
await zac.page.getByRole('dialog').getByLabel(/Brothers/).check()
await zac.page.getByRole('dialog').getByRole('button', { name: /Add to 1 list/ }).click()
await zac.page.getByRole('dialog').getByRole('status').waitFor()
expect((await zac.page.getByRole('dialog').getByRole('status').innerText()).startsWith('Added 3 games'), 'three games added to Brothers')
await zac.page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click()

// --- Zac on PC ----------------------------------------------------------------------------
const pc = await session('zac-pc', { width: 1440, height: 900 })
await signIn(pc.page, 'Zac')
await pc.page.waitForSelector('text=After that')
await pc.page.screenshot({ path: `${out}/07-board-pc.png`, fullPage: true })
await pc.page.goto(base + '/library')
await pc.page.getByRole('radio', { name: 'Details view' }).click()
await pc.page.getByRole('columnheader', { name: /Name/ }).click()
await pc.page.screenshot({ path: `${out}/08-library-details-pc.png`, fullPage: true })
await pc.page.getByRole('radio', { name: 'Grid view' }).click()
await pc.page.screenshot({ path: `${out}/09-library-grid-pc.png` })

log('create a list and invite Mehdi')
await pc.page.goto(base + '/lists')
await pc.page.getByPlaceholder(/Name a new list/).fill('Test Night')
await pc.page.getByRole('button', { name: 'Create list' }).click()
await pc.page.waitForSelector('h1:has-text("Test Night")')
expect(await pc.page.locator('aside').getByText('Test Night').isVisible(), 'sidebar shows the new list right away')
await pc.page.getByRole('link', { name: 'List settings and invite' }).click()
await pc.page.waitForSelector('text=Invite friends')
const code = (await pc.page.locator('#invite span.font-display').first().innerText()).trim()
expect(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), `invite code looks right (${code})`)
await pc.page.screenshot({ path: `${out}/10-settings-pc.png`, fullPage: true })

const mehdi = await session('mehdi', { width: 390, height: 844 })
await mehdi.page.goto(`${base}/join/${code}`)
expect(mehdi.page.url().includes('/login'), 'invite link asks Mehdi to sign in first')
await mehdi.page.getByRole('button', { name: 'Mehdi', exact: true }).click()
await mehdi.page.waitForSelector('text=You’re invited to, text=You\'re invited to').catch(() => {})
await mehdi.page.waitForSelector('text=Test Night')
await mehdi.page.screenshot({ path: `${out}/11-join-phone.png` })
await mehdi.page.getByRole('button', { name: 'Join' }).click()
await mehdi.page.waitForSelector('h1:has-text("Test Night")')
expect(true, 'Mehdi joined Test Night')

log('Mehdi adds a game by search')
await mehdi.page.goto(base + '/library/add')
await mehdi.page.getByPlaceholder('Search games').fill('lethal')
await mehdi.page.waitForSelector('text=Lethal Company')
await mehdi.page.getByRole('button', { name: /Lethal Company/ }).click()
await mehdi.page.getByLabel(/Test Night/).check()
await mehdi.page.screenshot({ path: `${out}/12-add-game-phone.png`, fullPage: true })
await mehdi.page.getByRole('button', { name: 'Add to library' }).click()
await mehdi.page.waitForURL(/\/library$/)
expect(await mehdi.page.getByText('Lethal Company').first().isVisible(), 'Lethal Company is in Mehdi’s library')

log('score once, used everywhere: Zac scored Lethal Company earlier, in another list')
await pc.page.goto(base + '/lists')
await pc.page.getByRole('link', { name: /Test Night/ }).first().click()
await pc.page.waitForSelector('section[aria-label="Next up"]')
const lead = await pc.page.locator('section[aria-label="Next up"]').innerText()
expect(lead.includes('Lethal Company') && lead.includes('6.8'), 'Zac’s earlier score filled into Test Night: (6.6 + 7) / 2 = 6.8')
await pc.page.screenshot({ path: `${out}/13-new-list-pc.png` })
await zac.page.goto(base + '/score')
await zac.page.screenshot({ path: `${out}/14-to-score-phone.png`, fullPage: true })

await browser.close()
console.log(problems.length ? `\n${problems.length} problem(s):\n- ${problems.join('\n- ')}` : '\nALL E2E CHECKS PASSED')
process.exit(problems.length ? 1 : 0)
