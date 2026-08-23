'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'
import { useTagHistory } from '@/hooks/use-tag-history'
import { canonicalTag, hasTag, mergeTagPool, normalizeTag, suggestTags, tagKey } from '@/lib/tag-suggest'

export function SmartTagInput({ allTags, tags, onTagsChange }: {
  allTags: string[]
  tags: string[]
  onTagsChange: (tags: string[]) => void
}) {
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const { history, remember, forget } = useTagHistory()

  const pool = useMemo(() => mergeTagPool(allTags, history), [allTags, history])
  const savedKeys = useMemo(() => new Set(allTags.map(tagKey)), [allTags])

  const trimmed = normalizeTag(inputValue)
  const suggestions = useMemo(
    () => suggestTags(pool, trimmed, tags),
    [pool, trimmed, tags]
  )
  const canCreate = !!trimmed && !hasTag(tags, trimmed) && !hasTag(pool, trimmed)
  const showDropdown = open && (suggestions.length > 0 || canCreate)
  /** The create row sits after the suggestions and can be reached with the arrow keys too. */
  const optionCount = suggestions.length + (canCreate ? 1 : 0)

  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => setActiveIndex(0), [trimmed])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, showDropdown])

  function addTag(tag: string) {
    const t = canonicalTag(pool, tag)
    if (t && !hasTag(tags, t)) onTagsChange([...tags, t])
    // Remembered even when it was already picked: typing it is what makes it a
    // tag this teacher uses, and the question it belongs to may never be saved.
    if (t) remember(t)
    setInputValue('')
    setOpen(false)
  }

  function commitActive() {
    if (activeIndex < suggestions.length) return addTag(suggestions[activeIndex])
    if (canCreate) addTag(trimmed)
  }

  function removeTag(i: number) {
    onTagsChange(tags.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (showDropdown) commitActive()
              else if (trimmed) addTag(trimmed)
              return
            }
            if (e.key === 'ArrowDown' && optionCount > 0) {
              e.preventDefault()
              setOpen(true)
              setActiveIndex(i => (i + 1) % optionCount)
              return
            }
            if (e.key === 'ArrowUp' && optionCount > 0) {
              e.preventDefault()
              setOpen(true)
              setActiveIndex(i => (i - 1 + optionCount) % optionCount)
              return
            }
            if (e.key === 'Escape') setOpen(false)
          }}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          placeholder="พิมพ์แท็ก แล้วกด Enter หรือเลือกจากรายการ"
          className="text-sm"
        />
        {showDropdown && (
          <div
            ref={listRef}
            role="listbox"
            className="absolute z-50 top-full mt-1 w-full border border-border rounded-lg bg-popover text-popover-foreground shadow-lg overflow-hidden max-h-48 overflow-y-auto"
          >
            {suggestions.map((t, i) => {
              const onlyRemembered = !savedKeys.has(tagKey(t))
              return (
                <div
                  key={t}
                  role="option"
                  aria-selected={i === activeIndex}
                  data-active={i === activeIndex}
                  className={`flex items-center gap-2 text-sm transition-colors ${i === activeIndex ? 'bg-accent text-accent-foreground' : ''}`}
                >
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); addTag(t) }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className="flex-1 text-left px-3 py-2 truncate"
                  >
                    {t}
                    {onlyRemembered && (
                      <span className="ml-2 text-xs text-muted-foreground">เคยพิมพ์ไว้</span>
                    )}
                  </button>
                  {onlyRemembered && (
                    <button
                      type="button"
                      title="ลบออกจากแท็กที่เคยพิมพ์"
                      aria-label={`ลบ ${t} ออกจากแท็กที่เคยพิมพ์`}
                      onMouseDown={e => { e.preventDefault(); forget(t) }}
                      className="px-2 py-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            })}
            {canCreate && (
              <button
                type="button"
                role="option"
                aria-selected={activeIndex === suggestions.length}
                data-active={activeIndex === suggestions.length}
                onMouseDown={e => { e.preventDefault(); addTag(trimmed) }}
                onMouseEnter={() => setActiveIndex(suggestions.length)}
                className={`w-full text-left px-3 py-2 text-sm text-primary font-medium border-t border-border ${activeIndex === suggestions.length ? 'bg-accent' : ''}`}
              >
                + สร้างแท็กใหม่ &ldquo;{trimmed}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
              {tag}
              <button type="button" onClick={() => removeTag(i)} className="hover:text-blue-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
