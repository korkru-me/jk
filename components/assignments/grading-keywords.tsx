'use client'

import { createContext, Fragment, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { MAX_GRADING_KEYWORDS, MAX_GRADING_KEYWORD_LENGTH, normalizeGradingKeywords, splitGradingKeywordMatches } from '@/lib/grading-keywords'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { useGradingDisclosure } from './use-grading-disclosure'

const EMPTY_KEYWORDS: readonly string[] = []
interface KeywordsContextValue {
  keywords: readonly string[]
  ready: boolean
  update: (keywords: readonly string[]) => void
}
const KeywordsContext = createContext<KeywordsContextValue | null>(null)

/** Only teacher-entered display preferences are stored in this tab. Student
 * responses and score drafts never enter this storage or change through it. */
export function GradingKeywordsProvider({ assignmentId, viewerId, children }: { assignmentId: string; viewerId?: string; children: ReactNode }) {
  const key = `korkru:grading-keywords:v1:${viewerId ?? 'viewer'}:${assignmentId}`
  const [stored, setStored] = useState<{ key: string; keywords: readonly string[] } | null>(null)
  useEffect(() => {
    let keywords: string[] = []
    try { keywords = normalizeGradingKeywords(JSON.parse(window.sessionStorage.getItem(key) ?? '[]')) }
    catch { /* Invalid/disabled storage starts with an empty in-memory list. */ }
    setStored({ key, keywords })
  }, [key])
  const update = useCallback((keywords: readonly string[]) => {
    const next = normalizeGradingKeywords(keywords)
    setStored({ key, keywords: next })
    try { window.sessionStorage.setItem(key, JSON.stringify(next)) }
    catch { /* Highlighting still works for the current page when storage is disabled. */ }
  }, [key])
  const ready = stored?.key === key
  const keywords = ready ? stored.keywords : EMPTY_KEYWORDS
  const value = useMemo(() => ({ keywords, ready, update }), [keywords, ready, update])
  return <KeywordsContext.Provider value={value}>{children}</KeywordsContext.Provider>
}

export function GradingKeywordTools() {
  const context = useContext(KeywordsContext)
  const { open, setOpen, root } = useGradingDisclosure()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const id = useId()
  const input = useRef<HTMLInputElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { if (open) input.current?.focus({ preventScroll: true }) }, [open])
  if (!context) return null
  const { keywords, ready, update } = context
  const full = keywords.length >= MAX_GRADING_KEYWORDS

  function add() {
    const word = value.trim()
    if (!ready || !word) return
    if (full) { setError(`เพิ่มได้สูงสุด ${MAX_GRADING_KEYWORDS} คำ กรุณาลบคำเดิมก่อน`); return }
    if (word.length > MAX_GRADING_KEYWORD_LENGTH) { setError(`คำค้นยาวได้ไม่เกิน ${MAX_GRADING_KEYWORD_LENGTH} ตัวอักษร`); return }
    const next = normalizeGradingKeywords([...keywords, word])
    if (next.length === keywords.length) { setError('มีคำนี้ในรายการแล้ว'); return }
    update(next); setValue(''); setError(''); setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }

  return <Collapsible ref={root} open={open} onOpenChange={setOpen} className="contents">
    <CollapsibleTrigger render={<Button ref={trigger} type="button" size="sm" variant="outline" disabled={!ready} className="pointer-coarse:min-h-11" />}>
      <Plus data-icon="inline-start" aria-hidden="true" />ไฮไลต์คำ{keywords.length > 0 ? ` (${keywords.length}/${MAX_GRADING_KEYWORDS})` : ''}
    </CollapsibleTrigger>
    {keywords.length > 0 && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1" role="group" aria-label="คำที่ไฮไลต์ในคำตอบอัตนัย">
      {keywords.map((word, index) => <Badge key={word} variant="statusWarning" className="h-auto min-h-7 max-w-full gap-1 whitespace-normal">
        <span className="min-w-0 [overflow-wrap:anywhere]">{word}</span>
        <IconButton type="button" size="2xs" label={`ลบคำไฮไลต์ ${word}`} className="shrink-0 pointer-coarse:min-h-11 pointer-coarse:min-w-11" onClick={() => {
          update(keywords.filter((_, i) => i !== index)); setError(''); trigger.current?.focus({ preventScroll: true })
        }}><X aria-hidden="true" /></IconButton>
      </Badge>)}
    </div>}
    <CollapsibleContent className="order-last w-full min-w-0 basis-full" onKeyDown={event => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
    }}>
      <FieldGroup className="min-w-0 gap-1 pt-2">
        <Field className="min-w-0 max-w-lg gap-1" data-invalid={!!error} data-disabled={!ready || full}>
          <FieldLabel htmlFor={`${id}-keyword`} className="text-xs">คำที่ต้องการไฮไลต์</FieldLabel>
          <div className="flex min-w-0 items-center gap-2">
            <Input ref={input} id={`${id}-keyword`} value={value} maxLength={MAX_GRADING_KEYWORD_LENGTH} disabled={!ready || full} placeholder="พิมพ์คำ แล้วกด Enter หรือเพิ่มคำ" className="pointer-coarse:min-h-11"
              aria-invalid={!!error} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} onChange={event => { setValue(event.target.value); setError('') }}
              onKeyDown={event => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
                event.preventDefault(); add()
              }} />
            <Button type="button" size="sm" variant="outline" className="shrink-0 pointer-coarse:min-h-11" disabled={!ready || full || !value.trim()} onClick={add}><Plus data-icon="inline-start" aria-hidden="true" />เพิ่มคำ</Button>
          </div>
          <FieldDescription id={`${id}-help`} className="text-xs">เฉพาะคำตอบอัตนัย · {keywords.length}/{MAX_GRADING_KEYWORDS} คำ · ทุกคำใช้สีเดียวกัน</FieldDescription>
          {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
        </Field>
      </FieldGroup>
    </CollapsibleContent>
  </Collapsible>
}

/** Plain React text and marks preserve the original response without HTML injection. */
export function GradingEssayHighlight({ text }: { text: string }) {
  const keywords = useContext(KeywordsContext)?.keywords ?? EMPTY_KEYWORDS
  const segments = useMemo(() => splitGradingKeywordMatches(text, keywords), [text, keywords])
  return <>{segments.map((segment, index) => segment.highlighted
    ? <mark key={index} className="rounded-sm bg-warning/30 text-foreground">{segment.text}</mark>
    : <Fragment key={index}>{segment.text}</Fragment>)}</>
}
