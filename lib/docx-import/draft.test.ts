import { describe, it, expect } from 'vitest'
import { readDocument } from './docx'
import { buildDrafts, type DraftQuestion, type ParseOptions } from './draft'

// ─── Building WordprocessingML by hand ───────────────────────────────────────
//
// The documents under test are written here rather than checked in as .docx
// fixtures. Real worksheets are someone's unreleased exam, and `docs/SECURITY.md`
// is explicit that real material does not go into fixtures. Writing the markup
// out also makes each test say which Word construct it is about.

interface RunOptions {
  color?: string
  highlight?: string
  bold?: boolean
  underline?: boolean
  vertAlign?: 'superscript' | 'subscript'
}

function run(text: string, options: RunOptions = {}): string {
  const properties: string[] = []
  if (options.bold) properties.push('<w:b/>')
  if (options.underline) properties.push('<w:u w:val="single"/>')
  if (options.color) properties.push(`<w:color w:val="${options.color}"/>`)
  if (options.highlight) properties.push(`<w:highlight w:val="${options.highlight}"/>`)
  if (options.vertAlign) properties.push(`<w:vertAlign w:val="${options.vertAlign}"/>`)
  const rPr = properties.length ? `<w:rPr>${properties.join('')}</w:rPr>` : ''
  return `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`
}

/** A paragraph Word numbers: `numbered(0)` is a question, `numbered(1)` a ก) part. */
function numbered(ilvl: number, ...content: string[]): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="7"/></w:numPr></w:pPr>${content.join('')}</w:p>`
}

function plain(...content: string[]): string {
  return `<w:p>${content.join('')}</w:p>`
}

/** How a paper centres the heading of a section: `ตอนที่ 2 แสดงวิธีทำ`. */
function centered(...content: string[]): string {
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${content.join('')}</w:p>`
}

/** A paragraph carrying one of Word's own heading styles. */
function styled(styleId: string, ...content: string[]): string {
  return `<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>${content.join('')}</w:p>`
}

