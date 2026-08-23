'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * Brand line "ก่อ…โดยครู" — คำตรงกลางหมุนตามสิ่งที่ครูสร้างได้ในระบบ
 * ตัวแรกคือคำของแบรนด์ จึงเป็นสิ่งที่เห็นตอน SSR, ตอน JS ยังไม่ทำงาน
 * และตอนผู้ใช้ปิด animation
 */
const WORDS = [
  'การเรียนรู้',
  'ข้อสอบ',
  'ห้องเรียน',
  'แบบฝึกหัด',
  'แผนการจัดการเรียนรู้',
  'การจัดการเรียนรู้',
  'วิจัยการศึกษา',
] as const

const HOLD_MS = 3200
const EXIT_MS = 420
const ENTER_MS = 520
/** ระยะห่างหนึ่งวรรครอบคำตรงกลาง */
const GAP_EM = 0.28

/** คำที่ค้างอยู่ทั้งสองข้างใช้สีแบรนด์ ส่วนคำตรงกลางเป็นสีตัวอักษรปกติ */
const BRAND_TEXT = 'bg-gradient-to-r from-primary to-ring bg-clip-text text-transparent'

type Phase = 'in' | 'out' | 'pre'

const PHASE_STYLE: Record<Phase, { opacity: number; shift: string; blur: string; transition: string }> = {
  in: {
    opacity: 1,
    shift: '0em',
    blur: '0px',
    transition: `opacity ${ENTER_MS}ms ease-out, transform ${ENTER_MS}ms ease-out, filter ${ENTER_MS}ms ease-out`,
  },
  out: {
    opacity: 0,
    shift: '-0.16em',
    blur: '4px',
    transition: `opacity ${EXIT_MS}ms ease-in, transform ${EXIT_MS}ms ease-in, filter ${EXIT_MS}ms ease-in`,
  },
  pre: { opacity: 0, shift: '0.16em', blur: '4px', transition: 'none' },
}

export function HeroHeadline() {
  const [index, setIndex] = useState(0)
  // กล่องเริ่มขยับไปหาความกว้างของคำถัดไปตั้งแต่คำเดิมเริ่มจาง ช่องว่างจึงไม่ค้าง
  const [targetIndex, setTargetIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('in')
  const [reduceMotion, setReduceMotion] = useState(false)
  const [metrics, setMetrics] = useState<{ widths: number[]; available: number } | null>(null)

  const headlineRef = useRef<HTMLHeadingElement>(null)
  const prefixRef = useRef<HTMLSpanElement>(null)
  const suffixRef = useRef<HTMLSpanElement>(null)
  const sizerRef = useRef<HTMLSpanElement>(null)

  // วัดความกว้างจริงของทุกคำ เพื่อให้กล่องขยาย/หดได้ลื่นแทนที่จะกระตุก
  // และรู้ว่าเหลือที่ให้คำตรงกลางเท่าไรในบรรทัดเดียวกับ "ก่อ" และ "โดยครู"
  const measure = useCallback(() => {
    const headline = headlineRef.current
    const prefix = prefixRef.current
    const suffix = suffixRef.current
    const sizer = sizerRef.current
    if (!headline || !prefix || !suffix || !sizer) return

    const widths = Array.from(sizer.children).map((child) => child.getBoundingClientRect().width)
    const fontSize = Number.parseFloat(getComputedStyle(headline).fontSize) || 16
    // จอแคบจะ stack "โดยครู" ลงบรรทัดใหม่ ทำให้บรรทัดแรกเหลือที่มากขึ้น
    const stacked = suffix.offsetTop > prefix.offsetTop + 2
    const reserved = prefix.getBoundingClientRect().width + fontSize * GAP_EM +
      (stacked ? 0 : suffix.getBoundingClientRect().width + fontSize * GAP_EM)

    setMetrics({ widths, available: Math.max(0, headline.clientWidth - reserved) })
  }, [])

  useEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (headlineRef.current) observer.observe(headlineRef.current)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => observer.disconnect()
  }, [measure])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      setPhase('in')
      return
    }

    let exitTimer = 0
    let frame = 0

    const rotate = () => {
      if (document.hidden) return
      setPhase('out')
      setTargetIndex((current) => (current + 1) % WORDS.length)
      exitTimer = window.setTimeout(() => {
        setIndex((current) => (current + 1) % WORDS.length)
        setPhase('pre')
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => setPhase('in'))
        })
      }, EXIT_MS)
    }

    const interval = window.setInterval(rotate, HOLD_MS + EXIT_MS)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(exitTimer)
      cancelAnimationFrame(frame)
    }
  }, [reduceMotion])

  const available = metrics?.available ?? 0
  // คำที่ยาวกว่าที่ว่างจะย่อลงพอดีบรรทัด แทนที่จะดันบรรทัดแตกหรือล้นจอ
  const fit = (width?: number) => (width && available > 0 ? Math.min(1, available / width) : 1)
  const scale = fit(metrics?.widths[index])
  const targetWidth = metrics?.widths[targetIndex]
  const activePhase = reduceMotion ? 'in' : phase
  const { opacity, shift, blur, transition } = PHASE_STYLE[activePhase]

  const wordStyle: CSSProperties = {
    opacity,
    filter: `blur(${blur})`,
    transform: `translateY(${shift}) scale(${scale})`,
    transformOrigin: 'bottom center',
    transition: reduceMotion ? 'none' : transition,
  }

  return (
    <h1
      ref={headlineRef}
      className="relative mx-auto max-w-5xl text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl"
    >
      <span className="flex flex-col items-center justify-center sm:flex-row sm:flex-nowrap sm:items-baseline">
        <span className="flex flex-nowrap items-baseline">
          <span ref={prefixRef} className={`me-[0.28em] ${BRAND_TEXT}`}>
            ก่อ
          </span>
          <span
            className="inline-flex justify-center transition-[width] duration-[420ms] ease-in-out"
            style={{ width: targetWidth ? targetWidth * fit(targetWidth) : undefined }}
          >
            <span aria-live="polite" className="inline-block whitespace-nowrap" style={wordStyle}>
              {WORDS[index]}
            </span>
          </span>
        </span>
        <span
          ref={suffixRef}
          className={`block sm:ms-[0.28em] ${BRAND_TEXT}`}
        >
          โดยครู
        </span>
      </span>

      {/* ตัววัดความกว้าง ไม่แสดงผลและไม่กินพื้นที่ layout */}
      <span
        ref={sizerRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
      >
        {WORDS.map((word) => (
          <span key={word} className="inline-block">
            {word}
          </span>
        ))}
      </span>
    </h1>
  )
}
