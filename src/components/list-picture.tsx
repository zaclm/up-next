'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { clearListImage, markListSeen, setListImage } from '@/app/actions'
import { ListIcon } from './list-icon'
import { Icon, btn, cx } from './ui'

/** Crops the middle square of a photo and shrinks it, so uploads stay small and fast. */
async function squareImage(file: File, size = 320): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx || side === 0) throw new Error('bad image')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size)
    const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85))
    if (webp && webp.type === 'image/webp') return webp
    const jpg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.86))
    if (!jpg) throw new Error('bad image')
    return jpg
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ListPictureEditor({ listId, name, version }: { listId: string; name: string; version: number | null }) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function choose(file: File | undefined) {
    if (!file) return
    setError(null)
    start(async () => {
      let blob: Blob
      try {
        blob = await squareImage(file)
      } catch {
        setError('That file doesn’t look like a picture. Try a JPG or PNG.')
        return
      }
      const fd = new FormData()
      fd.set('image', blob, 'list.webp')
      const res = await setListImage(listId, fd)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <div className="flex items-center gap-4">
      <ListIcon id={listId} name={name} version={version} size={80} />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn.secondary} disabled={pending} onClick={() => input.current?.click()}>
            <Icon.image size={18} />
            {pending ? 'Saving…' : version ? 'Change picture' : 'Choose picture'}
          </button>
          {version && (
            <button
              type="button"
              className={cx(btn.ghost, 'px-3')}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await clearListImage(listId)
                  if (!res.ok) setError(res.error)
                })
              }
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-[12.5px] text-muted">Shows next to the list everywhere. Anyone in the list can change it.</p>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          choose(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Tells the server you've opened this list, so its new games stop being new next time. */
export function MarkListSeen({ listId }: { listId: string }) {
  useEffect(() => {
    void markListSeen(listId)
  }, [listId])
  return null
}
