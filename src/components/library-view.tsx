'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addGamesToLists } from '@/app/actions'
import { fmtScore } from '@/lib/format'
import type { LibraryGame } from '@/lib/types'
import { Cover, Icon, btn, cx } from './ui'

type View = 'grid' | 'details'
type SortKey = 'score' | 'name' | 'before' | 'after' | 'cats' | 'play' | 'lists' | 'added'
type ListOption = { id: string; name: string; member_count: number }

const VIEW_KEY = 'upnext-library-view'

const sortValue: Record<SortKey, (g: LibraryGame) => string | number> = {
  score: (g) => g.personal ?? -1,
  name: (g) => g.title.toLowerCase(),
  before: (g) => g.before ?? -1,
  after: (g) => g.after ?? -1,
  cats: (g) => g.categories.map((c) => c.name).join(' ').toLowerCase(),
  play: (g) => (g.can_play ? 1 : 0),
  lists: (g) => g.lists.length,
  added: (g) => g.added_at,
}
const sortName: Record<SortKey, string> = {
  score: 'Your score',
  name: 'Name',
  before: 'Before',
  after: 'After',
  cats: 'Categories',
  play: 'Can play',
  lists: 'In lists',
  added: 'Added',
}
const textKeys: SortKey[] = ['name', 'cats']

