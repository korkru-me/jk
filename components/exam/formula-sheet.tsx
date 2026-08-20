'use client'

import { useState } from 'react'
import { X, Search } from 'lucide-react'

interface FormulaSheetProps {
  onClose: () => void
}

// ─── MathML formula entries ───────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'mechanics',
    title: 'กลศาสตร์คลาสสิก',
    icon: '🔵',
    color: 'border-primary/20 bg-primary/5',
    badge: 'bg-primary/15 text-primary',
    entries: [
      {
        name: 'กฎข้อสองของนิวตัน',
        mathml: '<math display="block"><mi>F</mi><mo>=</mo><mi>m</mi><mo>&#8290;</mo><mi>a</mi></math>',
        vars: 'F = แรงสุทธิ (N) · m = มวล (kg) · a = ความเร่ง (m/s²)',
      },
      {
        name: 'สมการจลนศาสตร์ (1)',
        mathml: '<math display="block"><msup><mi>v</mi><mn>2</mn></msup><mo>=</mo><msup><mi>u</mi><mn>2</mn></msup><mo>+</mo><mn>2</mn><mi>a</mi><mi>s</mi></math>',
        vars: 'v = ความเร็วสุดท้าย · u = ความเร็วต้น · a = ความเร่ง · s = ระยะทาง',
      },
      {
        name: 'พลังงานจลน์',
        mathml: '<math display="block"><msub><mi>E</mi><mi>k</mi></msub><mo>=</mo><mfrac><mn>1</mn><mn>2</mn></mfrac><mi>m</mi><msup><mi>v</mi><mn>2</mn></msup></math>',
        vars: 'Eₖ = พลังงานจลน์ (J) · m = มวล (kg) · v = ความเร็ว (m/s)',
      },
      {
        name: 'โมเมนตัม',
        mathml: '<math display="block"><mi>p</mi><mo>=</mo><mi>m</mi><mo>&#8290;</mo><mi>v</mi></math>',
        vars: 'p = โมเมนตัม (kg·m/s) · m = มวล · v = ความเร็ว',
      },
      {
        name: 'แรงดึงดูดสากล',
        mathml: '<math display="block"><mi>F</mi><mo>=</mo><mfrac><mrow><mi>G</mi><msub><mi>m</mi><mn>1</mn></msub><msub><mi>m</mi><mn>2</mn></msub></mrow><msup><mi>r</mi><mn>2</mn></msup></mfrac></math>',
        vars: 'G = 6.674×10⁻¹¹ N·m²/kg² · r = ระยะห่างระหว่างจุดศูนย์กลางมวล',
      },
    ],
  },
  {
    id: 'relativity',
    title: 'ฟิสิกส์อนุภาคและสัมพัทธภาพ',
    icon: '⚛️',
    color: 'border-purple-500/20 bg-purple-500/5',
    badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
    entries: [
      {
        name: 'E = mc² (ไอน์สไตน์)',
        mathml: '<math display="block"><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math>',
        vars: 'E = พลังงาน (J) · m = มวล (kg) · c = ความเร็วแสง = 3×10⁸ m/s',
      },
      {
        name: 'พลังงานรวมเชิงสัมพัทธภาพ',
        mathml: '<math display="block"><mi>E</mi><mo>=</mo><mi>γ</mi><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math>',
        vars: 'γ = แฟกเตอร์ Lorentz = 1/√(1-v²/c²)',
      },
      {
        name: 'ความสัมพันธ์พลังงาน-โมเมนตัม',
        mathml: '<math display="block"><msup><mi>E</mi><mn>2</mn></msup><mo>=</mo><msup><mrow><mo>(</mo><mi>p</mi><mi>c</mi><mo>)</mo></mrow><mn>2</mn></msup><mo>+</mo><msup><mrow><mo>(</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup><mo>)</mo></mrow><mn>2</mn></msup></math>',
        vars: 'สมการสำหรับคำนวณพลังงานของอนุภาคที่เครื่องเร่งอนุภาค CERN',
      },
      {
        name: 'พลังงานจลน์เชิงสัมพัทธภาพ',
        mathml: '<math display="block"><msub><mi>E</mi><mi>k</mi></msub><mo>=</mo><mo>(</mo><mi>γ</mi><mo>−</mo><mn>1</mn><mo>)</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math>',
        vars: 'ใช้สำหรับโปรตอนพลังงานสูงใน LHC (Large Hadron Collider)',
      },
      {
        name: 'ความยาวคลื่นเดอบรอยล์',
        mathml: '<math display="block"><mi>λ</mi><mo>=</mo><mfrac><mi>h</mi><mi>p</mi></mfrac></math>',
        vars: 'λ = ความยาวคลื่น (m) · h = ค่าคงที่พลังค์ · p = โมเมนตัม',
      },
    ],
  },
  {
    id: 'em',
    title: 'แม่เหล็กไฟฟ้า',
    icon: '⚡',
    color: 'border-yellow-500/20 bg-yellow-500/5',
    badge: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
    entries: [
      {
        name: 'กฎของคูลอมบ์',
        mathml: '<math display="block"><mi>F</mi><mo>=</mo><mfrac><mrow><mi>k</mi><msub><mi>q</mi><mn>1</mn></msub><msub><mi>q</mi><mn>2</mn></msub></mrow><msup><mi>r</mi><mn>2</mn></msup></mfrac></math>',
        vars: 'k = 8.99×10⁹ N·m²/C² · q = ประจุ (C) · r = ระยะห่าง (m)',
      },
      {
        name: 'แรงบนอนุภาคมีประจุในสนาม',
        mathml: '<math display="block"><mi>F</mi><mo>=</mo><mi>q</mi><mi>v</mi><mi>B</mi><mo>sin</mo><mi>θ</mi></math>',
        vars: 'q = ประจุ · v = ความเร็ว · B = ความหนาแน่นฟลักซ์แม่เหล็ก (T)',
      },
      {
        name: 'พลังงานโฟตอน',
        mathml: '<math display="block"><mi>E</mi><mo>=</mo><mi>h</mi><mi>f</mi><mo>=</mo><mfrac><mrow><mi>h</mi><mi>c</mi></mrow><mi>λ</mi></mfrac></math>',
        vars: 'h = 6.626×10⁻³⁴ J·s · f = ความถี่ (Hz) · λ = ความยาวคลื่น (m)',
      },
    ],
  },
  {
    id: 'waves',
    title: 'คลื่นและแสง',
    icon: '🌊',
    color: 'border-teal-500/20 bg-teal-500/5',
    badge: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
    entries: [
      {
        name: 'ความเร็วคลื่น',
        mathml: '<math display="block"><mi>v</mi><mo>=</mo><mi>f</mi><mi>λ</mi></math>',
        vars: 'v = ความเร็ว (m/s) · f = ความถี่ (Hz) · λ = ความยาวคลื่น (m)',
      },
      {
        name: 'กฎการหักเห (Snell)',
        mathml: '<math display="block"><msub><mi>n</mi><mn>1</mn></msub><mo>sin</mo><msub><mi>θ</mi><mn>1</mn></msub><mo>=</mo><msub><mi>n</mi><mn>2</mn></msub><mo>sin</mo><msub><mi>θ</mi><mn>2</mn></msub></math>',
        vars: 'n = ดัชนีหักเห · θ = มุมกับเส้นปกติ',
      },
    ],
  },
]

