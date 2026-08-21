'use client'

export function PrintReportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
    >
      🖨️ พิมพ์ (Ctrl+P)
    </button>
  )
}
