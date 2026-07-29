import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function escapeLike(s: string) {
  return s.replace(/[%_\\]/g, m => `\\${m}`)
}

export function buildFullName(prefix: string | null | undefined, firstName: string | null | undefined, lastName: string | null | undefined) {
  return `${prefix ?? ''}${firstName ?? ''}${lastName ? ` ${lastName}` : ''}`.trim()
}

export function downloadTextFile(filename: string, content: string, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Excel needs a BOM to render Thai (and other non-ASCII) text in a CSV as
// UTF-8 instead of guessing the system codepage and mangling it.
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const escapeCell = (cell: string | number | null | undefined) => {
    const s = cell == null ? '' : String(cell)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map(row => row.map(escapeCell).join(',')).join('\r\n')
}

export function safeFilenamePart(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').trim()
}
