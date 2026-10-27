# Recovery browser guidance — 27 October 2026

Status: implemented and verified locally on `codex/recovery-browser-feedback`, based on Production source `e998278`. Not deployed to Staging or Production. No email sent or account/password/provider configuration changed.

## Behavior

- A recovery callback missing its valid browser intent shows “เปิดลิงก์ในเบราว์เซอร์เดิมที่ขอลิงก์”, with instructions to use the same browser/device and, if already there, request a new link and open the latest email. This is guidance for missing local proof, not proof of which browser the person used; cleared, expired and overwritten intent can produce the same failure.
- Explicit `otp_expired`, `flow_state_expired` and `flow_state_not_found` errors show the expired/used-link message. PKCE missing/mismatched verifier errors show browser guidance. Other failures get a generic verification message, rather than an unsupported expiry claim.
- The denied page reads an allowlisted callback query hint and provider error-code fragments. Unknown query values/arrays and provider descriptions are not rendered. Query/fragment text never supplies a user, session or grant. The unchanged server user/session/grant checks and password action remain authoritative. A still-valid grant keeps the form available despite stale URL hints.
- The forgot-password sent state reminds people to open the latest email in the same browser/device. No email template or SMTP configuration change is needed.

## Verification

Candidate: Vitest 336 files / 4,821 tests passed, including 28 focused callback/page authorization cases; TypeScript and semantic-token lint passed; isolated Webpack production build passed with synthetic local configuration. Build output is `.next-recovery-build`, separate from running dev output; generated tsconfig additions were removed afterward.

Local Next 16.3.5 Turbopack on port 3067 used only synthetic configuration and loopback Supabase URL. A missing-intent callback, expired callback, provider `#error_code=otp_expired`, generic verification failure, mobile overflow and denied-form absence were checked in an isolated browser. React introspection found the notice component; Next MCP compilation/config/session errors were empty. Desktop and 390px captures are temporary evidence under `/private/tmp/korkru-recovery-*.png`. These checks do not prove hosted email delivery or a real cross-browser password change. Hosted tests must use Staging per repository policy.

The application patch is also synced narrowly to the actual primary localhost:3000 checkout, preserving pre-existing work. Primary TypeScript and semantic-token lint passed. An isolated unauthenticated browser verified the browser-required callback and provider fragment expiry on actual port 3000 at 390px; Next MCP config/session errors were empty. Seven application/test paths match the candidate byte-for-byte, and all 114 protected pre-existing modified/untracked file hashes remained unchanged. The pushed commit/PR is recorded in the final handoff. Production remains unchanged until this candidate is released; no migration is needed.
