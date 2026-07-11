// Rule-based keyword → physics tag suggestions (no AI)

export interface TagSuggestionRule {
  keywords: string[]
  tags: string[]
}

// ─── Keyword → Tag mapping ────────────────────────────────────────────────────
// Keywords are in Thai and English to cover both input styles

const RULES: TagSuggestionRule[] = [
  // Kinematics / Linear Motion
  {
    keywords: ['ความเร็ว', 'velocity', 'v', 'speed', 'อัตราเร็ว', 'การเคลื่อนที่', 'displacement', 'ระยะทาง', 'ระยะกระจัด', 'kinematic'],
    tags: ['กลศาสตร์', 'การเคลื่อนที่แนวตรง', 'จลนศาสตร์'],
  },
  {
    keywords: ['ความเร่ง', 'acceleration', 'a', 'deceleration', 'เร่ง', 'หน่วง'],
    tags: ['กลศาสตร์', 'การเคลื่อนที่แนวตรง', 'จลนศาสตร์'],
  },
  {
    keywords: ['projectile', 'โปรเจกไทล์', 'แนวโค้ง', 'พาราโบลา', 'วิถีโค้ง'],
    tags: ['กลศาสตร์', 'การเคลื่อนที่แบบโปรเจกไทล์'],
  },
  {
    keywords: ['circular', 'วงกลม', 'centripetal', 'แรงสู่ศูนย์', 'รัศมีวงกลม', 'คาบ', 'period', 'frequency', 'ความถี่'],
    tags: ['กลศาสตร์', 'การเคลื่อนที่แบบวงกลม'],
  },
  // Newton's Laws / Force
  {
    keywords: ['แรง', 'force', 'F', 'newton', 'นิวตัน', 'กฎนิวตัน', 'mass', 'มวล', 'm'],
    tags: ['กลศาสตร์', 'กฎนิวตัน', 'แรงและการเคลื่อนที่'],
  },
  {
    keywords: ['friction', 'เสียดทาน', 'coefficient', 'สัมประสิทธิ์'],
    tags: ['กลศาสตร์', 'แรงเสียดทาน'],
  },
  {
    keywords: ['tension', 'แรงตึง', 'rope', 'เชือก', 'pulley', 'รอก'],
    tags: ['กลศาสตร์', 'กฎนิวตัน'],
  },
  // Energy & Work
  {
    keywords: ['พลังงาน', 'energy', 'work', 'งาน', 'power', 'กำลัง', 'kinetic', 'potential', 'ศักย์', 'KE', 'PE'],
    tags: ['กลศาสตร์', 'พลังงานและการดำรงพลังงาน', 'งานและกำลัง'],
  },
  {
    keywords: ['กฎอนุรักษ์พลังงาน', 'conservation', 'อนุรักษ์'],
    tags: ['กลศาสตร์', 'พลังงานและการดำรงพลังงาน'],
  },
  // Momentum & Impulse
  {
    keywords: ['momentum', 'โมเมนตัม', 'impulse', 'การดล', 'collision', 'การชน', 'elastic', 'inelastic'],
    tags: ['กลศาสตร์', 'โมเมนตัมและการดล'],
  },
  // Rotation
  {
    keywords: ['torque', 'แรงบิด', 'moment of inertia', 'โมเมนต์', 'angular', 'เชิงมุม', 'ω', 'angular velocity', 'ความเร็วเชิงมุม'],
    tags: ['กลศาสตร์', 'การหมุน', 'พลศาสตร์การหมุน'],
  },
  // Gravity
  {
    keywords: ['gravitation', 'โน้มถ่วง', 'gravity', 'G', 'satellite', 'ดาวเทียม', 'orbit', 'วงโคจร', 'kepler', 'เคปเลอร์'],
    tags: ['กลศาสตร์', 'แรงโน้มถ่วง', 'กฎเคปเลอร์'],
  },
  // Fluid Mechanics
  {
    keywords: ['pressure', 'ความดัน', 'fluid', 'ของไหล', 'density', 'ความหนาแน่น', 'buoyancy', 'แรงลอยตัว', 'pascal', 'bernoulli'],
    tags: ['ฟิสิกส์ของไหล', 'ความดัน', 'ของไหล'],
  },
  // Thermodynamics
  {
    keywords: ['heat', 'ความร้อน', 'temperature', 'อุณหภูมิ', 'thermal', 'thermodynamic', 'entropy', 'gas', 'แก๊ส', 'ideal gas', 'แก๊สอุดมคติ'],
    tags: ['ความร้อน', 'เทอร์โมไดนามิกส์'],
  },
  {
    keywords: ['specific heat', 'ความร้อนจำเพาะ', 'latent heat', 'ความร้อนแฝง', 'calorimetry'],
    tags: ['ความร้อน', 'แคลอริเมตรี'],
  },
  // Waves & Sound
  {
    keywords: ['wave', 'คลื่น', 'wavelength', 'ความยาวคลื่น', 'amplitude', 'แอมพลิจูด', 'frequency', 'ความถี่', 'sound', 'เสียง'],
    tags: ['คลื่นและเสียง', 'คลื่น'],
  },
  {
    keywords: ['doppler', 'ดอปเปลอร์', 'resonance', 'เรโซแนนซ์', 'interference', 'การแทรกสอด', 'diffraction', 'การเลี้ยวเบน'],
    tags: ['คลื่นและเสียง', 'ปรากฏการณ์คลื่น'],
  },
  // Optics / Light
  {
    keywords: ['light', 'แสง', 'optics', 'ทัศนศาสตร์', 'refraction', 'การหักเห', 'reflection', 'การสะท้อน', 'lens', 'เลนส์', 'mirror', 'กระจก'],
    tags: ['แสง', 'ทัศนศาสตร์'],
  },
  {
    keywords: ['snell', 'สเนลล์', 'refractive index', 'ดัชนีหักเห', 'total internal reflection', 'การสะท้อนกลับหมด'],
    tags: ['แสง', 'การหักเหของแสง'],
  },
  // Electricity
  {
    keywords: ['electric', 'ไฟฟ้า', 'charge', 'ประจุ', 'coulomb', 'คูลอมบ์', 'voltage', 'แรงดัน', 'current', 'กระแส', 'resistance', 'ความต้านทาน'],
    tags: ['ไฟฟ้า', 'วงจรไฟฟ้า'],
  },
  {
    keywords: ['capacitor', 'ตัวเก็บประจุ', 'capacitance', 'ความจุ'],
    tags: ['ไฟฟ้า', 'ตัวเก็บประจุ'],
  },
  {
    keywords: ['ohm', 'โอห์ม', 'circuit', 'วงจร', 'series', 'อนุกรม', 'parallel', 'ขนาน'],
    tags: ['ไฟฟ้า', 'วงจรไฟฟ้า', 'กฎโอห์ม'],
  },
  // Magnetism & Electromagnetism
  {
    keywords: ['magnetic', 'แม่เหล็ก', 'magnetism', 'flux', 'ฟลักซ์', 'inductor', 'inductance', 'faraday', 'ฟาราเดย์'],
    tags: ['ไฟฟ้าและแม่เหล็ก', 'แม่เหล็กไฟฟ้า'],
  },
  {
    keywords: ['electromagnetic', 'คลื่นแม่เหล็กไฟฟ้า', 'em wave', 'radio wave'],
    tags: ['ไฟฟ้าและแม่เหล็ก', 'คลื่นแม่เหล็กไฟฟ้า'],
  },
  // Modern Physics
  {
    keywords: ['photon', 'โฟตอน', 'quantum', 'ควอนตัม', 'photoelectric', 'โฟโตอิเล็กทริก', 'work function'],
    tags: ['ฟิสิกส์ยุคใหม่', 'ฟิสิกส์ควอนตัม'],
  },
  {
    keywords: ['atom', 'อะตอม', 'nucleus', 'นิวเคลียส', 'radioactive', 'กัมมันตภาพรังสี', 'half life', 'ครึ่งชีวิต', 'fission', 'fusion'],
    tags: ['ฟิสิกส์ยุคใหม่', 'ฟิสิกส์นิวเคลียร์'],
  },
  {
    keywords: ['relativity', 'สัมพัทธภาพ', 'einstein', 'ไอน์สไตน์', 'E=mc', 'time dilation', 'length contraction'],
    tags: ['ฟิสิกส์ยุคใหม่', 'ทฤษฎีสัมพัทธภาพ'],
  },
  // SHM
  {
    keywords: ['simple harmonic', 'SHM', 'oscillation', 'การสั่น', 'spring', 'สปริง', 'pendulum', 'ลูกตุ้ม', 'period', 'คาบ'],
    tags: ['กลศาสตร์', 'การเคลื่อนที่แบบ SHM'],
  },
]

// ─── Main suggestion function ──────────────────────────────────────────────────

export function suggestTagsFromText(text: string): string[] {
  if (!text.trim()) return []

  const lower = text.toLowerCase()
  const suggested = new Set<string>()

  for (const rule of RULES) {
    const matched = rule.keywords.some(kw => lower.includes(kw.toLowerCase()))
    if (matched) {
      rule.tags.forEach(t => suggested.add(t))
    }
  }

  return [...suggested]
}

// ─── All available physics tags (for autocomplete) ────────────────────────────

export const ALL_PHYSICS_TAGS: string[] = Array.from(
  new Set(RULES.flatMap(r => r.tags))
).sort((a, b) => a.localeCompare(b, 'th'))
