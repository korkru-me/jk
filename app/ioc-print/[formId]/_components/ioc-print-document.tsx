'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { renderRichTextHtml } from '@/lib/rich-text-html'
import {
  groupRowsByStandard,
  type DocHeader,
  type IocPrintRow,
  type IocSignatureBlock,
  type PrintSection,
  type SummaryPrintRow,
} from '@/lib/ioc-print'

// Declared in lib/ioc-print.ts so the Word exporter reads the same shape;
// re-exported here because this file is where the print page imports them from.
export type { DocHeader, PrintSection, SummaryPrintRow }

/**
 * A4 at 96dpi, with the margins Thai official documents use: 2.5cm at the top
 * and 2cm elsewhere. The usable height is what the packer has to fill.
 */
const PAGE_HEIGHT_PX = 1122
/**
 * 2.5cm of top margin, 2cm at the sides, and 2.8cm at the foot — the extra
 * 0.8cm is the strip the page footer sits in. Packing content into the full
 * bottom margin puts the last signature line underneath the criteria note.
 */
const USABLE_HEIGHT_PX = PAGE_HEIGHT_PX - 95 - 106

interface PackedPage {
  sectionIndex: number
  /** Only the first page of a section carries the document header. */
  withHeader: boolean
  rowStart: number
  rowEnd: number
  withSignatures: boolean
}

