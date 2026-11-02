# UI polish release — 2 November 2026

Owner authorized Production deployment in this chat, superseding the earlier local-only request. The release contains the three completed requests; unrelated primary-checkout work is excluded.

## Released behavior

- Teacher and student notifications share a bordered “อ่านทั้งหมด” Button with hover/focus feedback and a 44px target; the dropdown fits narrow screens.
- Student classroom navigation shows the current subject/class/term and switches between enrolled subjects and homeroom using the teacher-style context navigation. Overview and assignments navigation agree with page tabs.
- Teacher file assignments accept drag/drop and the existing picker through one validation/upload path. Supported attachments: PNG/JPEG/WebP/GIF, PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, ZIP; maximum 10 files, each 10 MB after image downscaling. Existing files survive rejected selections. Published instructions remain locked.
- The file form reuses the exercise `ClassroomPicker`, retaining the primary room and allowing searchable additional rooms. The payload includes the primary and selected additional rooms.
- Staging QA exposed an existing UTC/Bangkok announcement timestamp mismatch. `ClassroomStream` now uses the existing `formatThaiDateTime` helper for deterministic SSR/browser output.

Images/PDFs retain the existing `question-images` path. Documents use the existing `classroom-post-files` bucket under the attaching actor's `file-assignment-instructions` namespace. Server actions validate same-project storage URLs and actor ownership or exact authorized prior/copy URLs. No migrations, bucket settings, or RLS changes were made.

## Git and deployments

- Original local commits: notification `3c69f7c`, student sidebar `7cb289e`, file assignment `e69301d`.
- Combined candidate commits: `a084bd7`, `edbde51`, `643072c`; timezone correction `0610d59`.
- Staging [PR #121](https://github.com/korkru-me/jk/pull/121) merged as `5ed8ec1`; timezone [PR #123](https://github.com/korkru-me/jk/pull/123) merged as `a6813115b32be9ddf2ee2e7360e05cc254bd9737`.
- Final Staging deployment: `dpl_DbS2j1Bh5pLBNusHnyk4xisLTHWG`, READY, alias `staging.korkru.com`.
- Production [PR #122](https://github.com/korkru-me/jk/pull/122) merged as `8596c2866df021566fba6b0d9c4953aaf1f053a4`.
- Production deployment: `dpl_GouzZbBiyvv9HQ3yYc2jqmuQszjK`, READY, canonical aliases `www.korkru.com` / `korkru.com`. Vercel API confirms branch `master`, exact merge SHA above, and aliases assigned.
- Handoff branch: `codex/ui-polish-release-20261102`. Release evidence is a documentation-only follow-up; the deployed source is the Production merge above.

## Validation

- Combined candidate: TypeScript, design-token lint, 344 test files / 4,873 tests, isolated Webpack production build passed.
- Staging integration: TypeScript, design-token lint, 346 test files / 4,895 tests passed.
- After the timezone correction: existing Thai-time tests 20/20 (UTC and Los Angeles process zones), TypeScript, token lint, and UTC isolated production build passed. UTC dev reproduction no longer shows the announcement text mismatch; a separate attribute warning was caused by the installed Grammarly extension.
- Local fixtures before release: drop PDF/Word/ZIP/PNG together, CSV via picker, file count/size rejections preserving existing files, additional-room payload, document download names, PDF viewer, published-content lock, desktop and 390/320px layouts passed.
- Hosted Staging: visible Staging badge, notification read-all state and 44px bordered button, current subject and subject switch, additional-room search/selection and in-memory multi-room payload, PDF iframe loaded (loading indicator cleared), fullscreen/close controls passed. Fresh student page after the fix has no console errors.
- Production read-only smoke on the actual signed-in file-assignment route: new drop zone and supported-type help visible, primary room retained, additional-room picker opens with available rooms. Shared notification button measures 44px high with a 1px border and pointer cursor. The real read-all/save/assign/upload actions were not invoked. The only captured console error was from the installed Grammarly extension, not the application.
- Candidate preview checks on feature branches were marked successful by GitHub while Vercel skipped those builds via its Ignored Build Step. Readiness claims refer to actual canonical Staging/Production builds, not those skipped previews.

## Verification limits

- Hosted file chooser automation was unavailable because Chrome's extension local-file access is disabled. No browser permission was broadened. Drop/picker handling was verified locally using synthetic files; hosted Auth/Storage/RLS upload-and-save roundtrips remain unverified.
- Hosted classroom/notification interaction checks used synthetic fixture data. Real student membership navigation was covered by server-helper unit tests and authorization review, not a signed-in hosted student end-to-end test.
- Production verification is read-only; no test assignment, notification mutation, account, upload, or database record is created there.

## Primary localhost parity

Actual primary checkout: `/Users/korkusonmasaen/Korkru/korkru`, branch `codex/student-classroom-cards`, port 3000, Next Turbopack. Application/test scope is 21 files including the timezone fix. Source comparison uses the exact Production merge, not just the candidate.

The primary checkout is shared and dirty. Release files were integrated selectively; all 195 protected unrelated/local files and local environment settings match the before-release snapshot. The primary branch and staged-path state were preserved. No reset, broad stash, or broad staging was used.

After Production reached READY, compared all 21 application/test files against `8596c2866df021566fba6b0d9c4953aaf1f053a4`: no mismatches. Verified on the actual primary port 3000:

- Desktop student current subject, switching physics → math, and sidebar assignments updating `?scenario=math&tab=assignments` with the matching selected content tab.
- Student drawer at 390px shows the current subject and alternative subjects; choosing physics switches the page and closes the drawer. Document width equals viewport width.
- File form at 390px shows the drop zone and picker with no horizontal overflow. A synthetic in-memory assignment selects primary ม.4/1 plus additional ม.4/3 and displays both in its receipt.
- Notification fixture at 320px has a 44px high, 1px bordered pointer-cursor button, no horizontal overflow, and removes the button after reading all synthetic notifications.
- Next MCP identifies the primary checkout above; `get_compilation_issues` returns `issues: []`, and `get_errors` returns empty `configErrors` / `sessionErrors`. Browser screenshots were inspected for desktop and mobile states. Temporary viewport overrides were reset; primary dev remains running on port 3000. The separate UTC debug server on 3018 was stopped.

No remaining source-sync gap was found. The hosted upload-and-save and signed-in student end-to-end limits above remain explicit verification gaps.
