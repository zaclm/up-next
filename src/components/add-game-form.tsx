'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addGameToLibrary } from '@/app/actions'
import { clampScore, fmtScore } from '@/lib/format'
import type { CatalogResult } from '@/lib/types'
import { CategoryPicker } from './category-picker'
import { Cover, Icon, btn, cx } from './ui'

type ListOption = { id: string; name: string; member_count: number; linked_category_ids: number[] }

export function AddGameForm({
  categories,
  lists,
  preselectList,
  ownedIds,
}: {
  categories: { id: number; name: string }[]
  lists: ListOption[]
  preselectList: string | null
  ownedIds: number[]
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogResult[]>([])
  const [searching, setSearching] = useState(false)
  const [igdbOn, setIgdbOn] = useState(true)
  const [pick, setPick] = useState<CatalogResult | null>(null)
  const [before, setBefore] = useState<number>(7)
  const [canPlay, setCanPlay] = useState(true)
  const [catIds, setCatIds] = useState<number[]>([])
  const [newCats, setNewCats] = useState<string[]>([])
  const [listIds, setListIds] = useState<string[]>(preselectList ? [preselectList] : [])
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    timer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/games/search?q=${encodeURIComponent(q)}`)
        const body = (await res.json()) as { results: CatalogResult[]; igdb: boolean }
        setResults(body.results ?? [])
        setIgdbOn(body.igdb)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
  }, [query])

  const manual: CatalogResult | null =
    query.trim().length >= 2 && !results.some((r) => r.title.toLowerCase() === query.trim().toLowerCase())
      ? { key: 'manual', igdb_id: null, game_id: null, title: query.trim(), cover_url: null, genres: [], release_year: null }
      : null

  function submit() {
    if (!pick) return
    setError(null)
    start(async () => {
      const res = await addGameToLibrary({
        gameId: pick.game_id,
        igdbId: pick.igdb_id,
        title: pick.title,
        coverUrl: pick.cover_url,
        genres: pick.genres,
        releaseYear: pick.release_year,
        before,
        canPlay,
        categoryIds: catIds,
        newCategories: newCats,
        listIds,
      })
      if (!res.ok) setError(res.error)
      else router.push(preselectList ? `/lists/${preselectList}` : '/library')
    })
  }

  const autoLists = lists.filter((l) => l.linked_category_ids.some((id) => catIds.includes(id))).map((l) => l.id)

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <section aria-labelledby="find-h" className="flex flex-col gap-3">
        <h2 id="find-h" className="text-base font-semibold">
          Find the game
        </h2>
        <label className="flex min-h-12 items-center gap-3 rounded-xl bg-surface px-4 shadow-[inset_0_0_0_1px_var(--color-active)] focus-within:shadow-[inset_0_0_0_1px_var(--color-accent)] lg:min-h-10">
          <Icon.search size={18} className="text-muted" />
          <span className="sr-only">Search games</span>
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPick(null)
            }}
            placeholder="Search games"
            className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-faint focus:outline-none"
          />
          {searching && <span className="text-xs text-muted">Searching…</span>}
        </label>
        {(results.length > 0 || manual) && (
          <ul className="flex flex-col rounded-2xl bg-surface py-1" aria-label="Search results">
            {[...results, ...(manual ? [manual] : [])].map((r, i) => {
              const owned = r.game_id !== null && ownedIds.includes(r.game_id)
              const on = pick?.key === r.key
              return (
                <li key={r.key} className={cx(i > 0 && 'border-t border-line')}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={owned}
                    onClick={() => setPick(r)}
                    className={cx('flex w-full items-center gap-3 px-4 py-3 text-left', on && 'bg-accent-tint/60', owned && 'opacity-60')}
                  >
                    {r.key === 'manual' ? (
                      <span className="flex aspect-[3/4] w-[42px] shrink-0 items-center justify-center rounded-md border border-dashed border-line-strong text-muted">
                        <Icon.plus size={18} />
                      </span>
                    ) : (
                      <Cover src={r.cover_url} title={r.title} className="w-[42px] shrink-0 rounded-md" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">{r.key === 'manual' ? `Add “${r.title}” by name` : r.title}</span>
                      <span className="truncate text-[12.5px] text-muted">
                        {owned
                          ? 'Already in your library'
                          : r.key === 'manual'
                            ? 'Not listed? Add it without a cover'
                            : [r.release_year, r.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ') || 'Game'}
                      </span>
                    </span>
                    {on && <Icon.check size={20} className="shrink-0 text-accent" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs text-muted">
          {igdbOn ? 'Game info from IGDB.' : 'Searching games already in Up Next. Connect IGDB for covers and the full catalog (see README).'}
        </p>
      </section>

      <section aria-labelledby="take-h" className={cx('flex flex-col gap-4', !pick && 'pointer-events-none opacity-40')} aria-disabled={!pick}>
        <h2 id="take-h" className="text-base font-semibold">
          {pick ? `Your take on ${pick.title}` : 'Your take'}
        </h2>
        <div className="flex flex-col rounded-2xl bg-surface">
          <div className="flex items-center gap-3 p-4">
            <span className="flex flex-1 flex-col">
              <span className="font-semibold">Before score</span>
              <span className="text-[12.5px] text-muted">How hyped are you? Add After once you&apos;ve played.</span>
            </span>
            <button type="button" aria-label="Lower Before score by 0.5" onClick={() => setBefore(clampScore(before - 0.5))} className="flex size-11 items-center justify-center rounded-full bg-active text-xl lg:size-9">
              −
            </button>
            <output aria-live="polite" className="w-12 text-center font-display text-[26px] font-bold text-hype tnum">
              {fmtScore(before)}
            </output>
            <button type="button" aria-label="Raise Before score by 0.5" onClick={() => setBefore(clampScore(before + 0.5))} className="flex size-11 items-center justify-center rounded-full bg-active text-xl lg:size-9">
              +
            </button>
          </div>
          <div className="px-4 pb-4">
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={before}
              onChange={(e) => setBefore(Number(e.target.value))}
              aria-label="Before score"
              className="h-2 w-full accent-[#f2a93b]"
            />
          </div>
          <label className="flex min-h-[52px] cursor-pointer items-center gap-3 border-t border-line px-4">
            <input type="checkbox" className="size-5" checked={canPlay} onChange={(e) => setCanPlay(e.target.checked)} />
            I can play this
          </label>
          <div className="flex flex-col gap-3 border-t border-line p-4">
            <span className="text-[13px] text-muted">Categories</span>
            <CategoryPicker categories={categories} selected={catIds} onChange={setCatIds} newNames={newCats} onNewNames={setNewCats} />
          </div>
        </div>

        {lists.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">Also add to</h3>
            <div className="flex flex-col rounded-2xl bg-surface py-1">
              {lists.map((l, i) => {
                const auto = autoLists.includes(l.id)
                return (
                  <label key={l.id} className={cx('flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2', i > 0 && 'border-t border-line')}>
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={auto || listIds.includes(l.id)}
                      disabled={auto}
                      onChange={() => setListIds((x) => (x.includes(l.id) ? x.filter((v) => v !== l.id) : [...x, l.id]))}
                    />
                    <span className="flex flex-col">
                      <span>{l.name}</span>
                      <span className="text-[12.5px] text-muted">{auto ? 'Gets it anyway: one of its categories is linked' : `${l.member_count} members`}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <button type="button" disabled={!pick || pending} onClick={submit} className={cx(btn.primary, 'w-full lg:w-auto lg:self-start')}>
          {pending ? 'Adding…' : 'Add to library'}
        </button>
      </section>
    </div>
  )
}