const CONSTANTS = [
  { symbol: 'c',   name: 'ความเร็วแสง',             value: '2.998 × 10⁸ m/s' },
  { symbol: 'g',   name: 'ความเร่งโน้มถ่วง (โลก)',   value: '9.807 m/s²' },
  { symbol: 'G',   name: 'ค่าคงที่ความโน้มถ่วง',     value: '6.674 × 10⁻¹¹ N·m²/kg²' },
  { symbol: 'h',   name: 'ค่าคงที่พลังค์',            value: '6.626 × 10⁻³⁴ J·s' },
  { symbol: 'ℏ',   name: 'ค่าคงที่พลังค์รีดิวซ์',    value: '1.055 × 10⁻³⁴ J·s' },
  { symbol: 'e',   name: 'ประจุอิเล็กตรอน',           value: '1.602 × 10⁻¹⁹ C' },
  { symbol: 'mₑ',  name: 'มวลอิเล็กตรอน',             value: '9.109 × 10⁻³¹ kg' },
  { symbol: 'mₚ',  name: 'มวลโปรตอน',                value: '1.673 × 10⁻²⁷ kg' },
  { symbol: 'k',   name: 'ค่าคงที่คูลอมบ์',           value: '8.988 × 10⁹ N·m²/C²' },
  { symbol: 'ε₀',  name: 'สภาพยอม (สุญญากาศ)',       value: '8.854 × 10⁻¹² F/m' },
  { symbol: 'μ₀',  name: 'สภาพซึม (สุญญากาศ)',        value: '4π × 10⁻⁷ T·m/A' },
  { symbol: 'Nₐ',  name: 'เลขอาโวกาโดร',              value: '6.022 × 10²³ mol⁻¹' },
  { symbol: 'R',   name: 'ค่าคงที่แก๊ส',              value: '8.314 J/(mol·K)' },
  { symbol: 'kB',  name: 'ค่าคงที่โบลต์ซมันน์',       value: '1.381 × 10⁻²³ J/K' },
  { symbol: '1 eV','name': '1 อิเล็กตรอนโวลต์',       value: '1.602 × 10⁻¹⁹ J' },
  { symbol: '1 u', name: '1 หน่วยมวลอะตอม',          value: '1.661 × 10⁻²⁷ kg' },
]