export function LibraryView({
  games,
  categories,
  lists,
  preselectList,
}: {
  games: LibraryGame[]
  categories: { id: number; name: string; count: number }[]
  lists: ListOption[]
  preselectList: string | null
}) {
  const [view, setView] = useState<View>('grid')
  const [cat, setCat] = useState<number | 'all'>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'score', dir: -1 })
  const [selecting, setSelecting] = useState(Boolean(preselectList))
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [panel, setPanel] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY)
      if (saved === 'grid' || saved === 'details') setView(saved)
    } catch {
      /* storage blocked: keep the default */
    }
  }, [])

  function chooseView(v: View) {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignore */
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return games
      .filter((g) => cat === 'all' || g.categories.some((c) => c.id === cat))
      .filter((g) => !q || g.title.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        const x = sortValue[sort.key](a)
        const y = sortValue[sort.key](b)
        return x < y ? -sort.dir : x > y ? sort.dir : a.title.localeCompare(b.title)
      })
  }, [games, cat, query, sort])

  function sortBy(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: textKeys.includes(key) ? 1 : -1 }))
  }
  function cycleSort() {
    const order: SortKey[] = ['score', 'name', 'before', 'after', 'added']
    const next = order[(order.indexOf(sort.key) + 1) % order.length] ?? 'score'
    setSort({ key: next, dir: textKeys.includes(next) ? 1 : -1 })
  }
  function toggle(id: number) {
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const allShownPicked = shown.length > 0 && shown.every((g) => picked.has(g.id))
  function toggleAllShown() {
    setPicked((p) => {
      const n = new Set(p)
      if (allShownPicked) shown.forEach((g) => n.delete(g.id))
      else shown.forEach((g) => n.add(g.id))
      return n
    })
  }

  const sortLabel = textKeys.includes(sort.key)
    ? `${sortName[sort.key]}, ${sort.dir === 1 ? 'A–Z' : 'Z–A'}`
    : `${sortName[sort.key]}, ${sort.dir === -1 ? 'high first' : 'low first'}`
  const pickedGames = games.filter((g) => picked.has(g.id))
  const preselectName = lists.find((l) => l.id === preselectList)?.name

  const chip = (on: boolean) =>
    cx('flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px]', on ? 'bg-ink font-semibold text-ground' : 'bg-surface text-ink hover:bg-raised')
  const seg = (on: boolean) =>
    cx('flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13px]', on ? 'bg-active font-medium text-ink' : 'text-muted hover:text-ink')

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {preselectName && selecting && (
        <p className="rounded-xl bg-accent-tint px-4 py-3 text-[13.5px] text-accent">
          Pick games, then add them to {preselectName}. You can also tick other lists.
        </p>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <label className="flex min-h-11 items-center gap-2.5 rounded-xl bg-surface px-3.5 shadow-[inset_0_0_0_1px_var(--color-active)] focus-within:shadow-[inset_0_0_0_1px_var(--color-accent)] lg:min-h-9 lg:w-64 lg:rounded-lg">
          <Icon.search size={16} className="text-muted" />
          <span className="sr-only">Search your library</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your library"
            className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-faint focus:outline-none lg:text-sm"
          />
        </label>
        <div role="group" aria-label="Filter by category" className="-mx-5 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:flex-wrap lg:px-0">
          <button type="button" aria-pressed={cat === 'all'} onClick={() => setCat('all')} className={chip(cat === 'all')}>
            All <span className={cat === 'all' ? 'text-[#4a4f59]' : 'text-muted'}>{games.length}</span>
          </button>
          {categories.map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={chip(cat === c.id)}>
              {c.name} <span className={cat === c.id ? 'text-[#4a4f59]' : 'text-muted'}>{c.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 lg:ml-auto">
          <button type="button" onClick={cycleSort} className="flex min-h-9 items-center gap-1.5 text-[13px] text-muted hover:text-ink lg:hidden">
            Sort: <span className="font-medium text-ink">{sortLabel}</span>
            <Icon.sort size={14} />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={selecting}
              onClick={() => {
                setSelecting(!selecting)
                if (selecting) setPanel(false)
              }}
              className={cx('flex h-9 items-center rounded-[10px] px-3 text-[13px] font-medium', selecting ? 'bg-active text-ink' : 'bg-surface text-ink hover:bg-raised')}
            >
              {selecting ? 'Done' : 'Select'}
            </button>
            <div role="radiogroup" aria-label="View" className="flex gap-0.5 rounded-[10px] bg-surface p-0.5">
              <button type="button" role="radio" aria-checked={view === 'grid'} aria-label="Grid view" onClick={() => chooseView('grid')} className={seg(view === 'grid')}>
                <Icon.grid size={16} />
                <span className="hidden lg:inline">Grid</span>
              </button>
              <button type="button" role="radio" aria-checked={view === 'details'} aria-label="Details view" onClick={() => chooseView('details')} className={seg(view === 'details')}>
                <Icon.rows size={16} />
                <span className="hidden lg:inline">Details</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {selecting && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-raised px-4 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] lg:min-h-14 lg:px-5">
          <span className="font-semibold">{picked.size === 1 ? '1 game selected' : `${picked.size} games selected`}</span>
          <span className="hidden min-w-0 flex-1 truncate text-[13px] text-muted lg:block">{pickedGames.map((g) => g.title).join(', ')}</span>
          <span className="ml-auto flex items-center gap-1">
            <button type="button" onClick={toggleAllShown} className={cx(btn.ghost, 'min-h-9 px-2.5 text-[13px]')}>
              {allShownPicked ? 'Unselect shown' : cat === 'all' ? 'Select all' : `Select all ${categories.find((c) => c.id === cat)?.name ?? ''}`}
            </button>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => setPanel(true)}
              className={cx(btn.primary, 'min-h-9 px-3.5 text-[13.5px] lg:min-h-9')}
            >
              Add to lists
            </button>
          </span>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-muted">{games.length ? 'No games match.' : 'Your library is empty. Add the games you play or want to play.'}</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(148px,1fr))] lg:gap-x-5 lg:gap-y-6">
          {shown.map((g) => (
            <GridItem key={g.id} g={g} selecting={selecting} selected={picked.has(g.id)} onToggle={() => toggle(g.id)} />
          ))}
        </div>
      ) : (
        <DetailsTable games={shown} selecting={selecting} picked={picked} onToggle={toggle} sort={sort} onSort={sortBy} />
      )}

      {panel && (
        <AddToListsPanel
          games={pickedGames}
          lists={lists}
          preselect={preselectList}
          onClose={() => setPanel(false)}
          onDone={() => {
            setPanel(false)
            setPicked(new Set())
            setSelecting(false)
          }}
        />
      )}
    </div>
  )
}

function Check({ on, round }: { on: boolean; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'flex size-[22px] shrink-0 items-center justify-center',
        round ? 'rounded-full' : 'rounded-md',
        on ? 'bg-accent text-ground' : round ? 'border-2 border-ink bg-ground/60' : 'border-2 border-[#5a606c]',
      )}
    >
      {on && <Icon.check size={13} strokeWidth={3.2} />}
    </span>
  )
}

