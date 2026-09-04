/** Above this, `visualViewport.scale` means the user has pinch-zoomed. */
export const PINCH_ZOOM_SCALE = 1.01

/**
 * How tall the app shell should be right now, or null to leave the `100dvh`
 * fallback in its class alone.
 *
 * The shell is normally sized to `visualViewport.height` so the iOS keyboard
 * cannot push it off screen — see `useAppViewport` for that failure mode. A
 * pinch-zoomed page is the other direction: its visual viewport is smaller
 * than the layout viewport by design, so sizing the shell to it ends the app
 * partway down the screen and repaints the strip below as bare `<body>` —
 * the white band that covers the bottom of a zoomed-in teaching board, on a
 * tablet and on a trackpad pinch alike. While the zoom is held, the layout
 * viewport is the honest height.
 */
export function appShellHeight(viewport: { height: number; scale: number }): number | null {
  if (!Number.isFinite(viewport.height) || viewport.height <= 0) return null
  if (viewport.scale > PINCH_ZOOM_SCALE) return null
  return Math.round(viewport.height)
}