export function FormulaSheet({ onClose }: FormulaSheetProps) {
  const [tab, setTab] = useState<'formulas' | 'constants'>('formulas')
  const [search, setSearch] = useState('')
  const [openSection, setOpenSection] = useState<string | null>('mechanics')

  const filteredSections = SECTIONS.map(sec => ({
    ...sec,
    entries: sec.entries.filter(e =>
      !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.vars.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(sec => !search || sec.entries.length > 0)

  const filteredConstants = CONSTANTS.filter(c =>
    !search ||
    c.symbol.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.value.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md h-full bg-card border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <p className="font-bold text-sm">📐 สูตรและค่าคงที่ฟิสิกส์</p>
            <p className="text-xs text-muted-foreground mt-0.5">Standard Model · CERN · ม.ปลาย</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="ค้นหาสูตร..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4 shrink-0">
          {(['formulas', 'constants'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'formulas' ? '📐 สูตร' : '🔢 ค่าคงที่'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === 'formulas' ? (
            filteredSections.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">ไม่พบสูตรที่ค้นหา</p>
            ) : filteredSections.map(sec => (
              <div key={sec.id} className={`border rounded-xl overflow-hidden ${sec.color}`}>
                <button
                  onClick={() => setOpenSection(openSection === sec.id ? null : sec.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-sm font-semibold flex items-center gap-2">
                    {sec.icon}
                    {sec.title}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${sec.badge}`}>
                      {sec.entries.length}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-xs">{openSection === sec.id ? '▲' : '▼'}</span>
                </button>

                {(openSection === sec.id || search) && (
                  <div className="border-t divide-y divide-border/50">
                    {sec.entries.map((entry, i) => (
                      <div key={i} className="px-4 py-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground/80">{entry.name}</p>
                        <div
                          className="text-center py-1 overflow-x-auto"
                          dangerouslySetInnerHTML={{ __html: entry.mathml }}
                        />
                        <p className="text-[10px] text-muted-foreground leading-relaxed">{entry.vars}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="space-y-1.5">
              {filteredConstants.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">ไม่พบค่าคงที่ที่ค้นหา</p>
              ) : filteredConstants.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2.5 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <span className="font-mono font-bold text-sm text-primary w-8 shrink-0 text-center">
                    {c.symbol}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{c.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
