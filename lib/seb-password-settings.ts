/** Browser-safe DTOs only. Never add a password, envelope, key, or config hash. */
export type SebPasswordDraftState = 'saved' | 'discarded' | 'expired'
export interface SebPasswordSettingsSummary {
  draft: {
    revision: number
    state: SebPasswordDraftState
    updatedAt: string
    expiresAt: string | null
  } | null
  events: { revision: number; action: SebPasswordDraftState; createdAt: string }[]
}
export type SebPasswordSettingsView =
  | { kind: 'available'; summary: SebPasswordSettingsSummary }
  | { kind: 'unavailable'; reason: string }

export type SebPasswordSettingsResult =
  | { ok: true; summary: SebPasswordSettingsSummary }
  | { ok: false; message: string; reloadRequired: boolean }
