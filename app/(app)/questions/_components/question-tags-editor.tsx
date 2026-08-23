'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { updateQuestionTags } from '@/lib/actions/questions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { useTagHistory } from '@/hooks/use-tag-history'
import { canonicalTag, hasTag, mergeTagPool, normalizeTag, suggestTags } from '@/lib/tag-suggest'

interface Props {
  questionId: string
  /** Tags as the server currently has them. */
  tags: string[]
  /** Tags already used elsewhere in the bank — the suggestion pool. */
  allTags: string[]
}

/**
 * Tag chips on a question card that can be added to and removed from in place.
 *
 * Tags are the one thing teachers re-file constantly, and opening the whole
 * edit form to drop a single wrong tag is more ceremony than the change
 * deserves. Removal still asks first: the chip is small and sits right against
 * its neighbour, so a stray click is easy.
 */
export function QuestionTagsEditor({ questionId, tags: serverTags, allTags }: Props) {
  const [tags, setTags] = useState(serverTags)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Re-sync only when the server value actually changes content, not on every
  // re-render — an optimistic list has to survive the parent re-rendering with
  // the pre-save data still underneath it.
  const serverKey = serverTags.join(' ')
  useEffect(() => { setTags(serverTags) }, [serverKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function save(next: string[], message: string) {
    const previous = tags
    setTags(next)
    setConfirming(null)
    setAddOpen(false)
    startTransition(async () => {
      const result = await updateQuestionTags(questionId, next)
      if ('error' in result && result.error) {
        setTags(previous)
        toast.error(result.error)
        return
      }
      toast.success(message)
    })
  }

  return (
    <>
      {tags.map(tag => (
        <span
          key={tag}
          className="group/tag relative inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border"
        >
          #{tag}
          <IconButton
            onClick={() => setConfirming(c => (c === tag ? null : tag))}
            disabled={isPending}
            label={`ลบแท็ก ${tag}`}
            size="2xs"
            variant="destructive"
            className="absolute -top-1.5 -right-1.5 size-4 rounded-full border-background opacity-0 transition-opacity focus-visible:opacity-100 group-hover/tag:opacity-100 group-focus-within/tag:opacity-100 pointer-coarse:opacity-100 disabled:opacity-0"
          >
            <X className="w-2.5 h-2.5" />
          </IconButton>

          {confirming === tag && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setConfirming(null)} />
              <Card radius="md" edge="ring" elevation="xl" padding="sm" className="absolute left-0 top-7 z-40 w-60">
                <p className="text-xs font-semibold text-foreground">
                  ลบแท็ก #{tag} ออกจากโจทย์นี้ใช่ไหม
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  ตัวโจทย์ยังอยู่ครบ แค่ไม่มีแท็กนี้ติดอยู่ และเพิ่มกลับมาใหม่ได้ทุกเมื่อ
                </p>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <Button
                    size="xs"
                    variant="destructive"
                    onClick={() => save(tags.filter(t => t !== tag), `ลบแท็ก #${tag} แล้ว`)}
                  >
                    ใช่ ลบแท็ก
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirming(null)}>
                    เก็บไว้ก่อน
                  </Button>
                </div>
              </Card>
            </>
          )}
        </span>
      ))}

      <div className="relative">
        <Button
          onClick={() => setAddOpen(o => !o)}
          disabled={isPending}
          aria-expanded={addOpen}
          size="xs"
          variant="outline"
          className="h-[22px] rounded-full border-dashed font-normal text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
        >
          <Plus /> แท็ก
        </Button>
        {addOpen && (
          <TagAddPopover
            tags={tags}
            allTags={allTags}
            onClose={() => setAddOpen(false)}
            onAdd={tag => save([...tags, tag], `เพิ่มแท็ก #${tag} แล้ว`)}
          />
        )}
      </div>
    </>
  )
}

/**
 * The add-a-tag dropdown, drawing on the same pool as the edit form's tag input
 * (tags saved in the bank plus the ones typed in this browser) so a tag added
 * from a card is spelled the way it already exists instead of becoming a
 * near-duplicate.
 */
function TagAddPopover({ tags, allTags, onAdd, onClose }: {
  tags: string[]
  allTags: string[]
  onAdd: (tag: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { history, remember } = useTagHistory()

  useEffect(() => { inputRef.current?.focus() }, [])

  const pool = useMemo(() => mergeTagPool(allTags, history), [allTags, history])
  const trimmed = normalizeTag(value)
  const suggestions = useMemo(() => suggestTags(pool, trimmed, tags, 6), [pool, trimmed, tags])
  const canCreate = !!trimmed && !hasTag(tags, trimmed) && !hasTag(pool, trimmed)

  function add(raw: string) {
    const tag = canonicalTag(pool, raw)
    if (!tag) return
    // Remembered even when the question already carries it: typing it is what
    // makes it a tag this teacher uses.
    remember(tag)
    if (hasTag(tags, tag)) { onClose(); return }
    onAdd(tag)
  }

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <Card radius="md" edge="ring" elevation="xl" className="absolute left-0 top-7 z-40 w-56 overflow-hidden">
        <div className="p-2">
          <Input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); onClose() }
              if (e.key === 'Enter') {
                e.preventDefault()
                if (trimmed) add(trimmed)
                else if (suggestions.length > 0) add(suggestions[0])
              }
            }}
            placeholder="พิมพ์แท็ก แล้วกด Enter"
            aria-label="แท็กที่จะเพิ่ม"
            className="text-xs"
          />
        </div>
        <div className="max-h-44 overflow-y-auto border-t border-border">
          {suggestions.map(tag => (
            <Button
              key={tag}
              onClick={() => add(tag)}
              variant="ghost"
              size="xs"
              className="h-auto w-full justify-start truncate rounded-none px-3 py-2 font-normal text-muted-foreground"
            >
              #{tag}
            </Button>
          ))}
          {canCreate && (
            <Button
              onClick={() => add(trimmed)}
              variant="ghost"
              size="xs"
              className="h-auto w-full justify-start truncate rounded-none px-3 py-2 text-primary"
            >
              + สร้างแท็กใหม่ &ldquo;{trimmed}&rdquo;
            </Button>
          )}
          {suggestions.length === 0 && !canCreate && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {trimmed ? 'โจทย์นี้มีแท็กนี้อยู่แล้ว' : 'ยังไม่มีแท็กให้เลือก — พิมพ์เพื่อสร้างใหม่ได้เลย'}
            </p>
          )}
        </div>
      </Card>
    </>
  )
}
