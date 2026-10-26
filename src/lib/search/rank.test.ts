// Search ranking tests: npm run test:search
// The candidate lists mirror what Steam's search returned for these queries (Oct 2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyCandidate, igdbFragment, looserQuery, mergeCandidates, rankCandidates, relevance, titleKey, type Candidate } from './rank.ts'

function steam(names: string[], kind: 'suggest' | 'search', firstId = 1000): Candidate[] {
  return names.map((n, i) => ({
    ...emptyCandidate(n),
    steam_appid: firstId + i,
    [kind === 'suggest' ? 'steamSuggestRank' : 'steamSearchRank']: i,
  }))
}
function top(query: string, groups: Candidate[][], n = 1) {
  return rankCandidates(query, mergeCandidates(groups)).slice(0, n).map((x) => x.c.title)
}

test('title keys ignore case, symbols, dots, apostrophes and a leading "The"', () => {
  assert.equal(titleKey('THE FINALS'), 'finals')
  assert.equal(titleKey('The Finals™'), 'finals')
  assert.equal(titleKey('R.E.P.O.'), 'repo')
  assert.equal(titleKey("Baldur's Gate 3"), 'baldurs gate 3')
  assert.equal(titleKey('Call of Duty®: Black Ops'), 'call of duty black ops')
  assert.equal(titleKey('the'), 'the')
})

test('a missing letter in the last word still finds THE FINALS ("the finl")', () => {
  const suggest = steam(['Steel Division 2 - The Fate of Finland', 'The Finnish War x Sotidrokhima: Finlandsaga', 'Wars Across The World: Finland 1808'], 'suggest', 1)
  const loose = steam(['THE FINALS', 'Find The Needle', 'Destiny 2: The Final Shape', 'Disco Elysium - The Final Cut'], 'search', 2073850)
  assert.deepEqual(top('the finl', [suggest, loose]), ['THE FINALS'])
})

test('typos: "heldivers", "valhem", "deep rok", "batlefield 1"', () => {
  assert.deepEqual(top('heldivers', [steam(['HELLDIVERS™ 2', 'Hell Dive', 'HELLDIVERS™ Dive Harder Edition', 'HELLDIVERS™ - Vehicles Pack'], 'suggest')]), ['HELLDIVERS™ 2'])
  assert.deepEqual(top('valhem', [steam(['Valheim Soundtrack', 'Valheim'], 'suggest')]), ['Valheim'])
  assert.deepEqual(top('deep rok', [steam(['Deep Rock Galactic', 'Deep Rock Galactic: Survivor', 'Deep Rock Galactic - Skullcrusher Pack'], 'suggest')]), ['Deep Rock Galactic'])
  assert.deepEqual(
    top('batlefield 1', [steam(['Battlefield 1 ™ Shortcut Kit: Ultimate Bundle', 'Battlefield™ 1', 'Battlefield 1 Shortcut Kit: Infantry Bundle'], 'suggest')]),
    ['Battlefield™ 1'],
  )
})

test('the start of a word or only the first word finds the game', () => {
  assert.deepEqual(top('rep', [steam(['DedRep Demo', 'RepCell Demo', 'STAR WARS™: The Old Republic™', 'R.E.P.O.', 'DedRep'], 'suggest')]), ['R.E.P.O.'])
  assert.deepEqual(top('lethal comp', [steam(['Lethal Lawns: Competitive Mowing Bloodsport', 'Lethal Company'], 'suggest')]), ['Lethal Company'])
  assert.deepEqual(top('lethal', [steam(['Lethal League Blaze', 'Lethal Company'], 'search')], 2).sort(), ['Lethal Company', 'Lethal League Blaze'])
  assert.ok(relevance('hell', 'Helldivers 2') >= 700)
  assert.ok(relevance('deep', 'Deep Rock Galactic') >= 700)
})

test('DLC, soundtracks and demos sit below the game', () => {
  const r = top('helldiver', [steam(['HELLDIVERS™ - Vehicles Pack', 'HELLDIVERS™ 2', 'HELLDIVERS™ - Weapons Pack'], 'suggest')], 3)
  assert.equal(r[0], 'HELLDIVERS™ 2')
})