function GridItem({ g, selecting, selected, onToggle }: { g: LibraryGame; selecting: boolean; selected: boolean; onToggle: () => void }) {
  const body = (
    <>
      <span className={cx('relative block rounded-lg', selected && 'outline-2 outline-offset-2 outline-accent')}>
        <Cover src={g.cover_url} title={g.title} className="w-full rounded-lg lg:rounded-[10px]" />
        {selecting && (
          <span className="absolute top-1.5 right-1.5">
            <Check on={selected} round />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium lg:text-sm lg:font-semibold">{g.title}</span>
        <span className="flex gap-2 text-xs tnum lg:text-[12.5px]">
          <span className="text-hype">Before {fmtScore(g.before)}</span>
          <span className={g.after !== null ? 'text-ink' : 'text-faint'}>After {fmtScore(g.after)}</span>
        </span>
        {!g.can_play && <span className="text-xs text-muted">You can&apos;t play it yet</span>}
      </span>
    </>
  )
  if (selecting) {
    return (
      <button type="button" aria-pressed={selected} aria-label={g.title} onClick={onToggle} className="flex min-w-0 flex-col gap-2 text-left">
        {body}
      </button>
    )
  }
  return (
    <Link href={`/library/${g.id}`} className="flex min-w-0 flex-col gap-2">
      {body}
    </Link>
  )
}

function DetailsTable({
  games,
  selecting,
  picked,
  onToggle,
  sort,
  onSort,
}: {
  games: LibraryGame[]
  selecting: boolean
  picked: Set<number>
  onToggle: (id: number) => void
  sort: { key: SortKey; dir: 1 | -1 }
  onSort: (k: SortKey) => void
}) {
  const router = useRouter()
  const head = (key: SortKey, label: string, cls: string, right = false) => {
    const on = sort.key === key
    return (
      <button
        type="button"
        role="columnheader"
        aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
        onClick={() => onSort(key)}
        className={cx(
          'flex min-h-9 items-center gap-1 px-3 text-[12.5px] whitespace-nowrap lg:shadow-[inset_1px_0_0_var(--color-line)]',
          right && 'justify-end',
          on ? 'font-semibold text-ink' : 'text-muted hover:text-ink',
          cls,
        )}
      >
        {label}
        {on && <span className="text-accent">{sort.dir === 1 ? '↑' : '↓'}</span>}
      </button>
    )
  }
  const cols =
    'grid-cols-[minmax(0,1fr)_44px_44px_44px] lg:grid-cols-[minmax(200px,1.8fr)_minmax(130px,1fr)_72px_72px_100px_88px_minmax(200px,1.6fr)_116px]'
  return (
    <div role="table" aria-label="Games" className="-mx-1 overflow-x-auto px-1">
      <div className={cx('lg:min-w-[980px]', selecting && 'pl-0')}>
        <div role="row" className={cx('grid items-stretch border-b border-line', cols, selecting && 'pl-9 lg:pl-11')}>
          {head('name', 'Name', 'lg:shadow-none pl-0 lg:pl-3')}
          {head('cats', 'Categories', 'hidden lg:flex')}
          {head('before', 'Before', 'px-0 lg:px-3', true)}
          {head('after', 'After', 'px-0 lg:px-3', true)}
          {head('score', 'You', 'px-0 lg:hidden', true)}
          {head('score', 'Your score', 'hidden lg:flex', true)}
          {head('play', 'Can play', 'hidden lg:flex')}
          {head('lists', 'In lists', 'hidden lg:flex')}
          {head('added', 'Added', 'hidden lg:flex', true)}
        </div>
        {games.map((g) => {
          const on = picked.has(g.id)
          return (
            <div
              key={g.id}
              role="row"
              aria-selected={selecting ? on : undefined}
              tabIndex={0}
              onClick={() => (selecting ? onToggle(g.id) : router.push(`/library/${g.id}`))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (selecting) onToggle(g.id)
                  else router.push(`/library/${g.id}`)
                }
              }}
              className={cx(
                'relative grid min-h-14 cursor-pointer items-center border-b border-line-soft lg:min-h-[52px]',
                cols,
                selecting && 'pl-9 lg:pl-11',
                on && selecting ? 'bg-line-soft' : 'hover:bg-[#131418]',
              )}
            >
              {selecting && (
                <span className="absolute top-1/2 left-1 -translate-y-1/2 lg:left-3">
                  <Check on={on} />
                </span>
              )}
              <span role="cell" className="flex min-w-0 items-center gap-2.5 pr-2 lg:gap-3 lg:px-3">
                <Cover src={g.cover_url} title={g.title} className="w-[30px] shrink-0 rounded lg:w-[27px]" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium lg:font-semibold">{g.title}</span>
                  <span className="truncate text-xs text-muted lg:hidden">{g.categories.map((c) => c.name).join(' · ') || 'No category'}</span>
                </span>
              </span>
              <span role="cell" className="hidden truncate px-3 text-soft lg:block">
                {g.categories.map((c) => c.name).join(', ') || '—'}
              </span>
              <span role="cell" className="text-right text-hype tnum lg:px-3">
                {fmtScore(g.before)}
              </span>
              <span role="cell" className={cx('text-right tnum lg:px-3', g.after !== null ? 'text-ink' : 'text-[#6f7480]')}>
                {fmtScore(g.after)}
              </span>
              <span role="cell" className="text-right font-display font-bold tnum lg:px-3 lg:text-base">
                {fmtScore(g.personal)}
              </span>
              <span role="cell" className={cx('hidden px-3 lg:block', g.can_play ? 'text-soft' : 'text-hype')}>
                {g.can_play ? 'Yes' : 'Not yet'}
              </span>
              <span role="cell" className="hidden truncate px-3 text-soft lg:block">
                {g.lists.map((l) => l.name).join(', ') || 'Not in a list'}
              </span>
              <span role="cell" className="hidden px-3 text-right whitespace-nowrap text-muted tnum lg:block">
                {g.added_at.slice(0, 10)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AddToListsPanel({
  games,
  lists,
  preselect,
  onClose,
  onDone,
}: {
  games: LibraryGame[]
  lists: ListOption[]
  preselect: string | null
  onClose: () => void
  onDone: () => void
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set(preselect ? [preselect] : []))
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const note = (l: ListOption) => {
    const already = games.filter((g) => g.lists.some((x) => x.id === l.id)).length
    if (already === games.length) return `Already has ${games.length === 1 ? 'it' : `all ${games.length}`}`
    if (already === 0) return `Adds ${games.length === 1 ? 'it' : `${games.length} games`} · ${l.member_count} people`
    return `Adds ${games.length - already} new · ${already} already in`
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-center" role="presentation">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[rgba(5,6,8,0.6)]" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="atl-h"
        className="relative flex max-h-[85dvh] w-full flex-col gap-5 overflow-y-auto rounded-t-3xl bg-surface px-5 pt-2 pb-[max(24px,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(0,0,0,0.4)] lg:max-w-[440px] lg:rounded-2xl lg:p-6"
      >
        <span aria-hidden className="mx-auto h-1 w-10 rounded-full bg-[#3a3f4a] lg:hidden" />
        <div className="flex items-center gap-4">
          <span className="flex shrink-0">
            {games.slice(0, 3).map((g, i) => (
              <span key={g.id} style={{ marginLeft: i ? -14 : 0 }} className="rounded-md ring-2 ring-surface">
                <Cover src={g.cover_url} title={g.title} className="w-9 rounded-md" />
              </span>
            ))}
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 id="atl-h" className="font-display text-xl leading-[26px] font-bold">
              Add {games.length === 1 ? games[0]?.title : `${games.length} games`} to lists
            </h2>
            <span className="truncate text-[13px] text-muted">{games.map((g) => g.title).join(', ')}</span>
          </div>
        </div>

        {done ? (
          <p role="status" className="rounded-xl bg-accent-tint px-4 py-3 text-accent">
            {done}
          </p>
        ) : (
          <div className="flex flex-col rounded-2xl bg-ground py-1">
            {lists.map((l, i) => (
              <label key={l.id} className={cx('flex min-h-16 cursor-pointer items-center gap-3 px-4 py-2', i > 0 && 'border-t border-line')}>
                <input
                  type="checkbox"
                  className="size-[22px] shrink-0"
                  checked={chosen.has(l.id)}
                  onChange={() =>
                    setChosen((c) => {
                      const n = new Set(c)
                      if (n.has(l.id)) n.delete(l.id)
                      else n.add(l.id)
                      return n
                    })
                  }
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{l.name}</span>
                  <span className="text-[12.5px] text-muted">{note(l)}</span>
                </span>
              </label>
            ))}
            {lists.length === 0 && <p className="px-4 py-3 text-muted">You&apos;re not in any lists yet.</p>}
            <Link href="/lists#new" className="flex min-h-[52px] items-center gap-3 border-t border-line px-4 text-ink">
              <Icon.plus size={20} className="text-muted" />
              New list
            </Link>
          </div>
        )}

        {!done && <p className="text-[13px] text-muted">Your scores go in with them. Friends who haven&apos;t scored a game get it in their To score queue.</p>}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <button type="button" onClick={done ? onDone : onClose} className={btn.secondary}>
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button
              type="button"
              disabled={chosen.size === 0 || pending}
              onClick={() =>
                start(async () => {
                  setError(null)
                  const res = await addGamesToLists(
                    games.map((g) => g.id),
                    [...chosen],
                  )
                  if (!res.ok) setError(res.error)
                  else setDone(res.data === 0 ? 'Those lists already had these games.' : `Added ${res.data} ${res.data === 1 ? 'game' : 'games'} across ${chosen.size === 1 ? '1 list' : `${chosen.size} lists`}.`)
                })
              }
              className={btn.primary}
            >
              {pending ? 'Adding…' : chosen.size === 0 ? 'Choose a list' : `Add to ${chosen.size === 1 ? '1 list' : `${chosen.size} lists`}`}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
