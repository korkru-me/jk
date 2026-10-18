'use client'

export const PAGE_EXIT_EVENT = 'korkru:confirm-page-exit'

export interface PageExitConfirmation {
  resolve: (leave: boolean) => void
}

/** Let the active editor confirm a programmatic exit before its action runs. */
export function confirmPageExit(): Promise<boolean> {
  return new Promise(resolve => {
    const event = new CustomEvent<PageExitConfirmation>(PAGE_EXIT_EVENT, {
      cancelable: true,
      detail: { resolve },
    })
    if (window.dispatchEvent(event)) resolve(true)
  })
}
