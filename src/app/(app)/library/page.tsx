import Link from 'next/link'
import type { Metadata } from 'next'
import { getLibrary, getMyLists, isUuid } from '@/lib/data'
import { getT } from '@/i18n/server'
import { Icon, btn, cx } from '@/components/ui'
import { LibraryView } from '@/components/library-view'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).meta.library }
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const { list } = await searchParams
  const [library, lists, t] = await Promise.all([getLibrary(), getMyLists(), getT()])
  const preselect = list && isUuid(list) && lists.some((l) => l.id === list) ? list : null

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-5 pt-4 pb-10 lg:gap-6 lg:px-10 lg:pt-7">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[26px] leading-8 font-bold tracking-tight lg:text-[28px] lg:leading-[34px]">{t.library.title}</h1>
          <p className="text-[13px] text-muted lg:text-sm">
            {t.library.subtitle(library.games.length)}
          </p>
        </div>
        <Link href={preselect ? `/library/add?list=${preselect}` : '/library/add'} aria-label={t.library.addGame} className={cx(btn.primary, 'shrink-0 px-3 lg:px-4')}>
          <Icon.plus size={18} />
          <span className="hidden sm:inline">{t.library.addGame}</span>
        </Link>
      </header>
      <LibraryView
        games={library.games}
        categories={library.categories}
        lists={lists.map((l) => ({ id: l.id, name: l.name, member_count: l.member_count }))}
        preselectList={preselect}
      />
    </main>
  )
}