test('a game friends already have in Up Next is merged with catalog results and ranked first', () => {
  const local: Candidate = { ...emptyCandidate('The Finals'), game_id: 7, players: 3, cover_url: 'https://images.igdb.com/x.jpg' }
  const igdb: Candidate = { ...emptyCandidate('The Finals'), igdb_id: 191694, igdbRank: 0, igdbRatings: 120, cover_url: 'https://images.igdb.com/y.jpg' }
  const st = steam(['THE FINALS'], 'search', 2073850)
  const merged = mergeCandidates([[local], st, [igdb]])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].game_id, 7)
  assert.equal(merged[0].steam_appid, 2073850)
  assert.equal(merged[0].igdb_id, 191694)
  assert.equal(merged[0].title, 'The Finals')
  assert.equal(merged[0].cover_url, 'https://images.igdb.com/x.jpg')
})

test('IGDB and Steam versions of a game merge into one result with IGDB’s name', () => {
  const igdb: Candidate = { ...emptyCandidate('Helldivers 2'), igdb_id: 250616, igdbRank: 0, cover_url: 'https://images.igdb.com/h.jpg' }
  const merged = mergeCandidates([steam(['HELLDIVERS™ 2'], 'suggest', 553850), [igdb]])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].title, 'Helldivers 2')
  assert.equal(merged[0].steam_appid, 553850)
  assert.equal(merged[0].cover_url, 'https://images.igdb.com/h.jpg')
})

test('two different games with the same name stay separate', () => {
  const a: Candidate = { ...emptyCandidate('Doom'), igdb_id: 1 }
  const b: Candidate = { ...emptyCandidate('Doom'), igdb_id: 2 }
  assert.equal(mergeCandidates([[a, b]]).length, 2)
})

test('looser query helpers', () => {
  assert.equal(looserQuery('the finl'), 'the fin')
  assert.equal(looserQuery('rep'), null)
  assert.equal(igdbFragment('the finals'), 'fin')
  assert.equal(igdbFragment('helldivers'), 'hell')
  assert.equal(igdbFragment('cs'), null)
})

test('reads Steam’s suggestion HTML (real answer for "heldiver")', async () => {
  const { parseSuggest } = await import('./steam-parse.ts')
  const html =
    '<a class="match match_app  match_category_top ds_collapse_flag"  data-ds-appid="553850" data-ds-itemkey="0_553850" data-ds-descids="[2,5]" href="https://store.steampowered.com/app/553850/HELLDIVERS_2?snr=1_7_15__13"><div class="match_name ">HELLDIVERS™ 2</div><div class="match_img"><img src="https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/553850/6de866c6fb786949a92a28d12f3e1c02d91bce60/capsule_231x87.jpg?t=1792487611"></div><div class="match_subtitle">$39.99</div></a>' +
    '<a class="match match_app   ds_collapse_flag"  data-ds-appid="3250020" data-ds-itemkey="0_3250020" data-ds-descids="[2,5]" href="https://store.steampowered.com/app/3250020/Hell_Dive?snr=1_7_15__13"><div class="match_name ">Hell Dive</div><div class="match_img"><img src="https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3250020/af9b78ab1375c08a0f1b332cee11ed0ada1f5cdc/capsule_231x87.jpg?t=1781141165"></div><div class="match_subtitle">$7.99</div></a>' +
    '<a class="match" href="https://store.steampowered.com/bundle/1234/Some_Bundle"><div class="match_name ">Some Bundle</div></a>' +
    '<a class="match" href="https://store.steampowered.com/app/9/X"><div class="match_name ">Tom &amp; Jerry&#39;s</div></a>'
  const hits = parseSuggest(html)
  assert.deepEqual(hits.map((h) => [h.appid, h.name]), [[553850, 'HELLDIVERS 2'], [3250020, 'Hell Dive'], [9, "Tom & Jerry's"]])
  assert.ok(hits[0].image?.includes('capsule_231x87'))
})