/** An inline picture, the way `w:drawing` nests one. */
function image(relId: string): string {
  return `<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${relId}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}

/** A picture anchored to the page rather than sitting in the run order. */
function floatingImage(relId: string): string {
  return `<w:r><w:drawing><wp:anchor><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${relId}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`
}

/** Choices laid out two to a row, which is how a worksheet fits four on two lines. */
function choiceTable(cells: string[][]): string {
  const rows = cells.map(row =>
    `<w:tr>${row.map(cell => `<w:tc><w:p>${cell}</w:p></w:tc>`).join('')}</w:tr>`
  ).join('')
  return `<w:tbl><w:tblPr/>${rows}</w:tbl>`
}

const NUMBERING = `<w:numbering>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="thaiLetters"/><w:lvlText w:val="%2."/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="7"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`

function parse(
  body: string,
  options: { numbering?: string | null; rels?: string | null } = {},
  reader: ParseOptions = {},
) {
  const document = readDocument({
    document: `<w:document><w:body>${body}</w:body></w:document>`,
    numbering: options.numbering === undefined ? NUMBERING : options.numbering,
    rels: options.rels ?? null,
  })
  return buildDrafts(document, reader)
}

const warningCodes = (question: DraftQuestion) => question.warnings.map(w => w.code)

// ─── Splitting ───────────────────────────────────────────────────────────────

describe('finding where one โจทย์ ends and the next begins', () => {
  it('splits on Word list numbering, which the text itself does not carry', () => {
    // The digits "1." "2." are drawn by Word from numbering.xml; nothing in
    // the extracted text says where a question starts.
    const result = parse([
      numbered(0, run('ข้อแรก')),
      numbered(0, run('ข้อสอง')),
      numbered(0, run('ข้อสาม')),
    ].join(''))

    expect(result.questions).toHaveLength(3)
    expect(result.questions.map(q => q.number)).toEqual([1, 2, 3])
    expect(result.questions[1].html).toBe('<p>ข้อสอง</p>')
  })

  it('keeps the heading and instructions out of the โจทย์', () => {
    const result = parse([
      plain(run('แบบทดสอบก่อนเรียน')),
      plain(run('ข้อสอบปรนัย 2 ข้อ ข้อละ 1 คะแนน')),
      numbered(0, run('ข้อแรก')),
    ].join(''))

    expect(result.preamble).toEqual(['แบบทดสอบก่อนเรียน', 'ข้อสอบปรนัย 2 ข้อ ข้อละ 1 คะแนน'])
    expect(result.questions).toHaveLength(1)
  })

  it('carries an unnumbered paragraph into the โจทย์ above it', () => {
    const result = parse([
      numbered(0, run('บรรทัดแรก')),
      plain(run('บรรทัดต่อ')),
      numbered(0, run('ข้อถัดไป')),
    ].join(''))

    expect(result.questions[0].html).toBe('<p>บรรทัดแรก</p><p>บรรทัดต่อ</p>')
  })

  it('leaves the heading of the next section out of the โจทย์ above it', () => {
    // An exam in ตอนที่ 1 / ตอนที่ 2 is the ordinary shape of a Thai paper, and
    // the heading sits between two โจทย์ — so without this it joins the one
    // above, in its body and in its title.
    const result = parse([
      numbered(0, run('ข้อใดคือหน่วยของกำลังไฟฟ้า')),
      centered(run('ตอนที่ 2 แสดงวิธีทำ', { bold: true })),
      numbered(0, run('จงอธิบายหลักการทำงานของหม้อแปลงไฟฟ้า')),
    ].join(''))

    expect(result.questions[0].html).toBe('<p>ข้อใดคือหน่วยของกำลังไฟฟ้า</p>')
    expect(result.questions[0].title).not.toContain('ตอนที่ 2')
    // Set aside, not thrown away: the import screen lists what it skipped.
    expect(result.preamble).toContain('ตอนที่ 2 แสดงวิธีทำ')
  })

  it('leaves a Word heading style out of the โจทย์ above it', () => {
    const result = parse([
      numbered(0, run('ข้อแรก')),
      styled('Heading2', run('ตอนที่ 2')),
      numbered(0, run('ข้อสอง')),
    ].join(''))

    expect(result.questions[0].html).toBe('<p>ข้อแรก</p>')
    expect(result.preamble).toContain('ตอนที่ 2')
  })

  it('keeps a bold line that is part of the โจทย์', () => {
    // Not centred, so it is an instruction inside the โจทย์ rather than a
    // heading for what follows. Emphasis alone must not take a line away.
    const result = parse([
      numbered(0, run('คำนวณหาความเร่ง')),
      plain(run('ให้แสดงวิธีทำโดยละเอียด', { bold: true })),
      numbered(0, run('ข้อถัดไป')),
    ].join(''))

    expect(result.questions[0].html).toBe('<p>คำนวณหาความเร่ง</p><p><strong>ให้แสดงวิธีทำโดยละเอียด</strong></p>')
    expect(result.preamble).not.toContain('ให้แสดงวิธีทำโดยละเอียด')
  })

  it('keeps a centred ตัวเลือก out of the headings', () => {
    // A worksheet that centres its options must not lose the last one.
    const result = parse([
      numbered(0, run('ข้อใดถูก')),
      centered(run('1) ก', { bold: true })),
      centered(run('2) ข', { bold: true })),
      centered(run('3) ค', { bold: true })),
      centered(run('4) ง', { bold: true })),
    ].join(''))

    expect(result.questions[0].choices.map(choice => choice.text)).toEqual(['ก', 'ข', 'ค', 'ง'])
    expect(result.preamble).toHaveLength(0)
  })

  it('falls back to typed numbers when the document has no numbering part', () => {
    const result = parse([
      plain(run('1. ข้อแรก')),
      plain(run('2. ข้อสอง')),
    ].join(''), { numbering: null })

    expect(result.questions).toHaveLength(2)
  })

  it('ignores stray digits that do not count up from one', () => {
    const result = parse([
      plain(run('3. ไม่ได้เริ่มจากหนึ่ง')),
      plain(run('9. กระโดดข้าม')),
    ].join(''), { numbering: null })

    expect(result.questions).toHaveLength(0)
  })
})

// ─── Choices and the answer key ──────────────────────────────────────────────

describe('reading choices', () => {
  it('reads a two-column table left to right, top to bottom', () => {
    const result = parse([
      numbered(0, run('ปริมาณใดบ่งบอกความเฉื่อย')),
      choiceTable([
        [run('1) มวล'), run('2) น้ำหนัก')],
        [run('3) แรง'), run('4) ความเร่ง')],
      ]),
    ].join(''))

    const question = result.questions[0]
    expect(question.type).toBe('mcq')
    expect(question.choices.map(c => c.text)).toEqual(['มวล', 'น้ำหนัก', 'แรง', 'ความเร่ง'])
  })

  it('reads choices written as ordinary paragraphs', () => {
    const result = parse([
      numbered(0, run('ข้อใดกล่าวถูกต้อง')),
      plain(run('1) ข้อความหนึ่ง')),
      plain(run('2) ข้อความสอง')),
      plain(run('3) ข้อความสาม')),
      plain(run('4) ข้อความสี่')),
    ].join(''))

    expect(result.questions[0].type).toBe('mcq')
    expect(result.questions[0].choices).toHaveLength(4)
  })

  it('takes red text as the answer key', () => {
    // The reason a copy-paste into a chat window cannot do this job: the key
    // is in the formatting, and plain text drops it.
    const result = parse([
      numbered(0, run('วัตถุมวล 5 กิโลกรัม ถูกแรง 10 นิวตัน ความเร่งเท่าใด')),
      choiceTable([
        [run('1) 50'), run('2) 10')],
        [`${run('3) ', { color: 'FF0000' })}${run('2', { color: 'FF0000' })}`, run('4) 0.5')],
      ]),
    ].join(''))

    const question = result.questions[0]
    expect(question.choices.map(c => c.isCorrect)).toEqual([false, false, true, false])
  })

  it('takes a highlighter as the answer key', () => {
    const result = parse([
      numbered(0, run('คำถาม')),
      plain(run('1) ก')),
      plain(run('2) ข', { highlight: 'yellow' })),
      plain(run('3) ค')),
      plain(run('4) ง')),
    ].join(''))

    expect(result.questions[0].choices.map(c => c.isCorrect)).toEqual([false, true, false, false])
  })

  it('takes bold as the answer key when only one choice is bold', () => {
    const result = parse([
      numbered(0, run('คำถาม')),
      plain(run('1) ก')),
      plain(run('2) ข')),
      plain(run('3) ค', { bold: true })),
      plain(run('4) ง')),
    ].join(''))

    expect(result.questions[0].choices.map(c => c.isCorrect)).toEqual([false, false, true, false])
  })

  it('ignores a style every choice shares', () => {
    // A worksheet that sets all four options bold is styled, not four-answered.
    const result = parse([
      numbered(0, run('คำถาม')),
      plain(run('1) ก', { bold: true })),
      plain(run('2) ข', { bold: true })),
      plain(run('3) ค', { bold: true })),
      plain(run('4) ง', { bold: true })),
    ].join(''))

    expect(result.questions[0].choices.every(c => !c.isCorrect)).toBe(true)
  })

  it('prefers colour over bold when a document uses both', () => {
    const result = parse([
      numbered(0, run('คำถาม', { bold: true })),
      plain(run('1) ก', { bold: true })),
      plain(run('2) ข', { color: 'FF0000' })),
      plain(run('3) ค')),
      plain(run('4) ง')),
    ].join(''))

    expect(result.questions[0].choices.map(c => c.isCorrect)).toEqual([false, true, false, false])
  })

  it('never carries the key’s own formatting into what a student reads', () => {
    // Bold on the correct option is the teacher's marking. Rendered to the
    // student it would point straight at the answer.
    const result = parse([
      numbered(0, run('คำถาม')),
      plain(run('1) ก')),
      plain(run('2) ข', { bold: true, color: 'FF0000' })),
      plain(run('3) ค')),
      plain(run('4) ง')),
    ].join(''))

    const correct = result.questions[0].choices[1]
    expect(correct.isCorrect).toBe(true)
    expect(correct.text).toBe('ข')
  })

  it('marks every choice the teacher marked, rather than picking one', () => {
    const result = parse([
      numbered(0, run('คำถาม')),
      plain(run('1) ก', { color: 'FF0000' })),
      plain(run('2) ข', { color: 'FF0000' })),
      plain(run('3) ค')),
      plain(run('4) ง')),
    ].join(''))

    expect(result.questions[0].choices.map(c => c.isCorrect)).toEqual([true, true, false, false])
  })

  it('reads a table with no markers in it as prose, not as choices', () => {
    const result = parse([
      numbered(0, run('จากตารางต่อไปนี้')),
      choiceTable([[run('มวล'), run('ความเร่ง')]]),
    ].join(''))

    const question = result.questions[0]
    expect(question.choices).toHaveLength(0)
    expect(question.type).toBe('essay')
    expect(question.html).toContain('มวล')
  })
})

// ─── Sub-questions ───────────────────────────────────────────────────────────

describe('telling sub-questions from choices', () => {
  it('reads two ก)/ข) items as parts of one โจทย์', () => {
    const result = parse([
      numbered(0, run('วางวัตถุมวล 20 กิโลกรัมบนพื้นเอียง')),
      plain(run('ก) ถ้าพื้นเอียงลื่น ต้องออกแรงเท่าใด')),
      plain(run('ข) ถ้าพื้นเอียงฝืด ต้องออกแรงเท่าใด')),
    ].join(''))

    const question = result.questions[0]
    expect(question.type).toBe('essay')
    expect(question.choices).toHaveLength(0)
    expect(question.parts.map(p => p.label)).toEqual(['ก', 'ข'])
    expect(question.parts[0].html).toBe('<p>ถ้าพื้นเอียงลื่น ต้องออกแรงเท่าใด</p>')
  })

  it('reads a deeper list level as sub-questions', () => {
    const result = parse([
      numbered(0, run('ออกแรง F กับวัตถุบนระนาบเอียง')),
      numbered(1, run('จงหาแรง F ที่ทำให้วัตถุขยับลง')),
      numbered(1, run('จงหาแรง F ที่ทำให้วัตถุขยับขึ้น')),
      numbered(0, run('ข้อถัดไป')),
    ].join(''))

    expect(result.questions).toHaveLength(2)
    expect(result.questions[0].parts).toHaveLength(2)
  })

  it('labels a Word-numbered sub-question the way Word prints it', () => {
    // ก) ข) ค) are drawn from the list format, so an extracted sub-question
    // has no label on it until one is worked out from its position.
    const result = parse([
      numbered(0, run('โจทย์หลัก')),
      numbered(1, run('ตอนหนึ่ง')),
      numbered(1, run('ตอนสอง')),
      numbered(1, run('ตอนสาม')),
    ].join(''))

    expect(result.questions[0].parts.map(p => p.label)).toEqual(['ก', 'ข', 'ค'])
  })

  it('restarts sub-question labels in each โจทย์', () => {
    const result = parse([
      numbered(0, run('โจทย์หนึ่ง')),
      numbered(1, run('ตอนหนึ่ง')),
      numbered(0, run('โจทย์สอง')),
      numbered(1, run('ตอนหนึ่งของข้อสอง')),
    ].join(''))

    expect(result.questions[1].parts.map(p => p.label)).toEqual(['ก'])
  })

  it('says when a small run of items could be read either way', () => {
    const result = parse([
      numbered(0, run('คำถาม')),
      plain(run('ก) อย่างหนึ่ง')),
      plain(run('ข) อย่างสอง')),
    ].join(''))

    expect(warningCodes(result.questions[0])).toContain('ambiguous-choices')
  })
})

// ─── Pictures ────────────────────────────────────────────────────────────────

describe('pictures', () => {
  const rels = `<Relationships>
    <Relationship Id="rId4" Target="media/image1.png"/>
    <Relationship Id="rId5" Target="media/image2.png"/>
  </Relationships>`

  it('attaches a picture to the โจทย์ it sits under', () => {
    const result = parse([
      numbered(0, run('จากรูป จงหาความเร่ง')),
      plain(image('rId4')),
      numbered(0, run('ข้อถัดไป')),
    ].join(''), { rels })

    expect(result.questions[0].imageRelIds).toEqual(['rId4'])
    expect(result.questions[1].imageRelIds).toEqual([])
  })

  it('records that a โจทย์ refers to a picture', () => {
    // Whether that is a problem depends on where the pictures end up, and the
    // teacher can move them on the import screen — so the fact is recorded
    // here and the warning is worked out from it later (see to-portable).
    const result = parse(numbered(0, run('จากรูป จงหาความเร่ง')), { rels })
    expect(result.questions[0].mentionsPicture).toBe(true)
    expect(result.questions[0].imageRelIds).toEqual([])
  })

  it('records that a โจทย์ refers to no picture', () => {
    const result = parse(numbered(0, run('ข้อความล้วน ไม่ได้พูดถึงอะไร')), { rels })
    expect(result.questions[0].mentionsPicture).toBe(false)
  })

  it('reports which pictures Word anchored to the page rather than to the text', () => {
    // Word anchors a floating picture to whichever paragraph it was dropped
    // near, which is regularly the question before the one it belongs to.
    const result = parse([
      numbered(0, run('ข้อความล้วน'), floatingImage('rId5')),
      numbered(0, run('ดังรูป จงหาแรง'), image('rId4')),
    ].join(''), { rels })

    expect(result.floatingImageRelIds).toEqual(['rId5'])
  })
})

// ─── Formatting that carries meaning ─────────────────────────────────────────

describe('text fidelity', () => {
  it('keeps superscripts, which are the only record of a unit', () => {
    const result = parse(numbered(0, run('ความเร่ง 10 เมตรต่อวินาที'), run('2', { vertAlign: 'superscript' })))
    expect(result.questions[0].html).toBe('<p>ความเร่ง 10 เมตรต่อวินาที<sup>2</sup></p>')
  })

  it('keeps a choice’s superscript as a character, since the field is plain', () => {
    // MCQOption.text is edited in a plain input, so "เมตรต่อวินาที²" can only
    // survive as that character — markup there would be shown to the teacher raw.
    const result = parse([
      numbered(0, run('ความเร่งเท่าใด')),
      plain(run('1) 10 เมตรต่อวินาที'), run('2', { vertAlign: 'superscript' })),
      plain(run('2) 20 เมตรต่อวินาที'), run('2', { vertAlign: 'superscript' })),
      plain(run('3) 30 เมตรต่อวินาที'), run('2', { vertAlign: 'superscript' })),
      plain(run('4) 40 เมตรต่อวินาที'), run('2', { vertAlign: 'superscript' })),
    ].join(''))

    expect(result.questions[0].choices.map(c => c.text)).toEqual([
      '10 เมตรต่อวินาที²', '20 เมตรต่อวินาที²', '30 เมตรต่อวินาที²', '40 เมตรต่อวินาที²',
    ])
  })

  it('keeps a subscript in a choice as a character too', () => {
    const result = parse([
      numbered(0, run('ข้อใด')),
      plain(run('1) m'), run('1', { vertAlign: 'subscript' })),
      plain(run('2) m'), run('2', { vertAlign: 'subscript' })),
      plain(run('3) m'), run('3', { vertAlign: 'subscript' })),
      plain(run('4) m'), run('4', { vertAlign: 'subscript' })),
    ].join(''))

    expect(result.questions[0].choices.map(c => c.text)).toEqual(['m₁', 'm₂', 'm₃', 'm₄'])
  })

  it('keeps emphasis in the question stem', () => {
    const result = parse(numbered(0, run('ข้อความใดที่'), run('ไม่ถูกต้อง', { bold: true, underline: true })))
    expect(result.questions[0].html).toBe('<p>ข้อความใดที่<u><strong>ไม่ถูกต้อง</strong></u></p>')
  })

  it('escapes markup characters rather than emitting them', () => {
    // Word stores these as entities; they are decoded on the way in and have
    // to be escaped again on the way out, or the โจทย์ carries raw markup into
    // a field the app renders with dangerouslySetInnerHTML.
    const result = parse(numbered(0, run('ถ้า a &lt; b และ x &amp; y')))
    expect(result.questions[0].html).toBe('<p>ถ้า a &lt; b และ x &amp; y</p>')
  })

  it('renders a Word equation as TeX the app can typeset', () => {
    const result = parse(numbered(0,
      run('วัตถุ '),
      `<m:oMath><m:r><m:t>15</m:t></m:r><m:rad><m:deg/><m:e><m:r><m:t>2</m:t></m:r></m:e></m:rad></m:oMath>`,
      run(' กิโลกรัม'),
    ))

    const question = result.questions[0]
    expect(question.html).toBe('<p>วัตถุ \\(15\\sqrt{2}\\) กิโลกรัม</p>')
    expect(warningCodes(question)).toContain('equation')
  })

  it('does not flag an equation that held nothing but words', () => {
    const result = parse(numbered(0, `<m:oMath><m:r><m:t>ความเร่ง</m:t></m:r></m:oMath>`))
    expect(result.questions[0].html).toBe('<p>ความเร่ง</p>')
    expect(warningCodes(result.questions[0])).not.toContain('equation')
  })

  it('drops the blank paragraphs a worksheet uses as spacing', () => {
    // `<p><br></p>` is not an empty string, but it is an empty โจทย์ line.
    const result = parse(numbered(0, run('เนื้อโจทย์')) + plain('<w:r><w:br/></w:r>') + plain(run('   ')))
    expect(result.questions[0].html).toBe('<p>เนื้อโจทย์</p>')
  })

  it('trims the stray spaces a run leaves at the edge of a line', () => {
    const result = parse(numbered(0, run('  ข้อใดกล่าวถูกต้อง  ')))
    expect(result.questions[0].html).toBe('<p>ข้อใดกล่าวถูกต้อง</p>')
  })

  it('drops text that tracked changes has deleted', () => {
    const result = parse(numbered(0, run('เหลืออยู่'), '<w:del><w:r><w:delText>ถูกลบ</w:delText></w:r></w:del>'))
    expect(result.questions[0].html).toBe('<p>เหลืออยู่</p>')
  })

  it('counts a picture stored in both markup forms once', () => {
    const body = numbered(0, run('ข้อความ'),
      `<mc:AlternateContent><mc:Choice Requires="wps">${image('rId4')}</mc:Choice><mc:Fallback><w:pict><v:imagedata r:id="rId4"/></w:pict></mc:Fallback></mc:AlternateContent>`)
    const result = parse(body, { rels: `<Relationships><Relationship Id="rId4" Target="media/image1.png"/></Relationships>` })
    expect(result.questions[0].imageRelIds).toEqual(['rId4'])
  })
})

// ─── The เฉลย in brackets ────────────────────────────────────────────────────

describe('the เฉลย a worksheet writes in brackets at the end of a ข้อ', () => {
  it('reads it, takes it out of the ข้อ, and makes the ข้อ one the system marks', () => {
    const result = parse(numbered(0, run('จงหาอัตราเร็วเชิงมุมเฉลี่ย (2.5)')))

    const question = result.questions[0]
    expect(question.type).toBe('written')
    expect(question.answers).toEqual([{ formula: '2.5', unit: '' }])
    // Left in, it would print the เฉลย on the students' screens.
    expect(question.html).toBe('<p>จงหาอัตราเร็วเชิงมุมเฉลี่ย</p>')
    expect(question.title).not.toContain('2.5')
  })

  it('reads one for each sub-question', () => {
    const result = parse([
      numbered(0, run('วงล้อเริ่มหมุนจากหยุดนิ่ง')),
      numbered(1, run('จงหาค่าความเร่งเชิงมุม (4 rad/s²)')),
      numbered(1, run('จงหามุมที่กวาดไปได้ (200 rad)')),
    ].join(''))

    const question = result.questions[0]
    expect(question.type).toBe('written')
    expect(question.parts.map(part => part.answers)).toEqual([
      [{ formula: '4', unit: 'rad/s²' }],
      [{ formula: '200', unit: 'rad' }],
    ])
    expect(question.parts.map(part => part.html)).toEqual([
      '<p>จงหาค่าความเร่งเชิงมุม</p>',
      '<p>จงหามุมที่กวาดไปได้</p>',
    ])
  })

  it('does not ask whether answered sub-questions are really ตัวเลือก', () => {
    // Two ก) ข) lines alone are ambiguous; two that each end in their own
    // เฉลย are not — a ตัวเลือก never carries one.
    const result = parse([
      numbered(0, run('วงล้อเริ่มหมุนจากหยุดนิ่ง')),
      numbered(1, run('จงหาความเร่ง (4 rad/s²)')),
      numbered(1, run('จงหามุม (200 rad)')),
    ].join(''))

    expect(warningCodes(result.questions[0])).not.toContain('ambiguous-choices')
  })

  it('says so when one bracket holds two values', () => {
    const result = parse(numbered(0, run('จงหาความเร่งเชิงมุม และจำนวนรอบ (-2pi/3, 225 รอบ)')))

    const question = result.questions[0]
    expect(question.answers).toEqual([
      { formula: '-2*pi/3', unit: '' },
      { formula: '225', unit: 'รอบ' },
    ])
    expect(warningCodes(question)).toContain('multi-answer')
  })

  it('leaves a ปรนัย alone', () => {
    // A bracket after the last ตัวเลือก belongs to that ตัวเลือก; the เฉลย of a
    // ปรนัย is the marked one.
    const result = parse([
      numbered(0, run('ข้อใดคือหน่วยของกำลังไฟฟ้า')),
      plain(run('1) โวลต์')),
      plain(run('2) '), run('วัตต์', { color: 'FF0000' })),
      plain(run('3) แอมแปร์')),
      plain(run('4) โอห์ม (SI)')),
    ].join(''))

    const question = result.questions[0]
    expect(question.type).toBe('mcq')
    expect(question.answers).toEqual([])
  })

  it('leaves a ข้อ with no bracket as one the teacher marks', () => {
    const result = parse(numbered(0, run('จงอธิบายหลักการทำงานของหม้อแปลงไฟฟ้า')))

    expect(result.questions[0].type).toBe('essay')
    expect(result.questions[0].answers).toEqual([])
  })
})

describe('the เฉลย a teacher marks at the end of a ข้อ', () => {
  it('reads a marked value and takes it out of the ข้อ', () => {
    const result = parse(numbered(0,
      run('จงหาอัตราเร็วเชิงมุมเฉลี่ย '),
      run('2.5', { color: 'FF0000' }),
    ))

    const question = result.questions[0]
    expect(question.type).toBe('written')
    expect(question.answers).toEqual([{ formula: '2.5', unit: '' }])
    expect(question.html).toBe('<p>จงหาอัตราเร็วเชิงมุมเฉลี่ย</p>')
    expect(question.title).not.toContain('2.5')
  })

  it('takes the brackets around a marked เฉลย with it', () => {
    const result = parse(numbered(0,
      run('จงหาความเร่งเชิงมุม ('),
      run('4 rad/s', { color: 'FF0000' }),
      run(')'),
    ))

    expect(result.questions[0].answers).toEqual([{ formula: '4', unit: 'rad/s' }])
    expect(result.questions[0].html).toBe('<p>จงหาความเร่งเชิงมุม</p>')
  })

  it('reads a highlighted or bold เฉลย the same way', () => {
    expect(parse(numbered(0, run('จงหาระยะทาง '), run('120 เมตร', { highlight: 'yellow' })))
      .questions[0].answers).toEqual([{ formula: '120', unit: 'เมตร' }])
    expect(parse(numbered(0, run('จงหาระยะทาง '), run('120 เมตร', { bold: true })))
      .questions[0].answers).toEqual([{ formula: '120', unit: 'เมตร' }])
  })

  it('splits a marked pair into two answers', () => {
    const result = parse(numbered(0,
      run('จงหาความเร่งเชิงมุม และจำนวนรอบ '),
      run('-2pi/3, 225 รอบ', { color: 'FF0000' }),
    ))

    expect(result.questions[0].answers).toEqual([
      { formula: '-2*pi/3', unit: '' },
      { formula: '225', unit: 'รอบ' },
    ])
    expect(warningCodes(result.questions[0])).toContain('multi-answer')
  })

  it('leaves a marked number inside the ข้อ alone', () => {
    // The numbers in the middle of a โจทย์ are the ones it gives you. A
    // worksheet that emphasises them must not have its givens read as its key.
    const result = parse(numbered(0,
      run('วัตถุมวล '),
      run('5', { color: 'FF0000' }),
      run(' กิโลกรัม จงหาความเร่ง'),
    ))

    expect(result.questions[0].answers).toEqual([])
    expect(result.questions[0].type).toBe('essay')
    expect(result.questions[0].html).toContain('5')
  })

  it('still reads the bracket of a worksheet that marked nothing', () => {
    // The files teachers already have were written before the marking
    // convention; they keep importing exactly as they did.
    const result = parse(numbered(0, run('จงหาอัตราเร็วเชิงมุมเฉลี่ย (2.5)')))

    expect(result.questions[0].answers).toEqual([{ formula: '2.5', unit: '' }])
    expect(result.questions[0].html).toBe('<p>จงหาอัตราเร็วเชิงมุมเฉลี่ย</p>')
  })

  it('reads a marked เฉลย on a sub-question', () => {
    const result = parse([
      numbered(0, run('วงล้อเริ่มหมุนจากหยุดนิ่ง')),
      numbered(1, run('จงหาความเร่งเชิงมุม '), run('4 rad/s', { color: 'FF0000' })),
      numbered(1, run('จงหามุมที่กวาดไปได้ '), run('200 rad', { color: 'FF0000' })),
    ].join(''))

    const question = result.questions[0]
    expect(question.type).toBe('written')
    expect(question.parts.map(part => part.answers)).toEqual([
      [{ formula: '4', unit: 'rad/s' }],
      [{ formula: '200', unit: 'rad' }],
    ])
    expect(question.parts[0].html).toBe('<p>จงหาความเร่งเชิงมุม</p>')
  })

  it('does not read the marked ตัวเลือก of a ปรนัย as a value', () => {
    const result = parse([
      numbered(0, run('ข้อใดคือหน่วยของกำลังไฟฟ้า')),
      plain(run('1) โวลต์')),
      plain(run('2) '), run('วัตต์', { color: 'FF0000' })),
      plain(run('3) แอมแปร์')),
      plain(run('4) โอห์ม')),
    ].join(''))

    expect(result.questions[0].type).toBe('mcq')
    expect(result.questions[0].answers).toEqual([])
  })
})

// ─── ช่องว่าง of a เติมคำ โจทย์ ───────────────────────────────────────────────

describe('the ช่องว่าง a เติมคำ worksheet marks', () => {
  const blanks = (body: string) => parse(body, {}, { expect: 'fill_blank' })

  it('turns each marked word into a numbered ช่องว่าง', () => {
    const result = blanks(numbered(0,
      run('หน่วยของแรงในระบบเอสไอคือ '),
      run('นิวตัน', { color: 'FF0000' }),
    ))

    const question = result.questions[0]
    expect(question.type).toBe('fill_blank')
    expect(question.blanks).toEqual([{ answer: 'นิวตัน' }])
    expect(question.html).toBe('<p>หน่วยของแรงในระบบเอสไอคือ [___1]</p>')
    // The answer must not survive in the title either.
    expect(question.title).not.toContain('นิวตัน')
  })

  it('numbers several ช่องว่าง in the order they are written', () => {
    const result = blanks(numbered(0,
      run('น้ำเดือดที่ '),
      run('100', { color: 'FF0000' }),
      run(' และแข็งตัวที่ '),
      run('0', { color: 'FF0000' }),
      run(' องศาเซลเซียส'),
    ))

    expect(result.questions[0].blanks).toEqual([{ answer: '100' }, { answer: '0' }])
    expect(result.questions[0].html).toBe('<p>น้ำเดือดที่ [___1] และแข็งตัวที่ [___2] องศาเซลเซียส</p>')
  })

  it('keeps a phrase Word split into several runs as one ช่องว่าง', () => {
    // Word breaks a phrase into runs on its own; three blanks where the
    // teacher wrote one answer is a โจทย์ nobody can answer.
    const result = blanks(numbered(0,
      run('เมืองหลวงของไทยคือ '),
      run('กรุงเทพ', { color: 'FF0000' }),
      run(' ', { color: 'FF0000' }),
      run('มหานคร', { color: 'FF0000' }),
    ))

    expect(result.questions[0].blanks).toEqual([{ answer: 'กรุงเทพ มหานคร' }])
  })

  it('reads nothing when the whole โจทย์ carries the same marking', () => {
    // A sentence that is red from end to end is styled, not answered.
    const result = blanks(numbered(0, run('ทุกคำในข้อนี้เป็นสีแดง', { color: 'FF0000' })))

    expect(result.questions[0].blanks).toEqual([])
    expect(result.questions[0].type).not.toBe('fill_blank')
  })

  it('leaves marked words alone unless the file was said to be เติมคำ', () => {
    // On any other worksheet a bolded word in the โจทย์ is emphasis, and
    // cutting it out would replace it with a blank nobody asked for.
    const body = numbered(0, run('หน่วยของแรงคือ '), run('นิวตัน', { color: 'FF0000' }))

    expect(parse(body).questions[0].blanks).toEqual([])
    expect(parse(body).questions[0].html).toContain('นิวตัน')
  })
})

// ─── Titles and cross-references ─────────────────────────────────────────────

describe('titles and warnings about context', () => {
  it('titles a โจทย์ from its opening words', () => {
    const result = parse(numbered(0, run('วัตถุมวล 2 กิโลกรัมอยู่บนพื้น')))
    expect(result.questions[0].title).toBe('วัตถุมวล 2 กิโลกรัมอยู่บนพื้น')
  })

  it('shortens a long opening rather than titling with the whole โจทย์', () => {
    const long = 'ก'.repeat(200)
    const title = parse(numbered(0, run(long))).questions[0].title
    expect(title.length).toBeLessThanOrEqual(61)
    expect(title.endsWith('…')).toBe(true)
  })

  it('titles a โจทย์ with readable characters, not with TeX', () => {
    const result = parse(numbered(0,
      run('วัตถุ '),
      `<m:oMath><m:r><m:t>15</m:t></m:r><m:rad><m:deg/><m:e><m:r><m:t>2</m:t></m:r></m:e></m:rad></m:oMath>`,
      run(' กิโลกรัม'),
    ))
    expect(result.questions[0].title).toBe('วัตถุ 15√2 กิโลกรัม')
  })

  it('falls back to the number when a โจทย์ has no text of its own', () => {
    const result = parse(numbered(0, image('rId4')), {
      rels: `<Relationships><Relationship Id="rId4" Target="media/image1.png"/></Relationships>`,
    })
    expect(result.questions[0].title).toBe('ข้อ 1')
  })

  it('says when a โจทย์ leans on the one before it', () => {
    // Questions in the คลัง are drawn one at a time and in any order, so
    // "จากข้อที่ผ่านมา" has nothing to point at once it is imported.
    const result = parse([
      numbered(0, run('ข้อแรก')),
      numbered(0, run('จากข้อที่ผ่านมา จงหาแรงที่มวลที่ 1 กระทำกับมวลที่ 2')),
    ].join(''))

    expect(warningCodes(result.questions[1])).toContain('refers-to-previous')
  })
})
