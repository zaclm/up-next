import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getLibrary, getMyLists } from '@/lib/data'
import { Cover, Icon, SectionHeading } from '@/components/ui'
import { ScoreForm } from '@/components/score-form'
import { CategoryEditor, ListsEditor, RemoveFromLibraryButton } from '@/components/library-game-editors'

export const metadata: Metadata = { title: 'Game' }

export default async function LibraryGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  const [library, lists] = await Promise.all([getLibrary(), getMyLists()])
  const g = library.games.find((x) => String(x.id) === gameId)
  if (!g) notFound()

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-5 pt-2 pb-10 lg:px-10 lg:pt-7">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] text-muted">
        <Link href="/library" className="-ml-3 flex min-h-11 items-center gap-1 px-3 hover:text-ink lg:ml-0 lg:min-h-0 lg:px-0">
          <Icon.back size={20} className="lg:hidden" />
          My library
        </Link>
        <span aria-hidden className="hidden lg:inline">/</span>
        <span className="hidden text-ink lg:inline">{g.title}</span>
      </nav>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="flex items-end gap-4 lg:w-[240px] lg:shrink-0 lg:flex-col lg:items-stretch">
          <Cover src={g.cover_url} title={g.title} alt={`${g.title} cover`} className="w-[112px] rounded-lg lg:w-full lg:rounded-xl" />
          <div className="flex min-w-0 flex-col gap-1 pb-1">
            <span className="text-xs text-muted">{[g.release_year, g.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}</span>
            <h1 className="font-display text-2xl leading-[30px] font-bold tracking-tight">{g.title}</h1>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 gap-8 xl:grid-cols-2">
          <section aria-labelledby="score-h" className="flex flex-col gap-4">
            <SectionHeading id="score-h" title="Your score" note="One score, used in every list that has this game" />
            <ScoreForm
              key={`${g.before}-${g.after}-${g.can_play}`}
              gameId={g.id}
              initial={{ before: g.before, after: g.after, canPlay: g.can_play }}
              saveLabel="Update score"
            />
          </section>

          <div className="flex flex-col gap-8">
            <section aria-labelledby="cats-h" className="flex flex-col gap-3">
              <SectionHeading id="cats-h" title="Categories" />
              <CategoryEditor gameId={g.id} categories={library.categories} initial={g.categories.map((c) => c.id)} />
            </section>

            <section aria-labelledby="lists-h" className="flex flex-col gap-3">
              <SectionHeading
                id="lists-h"
                title="Lists"
                note={g.lists.length ? `In ${g.lists.map((l) => l.name).join(', ')}` : 'Not in any list yet'}
              />
              {g.lists.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {g.lists.map((l) => (
                    <Link key={l.id} href={`/lists/${l.id}/games/${g.id}`} className="flex min-h-9 items-center rounded-full bg-active px-3.5 text-[13.5px] hover:bg-[#343843]">
                      Open in {l.name}
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

            <section aria-label="Remove" className="flex flex-col gap-2 border-t border-line pt-6">
              <RemoveFromLibraryButton gameId={g.id} />
              <p className="text-[12.5px] text-muted">Removes your score and categories. The game stays in lists for your friends.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
