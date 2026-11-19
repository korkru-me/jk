/**
 * Whether this browser takes the page out of fullscreen as soon as the student
 * starts to type — which makes an enforced-fullscreen exam unanswerable.
 *
 * Safari on iPad has the Fullscreen API, but Apple treats a keyboard over a
 * fullscreen page as a phishing risk (a site could draw a fake login screen),
 * so WebKit leaves fullscreen the moment the keyboard comes up. With the
 * fullscreen guard on, that raised the "return to fullscreen" overlay on top
 * of the very field the student had tapped, and every ข้อ that needs typing
 * became impossible to answer. Every browser on iPhone and iPad runs that same
 * WebKit, so the rule covers all of them — including an iPhone that one day
 * ships the API, which today it does not.
 *
 * iPadOS asks for desktop sites by default and so reports itself as a Mac;
 * a Mac has no touch points, an iPad has several, which is what tells the two
 * apart.
 */
export function blocksTypingInFullscreen(device: { userAgent: string; maxTouchPoints: number }): boolean {
  if (/\b(iPad|iPhone|iPod)\b/.test(device.userAgent)) return true
  return /\bMacintosh\b/.test(device.userAgent) && device.maxTouchPoints > 1
}
