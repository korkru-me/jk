'use client'

export function PrintReportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
    >
      🖨️ พิมพ์ (Ctrl+P)
    </button>
  )
}
