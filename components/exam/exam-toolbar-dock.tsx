'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** Keeps the tools visible and reserves their actual height for sticky panels
 * and question jumps, including when status messages wrap on small screens. */
export function ExamToolbarDock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const toolbar = ref.current
    const stage = toolbar?.parentElement
    if (!toolbar || !stage) return
    // Sticky positioning starts inside the scrollport's padding. Include it
    // when scrollIntoView places a question below the tools.
    let scrollport = stage.parentElement
    while (scrollport && !/(auto|scroll|hidden)/.test(getComputedStyle(scrollport).overflowY)) {
      scrollport = scrollport.parentElement
    }
    const measure = () => {
      stage.style.setProperty('--exam-toolbar-height', `${Math.ceil(toolbar.getBoundingClientRect().height)}px`)
      stage.style.setProperty('--exam-toolbar-scroll-inset', scrollport ? getComputedStyle(scrollport).paddingTop : '0px')
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(toolbar)
    if (scrollport) observer.observe(scrollport)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className="sticky top-0 z-20" data-exam-toolbar-dock>{children}</div>
}
