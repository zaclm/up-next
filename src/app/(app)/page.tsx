import { redirect } from 'next/navigation'
import { getMyLists } from '@/lib/data'

export default async function Home() {
  const lists = await getMyLists()
  redirect(lists[0] ? `/lists/${lists[0].id}` : '/lists')
}
