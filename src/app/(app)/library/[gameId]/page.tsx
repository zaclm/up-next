import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getLibrary, getMyLists } from '@/lib/data'
import { Cover, Icon, SectionHeading } from '@/components/ui'
import { ScoreForm } from '@/components/score-form'
import { CategoryEditor, ListsEditor, RemoveFromLibraryButton } from '@/components/library-game-editors'
import { joinNames } from '@/i18n/format'
import { getT } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).meta.game }
}

export default async function LibraryGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>
  searchParams: Promise<{ played?: string }>
}) {
  const [{ gameId }, { played }] = await Promise.all([params, searchParams])
  const [library, lists, t] = await Promise.all([getLibrary(), getMyLists(), getT()])
  const g = library.games.find((x) => String(x.id) === gameId)
  if (!g) notFound()

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-5 pt-2 pb-10 lg:px-10 lg:pt-7">
      <nav aria-label={t.game.breadcrumb} className="flex items-center gap-1 text-[13px] text-muted">
        <Link href="/library" className="-ms-3 flex min-h-11 items-center gap-1 px-3 hover:text-ink lg:ms-0 lg:min-h-0 lg:px-0">
          <Icon.back size={20} className="lg:hidden rtl:-scale-x-100" />
          {t.library.title}
        </Link>
        <span aria-hidden className="hidden lg:inline">/</span>
        <span className="hidden text-ink lg:inline"><bdi>{g.title}</bdi></span>
      </nav>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="flex items-end gap-4 lg:w-[240px] lg:shrink-0 lg:flex-col lg:items-stretch">
          <Cover src={g.cover_url} title={g.title} alt={t.common.coverAlt(g.title)} className="w-[112px] rounded-lg lg:w-full lg:rounded-xl" />
          <div className="flex min-w-0 flex-col gap-1 pb-1">
            <span className="text-xs text-muted">
              {[g.release_year, g.genres.slice(0, 3).join(', '), g.steam_min ? t.steam.playtime(g.steam_min) : null].filter(Boolean).join(' · ')}
            </span>
            <h1 className="font-display text-2xl leading-[30px] font-bold tracking-tight"><bdi>{g.title}</bdi></h1>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 gap-8 xl:grid-cols-2">
          <section aria-labelledby="score-h" className="flex flex-col gap-4">
            <SectionHeading id="score-h" title={t.game.yourScore} note={t.libraryGame.oneScoreNote} />
            <ScoreForm
              key={`${g.before}-${g.after}-${g.can_play}`}
              gameId={g.id}
              initial={{ before: g.before, after: g.after, canPlay: g.can_play }}
              saveLabel={t.game.updateScore}
              startPlayed={played === '1'}
            />
          </section>

          <div className="flex flex-col gap-8">
            <section aria-labelledby="cats-h" className="flex flex-col gap-3">
              <SectionHeading id="cats-h" title={t.libraryGame.categories} />
              <CategoryEditor gameId={g.id} categories={library.categories} initial={g.categories.map((c) => c.id)} />
            </section>

            <section aria-labelledby="lists-h" className="flex flex-col gap-3">
              <SectionHeading
                id="lists-h"
                title={t.libraryGame.lists}
                note={g.lists.length ? t.libraryGame.inLists(joinNames(t.locale, g.lists.map((l) => l.name))) : t.libraryGame.notInAny}
              />
              {g.lists.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {g.lists.map((l) => (
                    <Link key={l.id} href={`/lists/${l.id}/games/${g.id}`} className="flex min-h-9 items-center rounded-full bg-active px-3.5 text-[13.5px] hover:bg-[#343843]">
                      {t.libraryGame.openIn(l.name)}
                    </Link>
                  ))}
                </div>
              )}
              <ListsEditor
                gameId={g.id}
                inLists={g.lists.map((l) => l.id)}
                lists={lists.map((l) => ({ id: l.id, name: l.name, member_count: l.member_count }))}
              />
            </section>

            <section aria-label={t.libraryGame.remove} className="flex flex-col gap-2 border-t border-line pt-6">
              <RemoveFromLibraryButton gameId={g.id} />
              <p className="text-[12.5px] text-muted">{t.libraryGame.removeNote}</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