export function IocPrintDocument({
  sections,
  criteriaNote,
  watermarkText,
  backHref,
}: {
  sections: PrintSection[]
  criteriaNote: string | null
  watermarkText: string | null
  backHref: string
}) {
  const measureRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<PackedPage[] | null>(null)

  // Measure once against the real column widths, then pack. Rendering pages
  // before the measurement would show the reader a layout that is about to
  // move, so nothing is drawn until the numbers are in.
  useLayoutEffect(() => {
    const container = measureRef.current
    if (!container) return

    const packed: PackedPage[] = []

    sections.forEach((section, sectionIndex) => {
      const scope = container.querySelector(`[data-section="${sectionIndex}"]`)
      if (!scope) return

      const heightOf = (selector: string): number => {
        const node = scope.querySelector(selector)
        return node ? node.getBoundingClientRect().height : 0
      }

      const headerHeight = heightOf('[data-block="header"]')
      const tableHeadHeight = heightOf('[data-block="thead"]')
      const signatureHeight = heightOf('[data-block="signatures"]')
      const rowNodes = Array.from(scope.querySelectorAll('[data-row]'))
      const rowHeights = rowNodes.map(node => node.getBoundingClientRect().height)

      let index = 0
      let first = true
      while (index < rowHeights.length) {
        const budget = USABLE_HEIGHT_PX - (first ? headerHeight : 0) - tableHeadHeight
        let used = 0
        const start = index
        while (index < rowHeights.length && (used + rowHeights[index] <= budget || index === start)) {
          used += rowHeights[index]
          index += 1
        }
        packed.push({ sectionIndex, withHeader: first, rowStart: start, rowEnd: index, withSignatures: false })
        first = false
      }

      if (rowHeights.length === 0) {
        packed.push({ sectionIndex, withHeader: true, rowStart: 0, rowEnd: 0, withSignatures: false })
      }

      if (section.signatures.length > 0) {
        // Signatures share the last page when there is room, and take their own
        // page when there is not — a page that is only dotted lines reads as a
        // mistake when half of it would have fitted above.
        const last = packed[packed.length - 1]
        const usedOnLast = rowHeights
          .slice(last.rowStart, last.rowEnd)
          .reduce((sum, height) => sum + height, 0)
          + (last.withHeader ? headerHeight : 0)
          + tableHeadHeight
        if (usedOnLast + signatureHeight <= USABLE_HEIGHT_PX) {
          last.withSignatures = true
        } else {
          packed.push({
            sectionIndex,
            withHeader: false,
            rowStart: rowHeights.length,
            rowEnd: rowHeights.length,
            withSignatures: true,
          })
        }
      }
    })

    setPages(packed)
  }, [sections])

  const total = pages?.length ?? 0

  return (
    <>
      <style>{PRINT_CSS}</style>

      <div className="ioc-print-toolbar">
        <Button variant="outline" onClick={() => { window.location.href = backHref }}>
          ← กลับไปหน้าฟอร์ม
        </Button>
        <p className="ioc-print-hint">
          ในหน้าต่างพิมพ์ เลือกปลายทาง “บันทึกเป็น PDF” และปิด “หัวกระดาษและท้ายกระดาษ” ของเบราว์เซอร์
          เพื่อให้เลขหน้าของเอกสารเป็นเลขเดียวที่ปรากฏ
        </p>
        <Button onClick={() => window.print()} disabled={!pages}>พิมพ์ / บันทึกเป็น PDF</Button>
      </div>

      {/* Measuring layer: the same markup at the same widths, never painted. */}
      <div ref={measureRef} className="ioc-measure" aria-hidden="true">
        {sections.map((section, index) => (
          <div key={section.key} data-section={index} className="ioc-page-inner">
            <div data-block="header"><SectionHeader section={section} /></div>
            <table className="ioc-table">
              <thead data-block="thead"><TableHead section={section} /></thead>
              <tbody>
                {section.kind === 'evaluation'
                  ? section.rows.map(row => (
                      <EvaluationRow
                        key={row.itemId}
                        row={row}
                        standardLabel={section.standardLabels[row.standardId ?? ''] ?? ''}
                        showStandard
                        rowSpan={1}
                        showComments={section.showComments}
                        measuring
                      />
                    ))
                  : section.rows.map(row => (
                      <SummaryRow key={row.itemLabel} row={row} showStandard rowSpan={1} measuring />
                    ))}
              </tbody>
            </table>
            <div data-block="signatures"><Signatures blocks={section.signatures} /></div>
          </div>
        ))}
      </div>

      {pages ? (
        <div className="ioc-print-pages">
          {pages.map((page, pageIndex) => {
            const section = sections[page.sectionIndex]
            return (
              <article key={`${page.sectionIndex}-${pageIndex}`} className="ioc-page">
                {watermarkText ? <div className="ioc-watermark"><span>{watermarkText}</span></div> : null}
                <div className="ioc-page-inner">
                  {page.withHeader ? <SectionHeader section={section} /> : null}

                  {page.rowEnd > page.rowStart ? (
                    <table className="ioc-table">
                      <thead><TableHead section={section} /></thead>
                      <tbody>
                        {section.kind === 'evaluation'
                          ? groupRowsByStandard(section.rows.slice(page.rowStart, page.rowEnd)).flatMap(run =>
                              run.rows.map((row, rowIndex) => (
                                <EvaluationRow
                                  key={row.itemId}
                                  row={row}
                                  standardLabel={section.standardLabels[row.standardId ?? ''] ?? ''}
                                  showStandard={rowIndex === 0}
                                  rowSpan={run.rows.length}
                                  showComments={section.showComments}
                                />
                              )),
                            )
                          : section.rows.slice(page.rowStart, page.rowEnd).map((row, rowIndex, slice) => (
                              <SummaryRow
                                key={row.itemLabel}
                                row={row}
                                showStandard={rowIndex === 0 || slice[rowIndex - 1].standardLabel !== row.standardLabel}
                                rowSpan={slice.filter(other => other.standardLabel === row.standardLabel).length}
                              />
                            ))}
                      </tbody>
                    </table>
                  ) : null}

                  {page.withSignatures ? <Signatures blocks={section.signatures} /> : null}

                  {section.kind === 'summary' && page.rowEnd === section.rows.length
                    ? section.footnotes.map(note => <p key={note} className="ioc-note">{note}</p>)
                    : null}
                </div>

                <footer className="ioc-page-footer">
                  <span>{criteriaNote ?? ''}</span>
                  <span>หน้า {pageIndex + 1} จาก {total}</span>
                </footer>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="ioc-print-loading">กำลังจัดหน้ากระดาษ…</p>
      )}
    </>
  )
}

function SectionHeader({ section }: { section: PrintSection }) {
  return (
    <header className="ioc-doc-header">
      {section.header.titleLines.map(line => <p key={line} className="ioc-title">{line}</p>)}
      {section.header.subtitle ? <p className="ioc-subtitle">{section.header.subtitle}</p> : null}

      {section.kind === 'evaluation' ? (
        <>
          <p className="ioc-instruction"><b>คำชี้แจง</b> {section.instruction}</p>
          <div className="ioc-scale">
            <p>+1 แน่ใจว่าแบบทดสอบสอดคล้องตัวชี้วัด</p>
            <p>&nbsp;&nbsp;0 ไม่แน่ใจว่าแบบทดสอบสอดคล้องกับตัวชี้วัด</p>
            <p>&nbsp;−1 แน่ใจว่าแบบทดสอบไม่สอดคล้องกับตัวชี้วัด</p>
          </div>
        </>
      ) : (
        <>
          {section.facts.map(fact => <p key={fact} className="ioc-fact">{fact}</p>)}
          <p className="ioc-percent">{section.percentLine}</p>
          {section.paragraph ? (
            <>
              <p className="ioc-fact"><b>สรุปผลการประเมิน</b></p>
              <p className="ioc-paragraph">{section.paragraph}</p>
            </>
          ) : null}
        </>
      )}
    </header>
  )
}

function TableHead({ section }: { section: PrintSection }) {
  if (section.kind === 'evaluation') {
    return (
      <>
        <tr>
          <th rowSpan={2} className="ioc-col-standard">มาตรฐาน<br />ตัวชี้วัด</th>
          <th rowSpan={2}>แบบทดสอบ</th>
          <th colSpan={3} className="ioc-col-scale">ค่าความสอดคล้อง</th>
          {section.showComments ? <th rowSpan={2} className="ioc-col-comment">ข้อเสนอแนะ</th> : null}
        </tr>
        <tr>
          <th className="ioc-col-tick">+1</th>
          <th className="ioc-col-tick">0</th>
          <th className="ioc-col-tick">−1</th>
        </tr>
      </>
    )
  }

  return (
    <>
      <tr>
        <th rowSpan={2} className="ioc-col-standard">มาตรฐานตัวชี้วัด</th>
        <th rowSpan={2}>รายการประเมิน<br />ข้อสอบ (ข้อที่)</th>
        <th colSpan={3}>ผลการประเมิน (คน)</th>
        <th rowSpan={2} className="ioc-col-index">ดัชนีความ<br />สอดคล้อง</th>
      </tr>
      <tr>
        <th>สอดคล้อง</th>
        <th>ไม่แน่ใจ</th>
        <th>ไม่สอดคล้อง</th>
      </tr>
    </>
  )
}

function EvaluationRow({
  row,
  standardLabel,
  showStandard,
  rowSpan,
  showComments,
  measuring = false,
}: {
  row: IocPrintRow
  standardLabel: string
  showStandard: boolean
  rowSpan: number
  showComments: boolean
  measuring?: boolean
}) {
  return (
    <tr data-row={measuring ? '' : undefined}>
      {showStandard ? (
        <td rowSpan={rowSpan} className="ioc-col-standard">{standardLabel || '—'}</td>
      ) : null}
      <td>
        {row.sectionLabel ? <p className="ioc-section-label">{row.sectionLabel}</p> : null}
        {row.groupIntro ? (
          <div className="ioc-group-intro" dangerouslySetInnerHTML={{ __html: renderRichTextHtml(row.groupIntro) }} />
        ) : null}
        <div className="ioc-prompt">
          <b>{row.itemLabel}. </b>
          <span dangerouslySetInnerHTML={{ __html: renderRichTextHtml(row.prompt) }} />
        </div>
        {row.choices.length > 0 ? (
          <div className="ioc-choices">
            {row.choices.map(choice => (
              <span key={choice} dangerouslySetInnerHTML={{ __html: renderRichTextHtml(choice) }} />
            ))}
          </div>
        ) : null}
      </td>
      <td className="ioc-col-tick">{row.tick === 1 ? '✓' : ''}</td>
      <td className="ioc-col-tick">{row.tick === 0 ? '✓' : ''}</td>
      <td className="ioc-col-tick">{row.tick === -1 ? '✓' : ''}</td>
      {showComments ? <td className="ioc-col-comment">{row.comment}</td> : null}
    </tr>
  )
}

function SummaryRow({
  row,
  showStandard,
  rowSpan,
  measuring = false,
}: {
  row: SummaryPrintRow
  showStandard: boolean
  rowSpan: number
  measuring?: boolean
}) {
  return (
    <tr data-row={measuring ? '' : undefined}>
      {showStandard ? (
        <td rowSpan={rowSpan} className="ioc-col-standard">{row.standardLabel || '—'}</td>
      ) : null}
      <td className="ioc-center">{row.itemLabel}</td>
      <td className="ioc-center">{row.agree}</td>
      <td className="ioc-center">{row.unsure}</td>
      <td className="ioc-center">{row.disagree}</td>
      <td className="ioc-center">{row.index}{row.belowThreshold ? ' *' : ''}</td>
    </tr>
  )
}

function Signatures({ blocks }: { blocks: IocSignatureBlock[] }) {
  if (blocks.length === 0) return null
  return (
    <div className="ioc-signatures">
      {blocks.map(block => (
        <div key={`${block.role}-${block.name}`} className="ioc-signature">
          <div className="ioc-signature-line">
            {block.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={block.imageUrl} alt="" className="ioc-signature-image" />
            ) : block.typedName ? (
              <span className="ioc-signature-typed">{block.typedName}</span>
            ) : (
              <span className="ioc-signature-dots">……………………………………</span>
            )}
          </div>
          <p>({block.name})</p>
          <p>{block.role}</p>
          {block.signedAt ? <p className="ioc-signed-at">ลงนามอิเล็กทรอนิกส์เมื่อ {block.signedAt}</p> : null}
        </div>
      ))}
    </div>
  )
}

const PRINT_CSS = `
.ioc-print-toolbar {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  padding: 16px 24px; background: var(--card); border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 10;
}
.ioc-print-hint { flex: 1; min-width: 240px; font-size: 12px; line-height: 1.6; color: var(--muted-foreground); }
.ioc-print-loading { padding: 48px; text-align: center; color: var(--muted-foreground); }
.ioc-print-pages { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 0 64px; background: oklch(0.88 0 0); }
.ioc-measure { position: absolute; visibility: hidden; pointer-events: none; width: 794px; left: -10000px; top: 0; }

.ioc-page {
  position: relative; width: 210mm; height: 297mm; background: #fff; color: #000;
  box-shadow: 0 6px 18px rgba(0,0,0,.18); overflow: hidden;
  font-family: var(--font-sarabun), 'TH Sarabun New', serif; font-size: 15.5pt; line-height: 1.32;
}
.ioc-page-inner { padding: 25mm 20mm 28mm 20mm; height: 100%; }
.ioc-measure .ioc-page-inner { padding: 0 20mm; }

.ioc-title { text-align: center; font-weight: 700; font-size: 14.5pt; }
.ioc-subtitle { text-align: center; margin-top: 4px; }
.ioc-instruction { margin-top: 10px; text-indent: 0; }
.ioc-scale { margin-left: 14mm; }
.ioc-fact { margin-top: 6px; }
.ioc-percent { margin-top: 8px; font-weight: 700; }
.ioc-paragraph { margin-top: 2px; text-align: justify; }
.ioc-note { margin-top: 6px; font-size: 13pt; }

.ioc-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14pt; line-height: 1.28; }
.ioc-table th, .ioc-table td { border: 1px solid #000; padding: 3px 5px; vertical-align: top; }
.ioc-table th { text-align: center; font-weight: 700; vertical-align: middle; }
.ioc-col-standard { width: 20%; }
.ioc-col-tick { width: 26px; text-align: center; font-size: 16pt; }
.ioc-col-comment { width: 17%; }
.ioc-col-index { width: 17%; }
.ioc-col-scale { width: 78px; }
.ioc-center { text-align: center; }
.ioc-section-label { font-weight: 700; }
.ioc-group-intro { margin-bottom: 2px; }
.ioc-choices { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 2px; }

.ioc-signatures { display: flex; flex-direction: column; gap: 14mm; margin-top: 14mm; }
.ioc-signature { text-align: center; }
.ioc-signature-line {
  width: 70mm; margin: 0 auto 2px; height: 12mm;
  display: flex; align-items: flex-end; justify-content: center; border-bottom: 1px dotted #333;
}
.ioc-signature-image { max-height: 12mm; }
.ioc-signature-typed { font-size: 16pt; }
.ioc-signature-dots { color: #888; letter-spacing: 1px; }
.ioc-signed-at { font-size: 12pt; color: #333; }

.ioc-page-footer {
  position: absolute; left: 20mm; right: 20mm; bottom: 10mm;
  display: flex; justify-content: space-between; gap: 12px;
  border-top: 1px solid #bbb; padding-top: 4px; font-size: 11pt; color: #333;
}
.ioc-watermark { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.ioc-watermark span { transform: rotate(-28deg); font-size: 38pt; font-weight: 700; color: rgba(0,0,0,.05); white-space: nowrap; }

@page { size: A4; margin: 0; }
@media print {
  .ioc-print-toolbar, .ioc-measure { display: none !important; }
  .ioc-print-pages { gap: 0; padding: 0; background: #fff; }
  .ioc-page { box-shadow: none; break-after: page; }
  .ioc-page:last-child { break-after: auto; }
}
`
