import Link from 'next/link'
import type { Metadata } from 'next'
import { requireMe } from '@/lib/auth'
import { db } from '@/lib/db'
import { getLibrary, getMyLists, isUuid } from '@/lib/data'
import { Icon } from '@/components/ui'
import { AddGameForm } from '@/components/add-game-form'

export const metadata: Metadata = { title: 'Add a game' }

export default async function AddGamePage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const { list } = await searchParams
  const me = await requireMe()
  const [library, lists, links] = await Promise.all([
    getLibrary(),
    getMyLists(),
    db()<{ list_id: string; category_id: string }[]>`
      select lc.list_id, lc.category_id
      from public.list_categories lc
      join public.categories c on c.id = lc.category_id
      where c.owner_id = ${me.id}`,
  ])
  const preselect = list && isUuid(list) && lists.some((l) => l.id === list) ? list : null

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-5 pt-2 pb-10 lg:gap-6 lg:px-10 lg:pt-7">
      <header className="flex items-center gap-1">
        <Link href="/library" aria-label="Back to library" className="-ml-3 flex size-11 items-center justify-center lg:hidden">
          <Icon.back size={22} />
        </Link>
        <h1 className="font-display text-xl leading-[26px] font-bold lg:text-[28px] lg:leading-[34px]">Add a game</h1>
      </header>
      <AddGameForm
        categories={library.categories}
        ownedIds={library.games.map((g) => g.id)}
        preselectList={preselect}
        lists={lists.map((l) => ({
          id: l.id,
          name: l.name,
          member_count: l.member_count,
          linked_category_ids: links.filter((x) => x.list_id === l.id).map((x) => Number(x.category_id)),
        }))}
      />
    </main>
  )
}
