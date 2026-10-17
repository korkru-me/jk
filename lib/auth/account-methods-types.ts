export interface AccountSignInMethods {
  email: string
  emailVerified: boolean
  google: { state: 'linked' | 'unlinked' | 'conflict' | 'unknown'; email: string | null }
  canConnectGoogle: boolean
}

export type StartGoogleLinkResult =
  | { error: string; field?: 'current_password' }
  | { success: true; clientId: string; nonceHash: string; expiresAt: number }

export type CompleteGoogleLinkResult =
  | { error: string }
  | { success: true; warning?: string }

export type CancelGoogleLinkResult = { success: true } | { error: string }

export type AccountPasswordEmailResult =
  | { error: string; retryAfterSeconds?: number }
  | { success: true; retryAfterSeconds: number }

export interface AccountSignInMethodActions {
  startGoogleAction?: (formData: FormData) => Promise<StartGoogleLinkResult>
  completeGoogleAction?: (credential: string) => Promise<CompleteGoogleLinkResult>
  cancelGoogleAction?: () => Promise<CancelGoogleLinkResult>
  sendPasswordEmailAction?: () => Promise<AccountPasswordEmailResult>
}
