/**
 * A bare direct-manipulation pointer waits for a long press so vertical page
 * scrolling remains possible. Mouse/trackpad can start immediately; the
 * dedicated handle opts out of page scrolling for every pointer.
 */
export function shouldDelayOrderingDrag(pointerType: string, viaHandle: boolean): boolean {
  return pointerType !== 'mouse' && !viaHandle
}

/** Keep a handle press from bubbling into the row and replacing its immediate drag. */
export function startOrderingHandleDrag(
  event: { stopPropagation: () => void },
  start: () => void,
) {
  event.stopPropagation()
  start()
}
