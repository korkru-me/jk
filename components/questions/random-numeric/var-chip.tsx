'use client'

// ─── VarChip ──────────────────────────────────────────────────────────────────

export function VarChip({ name, active, onClick }: { name: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative font-mono text-sm px-3 py-1.5 rounded-lg border-2 font-bold transition-all duration-150 ${
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
          : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary hover:bg-primary/10'
      }`}
    >
      {'{' + name + '}'}
      {active && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-success border-2 border-background" />}
    </button>
  )
}
