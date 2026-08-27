'use client'

import { Layers, Search, X } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { QuestionSortControl } from '@/components/questions/question-sort-control'
import { cn } from '@/lib/utils'
import type { QuestionSort } from '@/lib/question-sort'
import type { LibraryScope } from '../page'

/** A แฟ้ม the browser can be pointed at. */
export interface LibraryScopeOption {
  id: string
  title: string
  questionCount: number
}

export const scopeKey = (scope: LibraryScope) =>
  scope.kind === 'set' ? scope.setId : scope.kind

/**
 * Choosing which โจทย์ the browser shows, and how they are searched and
 * ordered.
 *
 * Two fixed chips and a menu rather than a chip per แฟ้ม: "ยังไม่อยู่ในแฟ้มใด"
 * and "ทั้งหมด" are the two the reader returns to, while แฟ้ม names are long
 * and there is no ceiling on how many a teacher makes — a row of chips would
 * wrap into a wall before the tenth.
 */
export function LibraryToolbar({
  scope, sets, search, sort, isPending, onScope, onSearch, onSort,
}: {
  scope: LibraryScope
  sets: LibraryScopeOption[]
  /** The search box's own text — kept by the caller, which debounces it. */
  search: string
  sort: QuestionSort
  isPending: boolean
  onScope: (scope: LibraryScope) => void
  onSearch: (search: string) => void
  onSort: (sort: QuestionSort) => void
}) {
  const activeSet = scope.kind === 'set' ? sets.find(set => set.id === scope.setId) : null

  const chip = (active: boolean) => cn(
    'flex items-center gap-1.5 rounded-md px-2.5 h-[26px] text-sm font-medium transition-all',
    active ? 'bg-background text-foreground shadow-sm' : 'text-foreground/60 hover:text-foreground/80',
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex w-fit items-center rounded-lg bg-muted p-[3px] gap-0.5">
          <button
            type="button"
            onClick={() => onScope({ kind: 'unfiled' })}
            className={chip(scope.kind === 'unfiled')}
          >
            ยังไม่อยู่ในแฟ้มใด
          </button>
          <button
            type="button"
            onClick={() => onScope({ kind: 'all' })}
            className={chip(scope.kind === 'all')}
          >
            โจทย์ทั้งหมด
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<button type="button" className={chip(scope.kind === 'set')} />}
            >
              <Layers className="w-3.5 h-3.5" />
              {activeSet ? activeSet.title : 'ในแฟ้ม…'}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              <DropdownMenuGroup>
                <DropdownMenuLabel>ดูโจทย์ในแฟ้ม</DropdownMenuLabel>
                {sets.length === 0 ? (
                  <DropdownMenuItem disabled>ยังไม่มีแฟ้มโจทย์ของคุณ</DropdownMenuItem>
                ) : sets.map(set => (
                  <DropdownMenuItem
                    key={set.id}
                    onClick={() => onScope({ kind: 'set', setId: set.id })}
                  >
                    {set.title}
                    <span className="ml-auto pl-3 text-xs text-muted-foreground">{set.questionCount} ข้อ</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              {activeSet && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onScope({ kind: 'unfiled' })}>
                    เลิกดูเฉพาะแฟ้มนี้
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาจากชื่อ เนื้อหา หรือแท็ก..."
            value={search}
            onChange={event => onSearch(event.target.value)}
            className="pl-9 pr-9 bg-card"
            aria-label="ค้นหาโจทย์"
          />
          {search && (
            <IconButton
              label="ล้างคำค้นหา"
              size="2xs"
              onClick={() => onSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X />
            </IconButton>
          )}
        </div>
        <QuestionSortControl
          sort={sort}
          onChange={onSort}
          scope="u"
          label="เรียงลำดับโจทย์ในรายการนี้"
        />
        {isPending && <span className="text-xs text-muted-foreground">กำลังโหลด…</span>}
      </div>
    </div>
  )
}

/** The heading a scope earns, and the line under it. */
export function libraryScopeCopy(
  scope: LibraryScope,
  sets: LibraryScopeOption[],
): { heading: string; description: string } {
  if (scope.kind === 'all') {
    return {
      heading: 'โจทย์ทั้งหมดในคลัง',
      description: 'โจทย์ทุกข้อของคุณ ทั้งที่อยู่ในแฟ้มแล้วและยังไม่อยู่ — ป้ายบนการ์ดบอกว่าข้อนั้นอยู่แฟ้มไหนบ้าง',
    }
  }
  if (scope.kind === 'set') {
    const title = sets.find(set => set.id === scope.setId)?.title ?? 'แฟ้มนี้'
    return {
      heading: `โจทย์ในแฟ้ม ${title}`,
      description: 'เอาออกจากแฟ้มนี้ได้ หรือเพิ่มเข้าแฟ้มอื่นเพิ่มก็ได้ — โจทย์ข้อเดียวอยู่ได้หลายแฟ้ม',
    }
  }
  return {
    heading: 'โจทย์ที่ยังไม่อยู่ในแฟ้มใด',
    description: 'โจทย์เหล่านี้อยู่ในคลังโจทย์แล้ว แต่ยังไม่ได้ถูกใส่ไว้ในแฟ้มใด — ติ๊กเลือกแล้วเพิ่มเข้าแฟ้มได้หลายแฟ้มพร้อมกัน',
  }
}
