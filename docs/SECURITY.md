# Security และ privacy guardrails

## Assignment reminder authorization — 20 October 2026 (local; hosted write verification stopped)

Reminder sends require a verified active teacher/admin, exact `canManageAssignment`, and owner/admin/manage authority in the supplied active classroom. A readable assignment alone does not authorize notifying a classroom. The server validates IDs, published online work, the exact assignment-room link, current active student roster and group targeting before privileged reads/writes; it uses the assignment's canonical `org_id`. Finished-attempt checks exclude both submitted and graded states, including pending/zero scores and earlier finished attempts followed by a new in-progress attempt. Query failures return an error rather than assuming no submissions or no recent notifications.

Student reminder reads start from their own recipient-scoped notification history and session memberships, recheck active rooms and exact links, then read only that verified student's group membership and own attempt status. The service reader projects only published assignment ID/title/close/author metadata after that reach check; it never grants direct student SELECT on `assignments`, whose full rows contain access codes. The DTO contains no peer answers, scores, keys, credentials or private profiles. Stored notification text/links are not trusted as assignment authority. Acknowledgement filters exact ID + recipient + `assignment_reminder` and requires a returned row before claiming success. Existing generic bell actions remain separate.

The 24-hour unread lookup plus insert is not atomic: concurrent senders may produce duplicate rows, and completion or membership changes can race delivery. The student reader rechecks current reach and any finished attempt before display, and newest-per-assignment handling prevents ordinary duplicate popup entries; this does not claim an exactly-once send protocol. No new schema, RLS policy/grant, service-only RPC, email, signup or password code is introduced. Full candidate checks, local pure/mocked authorization tests, offline harness fences and local injected UI checks pass. The Staging migration preflight read 165 history rows and found the already documented remote-only `20261009142610` / local-only `20261015132234` difference. AGENTS requires stopping database mutations at that mismatch: no fixture was created, no keys were read, and no schema apply/repair/replay occurred. Hosted real teacher-to-student delivery/acknowledgement is intentionally untested; application release remains pending. The prepared synthetic harness restricts fixtures to the fixed Staging project and uses private manifests plus session revocation and exact provenance-checked cleanup when execution is permitted.

## Classroom streaming — local, 18 October 2026

The streamed classroom fallback is emitted after the existing verified actor and exact owner/co-teacher checks, never from a guessed URL or a client-provided classroom name. It exposes only id/name/description/type and the authorized navigation set. Roster, scores, invitation tokens and private student profiles stay out of this early DTO. Every deferred tab request repeats route authorization; view-only co-teachers cannot request score/manager data or invitations through a forged view parameter. Score reads are further restricted to the current classroom roster. Missing optional score metadata does not bypass authorization or suppress unrelated database failures.

## Grading workspace boundaries — local, 18 October 2026

Bulk-save UI reuses the existing action for each changed answer, with its first-edit expected revision. Client validation and navigation guards do not authorize a write or replace server numeric/membership checks. Untouched pending components are omitted; partial or ambiguous failures keep their drafts rather than claiming all answers saved. No batch RPC, schema, RLS or privileged-client changes were introduced, and score drafts remain in page memory only.

Grading readers require a verified active teacher/admin (or trusted super admin) with management access to the exact assignment before service-role learner reads. Summary DTOs omit student response bodies, frozen keys, random values, emails and private profile fields; detail reads bind to authorized official submission IDs and the selected question/student window. Question content still passes assignment provenance checks. URL filter state never supplies resource authority or trusted score bounds.

Private work preview signing validates the complete `students/<student>/<submission>/<answer>/<upload>/preview.webp|png` namespace before issuing 300-second URLs; it never signs scene JSON or unrelated paths. Public attachment rendering allows only the configured project's known buckets; PDF rendering fetches with omitted credentials, validates MIME/signature and a streamed 10 MiB cap, then uses a typed PDF Blob in the browser's native viewer. The viewer receives neither the stored public URL nor HTML; iframe sandbox blocks Chrome's PDF viewer and is deliberately omitted after byte validation. Signing failure shows unavailable evidence, never fabricated content.

The new policy/audit data has RLS with browser grants revoked. Service-only invoker RPCs repeat active actor, role, assignment and submission membership checks, lock rows, enforce numeric component bounds and reject stale revisions before any mutation. A work-only review cannot silently claim ownership of an automatic answer. Missing migration disables new writes without bypassing to direct updates. The synthetic grading lab disables external mutations/polling and is unavailable in production, including its local asset route.

## Grading corrections — local implementation, 18 October 2026

Bank changes require verified active actor and exact bank-edit authority before service reads. Link enumeration reads assignment IDs; learner data is read only after canManageAssignment. Void checks management of the selected assignment. HMAC acknowledgement binds actor/question/edit/revision/scope, expires and is checked against fresh data; browser scores and target lists are not trusted. Manual overrides and unmanageable assignments are preserved.

Service-only SECURITY INVOKER RPC uses fixed search_path, repeats actor/owner/team checks, whitelists question fields, validates complete snapshots/numeric bounds and commits key/score/audit together. Private audit/void tables have RLS and revoked browser grants. Completed-answer fence remains; grading bypass requires service role plus transaction-local context and cannot change inputs/random values/order. Insert revision fence and locked empty-attempt cleanup prevent mixed-rubric answers and deletion of committed attempts.

Validation uses synthetic browser state, server mocks and throwaway PGlite, not deployed RLS tests. Migration is pending and linked history differs. No remote repair, database mutation, push or deployment performed.

## Signup/email safeguards — 17 October 2026 (prepared)

Public auth-email actions validate inputs and reserve bounded shared email/IP counters before sending. The server-only fixed RPC is an explicitly permitted anonymous reservation operation: it accepts only keyed HMACs, performs no user/profile/tenant reads, takes no client-selected SQL/table/function, and exposes no browser grants. RLS remains enabled with no anon/authenticated policies; service_role has only this intended application path, while normal account mutations still require verified identity and exact-resource authorization. Failures/configuration gaps reject sending. The limiter cannot protect direct public Supabase Auth calls; hosted rate limits and current-password enforcement must be configured/tested. CAPTCHA is not wired in this phase.

Current-password settings verifies credentials against the exact getUser identity using a no-storage client, cleans its temporary session, and passes current_password with the update. Recovery requires a one-hour HMAC intent with recipient/nonce hash and optional expected user ID; its secret nonce arrives only in the emailed redirect. Callback requires that intent, nonce, PKCE exchange and matching recipient/ID before issuing the ten-minute exact user/access-token grant. A login cookie or arbitrary fresh OAuth code alone is insufficient. Old nonce-less recovery links must be reissued in the same browser. Global sign-out revokes refresh tokens; existing JWTs can remain valid to expiry. Clearing intent/grant cookies is not an atomic single-use ledger. Policy metadata is user-editable acknowledgement, never authorization or a complete consent audit. Actual controller/retention/minor/sensitive-data policies require owner review before a public legal-compliance claim. Deployment gaps and checks are in `docs/AUTH_SIGNUP_ROLLOUT.md`.

Google connection ใน settings ใช้ verified identities ไม่เชื่อ provider metadata หรืออนุมานว่ามีรหัสผ่าน ต้องตรวจรหัสปัจจุบันของ exact user และ challenge 5 นาทีที่ผูกอีเมล/access token ก่อนตรวจ JWT RS256 กับ Google JWKS คงที่ผ่าน `jose`; ตรวจ issuer/audience/freshness/nonce/verified same email ก่อน Supabase automatic sign-in client แยก แล้วตรวจ ID/อีเมล/Google subject และยุติ temporary session โดยไม่แทน session เดิม ไม่แก้ profile/role หรือ merge ข้อมูลเมื่อ ID ต่าง Flag ค่าเริ่มต้นปิดและไม่เปิด Manual Linking ข้อป้องกันนี้ไม่บังคับทุก direct Auth request; email-change race อาจสร้าง Auth identity ที่ไม่คาด แม้แอปปฏิเสธผล ID ต่าง ต้องตรวจ collision/race บน Staging ก่อนเปิดตาม `docs/ACCOUNT_SIGN_IN_METHODS.md` ไม่อ้างว่าล้าง challenge cookie แล้วเป็น atomic single-use

## Resend quota webhook — 17 October 2026 (prepared)

The exact public POST `/api/webhooks/resend` uses Svix raw-body signature/timestamp verification, a 32 KiB streaming cap, and server-only configuration (disabled by default). Unauthenticated requests cannot call the provider or choose an alert recipient. Only aggregate current-window usage is read from fixed Resend HTTPS endpoints; redirects are rejected, fetches time out, and upstream error bodies/payloads/keys/recipient lists are never returned or logged. Stable day/environment/level-scoped v2 idempotency prevents duplicate sends at 80/90/97%, including retry-after-timeout; signed alert tags permit only upward level transitions, never same/lower-level recursion. SMTP uses a separate domain-restricted Sending access key in Supabase, while the monitor needs Full access solely on the server. Staging/Production signing secrets and keys must be distinct. No Auth/RLS/grading change or database access is added; see `RESEND_SETUP.md` for rollout and limitations.

การปิดรอบ (`20261014072745`, apply เฉพาะ Staging): RPC เป็น SECURITY INVOKER, `search_path = ''` และ revoke PUBLIC/anon/authenticated Student action ใช้ Auth ที่ตรวจแล้วและ exact owned row โดย SQL ตรวจ owner/expiry ก่อน forced closure Trigger คำตอบ/วิธีทำใช้ row lock เดียวกับการปิดและปฏิเสธ late writes ระหว่าง cron ticks เขียนคะแนนแบบ atomic และส่ง receipt ที่ไม่มีคะแนนซ่อน Global worker ต้องผ่าน constant-time secret comparison แยก environment Vault dispatch ใช้โดย postgres cron เท่านั้น ไม่เปิดให้ browser/service-role worker อ่าน Responses มีเฉพาะยอดรวม ไม่พิมพ์ข้อมูลนักเรียนหรือ key และไม่ใช้ credential ของ Staging ใน Production

## Reset numeric variants safely — 15 October 2026

Explicit client reset/reload POSTs reauthorize the exact active answer through getWritableStudentAnswer (owner/status/expiry/deadline/native session). No GET or prefetch mutation. Numeric values and answer key change together with old-map equality plus exact row count; stale autosave payloads are bound to the visible numeric map and rejected before update. Returned student data contains only public values, never the newly computed key. Preview grading remains teacher-only. Submitted/carried/checked-streak history stays immutable; no timer reset or permission expansion. No migration or external database write was made for this change.

## Request-local practice snapshot reads — 15 October 2026

The optimized development snapshot reuses only the first page's verified actor/library/roster result inside that one call. Its private reader cannot be called by the browser, and every page still uses the actor/library-scoped RPC that repeats current resource authorization. A denied later page or inconsistent totals/IDs rejects the whole snapshot. Public searches and new requests reauthorize independently; no persistent or cross-request authorization cache is introduced. Routes still verify Auth/feature flag and the signed library access-code session before rendering any snapshot; DTOs contain display metadata only. No schema, RLS, RPC grants or grading behavior changed

## Prepared personal exercise update and pin authorization

Update and pin actions reverify session, exact library/roster and signed access-code session. SQL rechecks those resource relations, exact exercise owner and all selected memberships. Updates serialize with FOR UPDATE and revision checks; stale payloads receive PT409 and are not written. Pins are private per actor/library/question, with no browser table or execute grants. Pinned search uses literal term matching and exact tag AND semantics with 24-row bounds. Local QA uses synthetic browser storage and PGlite only; no live schema or student data was changed.


## Prepared student personal exercise access boundary

The access assertion helper alone is service-only SECURITY DEFINER with an empty search_path, to share-lock protected library/roster rows without expanding direct UPDATE grants. Main creation/list/page RPCs remain SECURITY INVOKER.

The server derives actor from a verified session and checks the signed library access-code session before service-only invoker RPCs. SQL rechecks active student, exact current roster, published library, active subject classroom and matching organization, holding share locks during creation. New table enables RLS and revokes PUBLIC/anon/authenticated privileges. RPC execution is service-only. Members are bounded, unique and belong to the exact library. A request UUID retries the same creation; conflicting owner/library/title/membership is rejected. Progress never stores or returns answers or correctness. Attached-solution reads require exact question membership and the library reveal setting.


## Pending classroom announcement acknowledgements

The prepared acknowledgement migration uses service-only SECURITY INVOKER functions with `search_path = ''`; new tables enable RLS and revoke direct PUBLIC/anon/authenticated access. Server actions derive actor IDs from verified sessions and RPCs repeat student roster or owner/co-teacher admin/manage authorization against the exact post/classroom. The same post row lock serializes acknowledgement/resend; stale rounds fail, and no peer receipt identifiers enter student payloads. Automatic sighting data is not represented as explicit acknowledgement. This schema is not applied and its server flag defaults off; hosted Auth/Data API/cross-org and separate-connection race verification remain required after migration history is reconciled.

อัปเดตล่าสุด: 7 ตุลาคม 2026

KorKru จัดการข้อมูลนักเรียนและอาจเกี่ยวข้องกับผู้เยาว์ ความปลอดภัยและความเป็นส่วนตัวเป็นเงื่อนไขของความถูกต้อง ไม่ใช่งานเก็บรายละเอียดภายหลัง

## ข้อมูลที่ต้องปกป้อง

- Identity: ชื่อ อีเมล รูปโปรไฟล์ รหัสนักเรียน
- Education records: ห้องเรียน งาน คำตอบ คะแนน feedback และประวัติ attempt
- Contact/family: ที่อยู่ เบอร์โทร ผู้ปกครอง และข้อมูลครอบครัว
- Health/wellbeing: แพ้อาหาร โรคประจำตัว ความเครียด พฤติกรรม และบันทึกครู
- Credentials/secrets: session, invite/access codes, anon/service keys และ OAuth data

ห้ามบันทึกข้อมูลเหล่านี้ใน console/log/analytics โดยไม่จำเป็น ห้ามใช้ข้อมูลจริงใน fixture, screenshot หรือ prompt ภายนอกโดยไม่ได้รับอนุญาต

## Authorization model

- Browser UI ไม่ใช่ security boundary
- ทุก mutation ต้องยืนยัน session และสิทธิ์ต่อ resource ฝั่ง server
- RLS ต้องป้องกัน direct API access แม้ client ถูกดัดแปลง
- `org_id`, classroom membership, ownership และ co-teacher permission ต้องตรวจตาม action
- การดูข้อมูลนักเรียนต้องจำกัดตามวัตถุประสงค์ ไม่ใช่เพียงอยู่ organization เดียวกัน
- แยก system admin, organization admin, classroom admin และ super admin ให้ชัด

## Authentication และ account recovery

- ตรวจ email, password, display name และ `teacher|student` ซ้ำฝั่ง server ทุกครั้ง ห้ามเชื่อ role จากปุ่มหรือ TypeScript type ใน browser
- Google OAuth ที่ยังไม่มี `survey_role` ต้องจบ profile completion ก่อนเข้า protected app; การกำหนด role ครั้งแรกต้องตรวจ exact session และ update เฉพาะ profile เดียวที่ `survey_role IS NULL`
- หน้า login ใช้ Google และ email/password โดยถอดปุ่ม Magic Link แล้ว; backend `sendMagicLink` และ callback เดิมยังต้องตั้ง `shouldCreateUser: false`, ผ่าน limiter และตอบแบบไม่เปิดเผยว่าอีเมลใดมีบัญชี
- password recovery ต้องมี same-browser intent/nonce จากอีเมลและแลก PKCE code ที่ตรง recipient/expected ID ก่อนออก grant และเรียก `updateUser`; หลังเปลี่ยน credential พยายาม global sign-out เพื่อตัด refresh token เดิม และรายงานเมื่อ revocation ไม่สำเร็จ
- การสร้าง auth user ต้องสร้าง profile และ personal organization ใน transaction เดียว ฟังก์ชันซ่อม provisioning ต้องล็อกต่อ user และ idempotent เพื่อไม่สร้าง workspace ซ้ำเมื่อ callback ชนกัน

## Supabase admin client

`createAdminClient()` ข้าม RLS และเป็นจุดเสี่ยงสูง:

- ใช้ได้เฉพาะ server-only code
- ห้ามส่ง service role key หรือ admin client ไป browser
- ตรวจผู้ใช้ด้วย session ก่อน แล้วตรวจ ownership/membership/permission อย่างชัดเจน
- จำกัด query ด้วย resource ID และ tenant ที่ตรวจแล้ว
- อย่าใช้ admin client เพียงเพื่อทำให้ query ที่ติด RLS “ผ่าน”
- **หน้าที่รับ resource ID จาก URL ต้องปฏิเสธทุกบทบาทก่อน query ด้วย admin** ไม่ใช่เฉพาะนักเรียน — `role = teacher|admin` บอกแค่ว่าเป็นครู ไม่ได้บอกว่าเป็นครูของห้องนี้ · หน้า `/classrooms/[id]` เคยตรวจ roster เฉพาะฝั่งนักเรียน ครูคนใดก็ได้ที่รู้ UUID ของห้องจึงได้แถว `classrooms` ทั้งแถว (รวม `class_code` ที่ใช้เข้าห้อง) รายชื่อ + อีเมลนักเรียน รายชื่อ + อีเมลครูร่วม และ **token ลิงก์เชิญครูร่วมที่ยังใช้ได้** (ซึ่งเอาไปกดรับเป็นครูร่วมของห้องนั้นได้) ส่วนคะแนน งานที่ส่ง และ `student_profiles` ไม่รั่วเพราะผูกกับ `canManage` และประกาศอ่านผ่าน RLS แก้ 27 ก.ย. 2026 ให้ตอบ 404 เมื่อไม่ใช่ `classrooms.teacher_id` และไม่มีแถวใน `classroom_co_teachers` · super admin (`super_admins`) ไม่ได้รับยกเว้นในหน้านี้ เพราะ server action ของห้องเรียน (`canManageClassroom`, `canManageAssignment`, co-teacher, บันทึกโฮมรูม) ไม่มีตัวไหนรับ super admin และยังไม่มี audit ของการเปิดดูห้องครูคนอื่น ถ้าต้องเปิดให้ platform support ดูห้องได้ ให้ทำเป็นเส้นทางแยกที่บันทึก audit

## RLS และ multi-tenancy

- ห้าม disable RLS หรือเพิ่ม policy แบบกว้างเพื่อแก้ปัญหาชั่วคราว
- ทดสอบ positive และ negative cases ด้วยผู้ใช้คนละ organization
- ตรวจ recursion/SQL helper ด้วย `SECURITY DEFINER`, fixed `search_path` และสิทธิ์ execute ที่เหมาะสม
- field ที่ใช้ใน RLS บ่อยต้องมี index ที่เหมาะสม
- การแชร์ต้องเป็น explicit relation/visibility ไม่แก้ ownership boundary
- policy ที่ไม่ใส่ `TO authenticated` มีผลกับ `public` ซึ่งรวม `anon` และตารางใน `public` ได้ table grant ให้ `anon` โดยอัตโนมัติ — policy แบบนั้นเปิดให้ใครก็ได้ที่มี anon key (อยู่ในหน้าเว็บทุกหน้า) โดยไม่ต้องล็อกอิน · UPDATE policy ที่ไม่มี `WITH CHECK` จะใช้ `USING` ตรวจแถวใหม่ด้วย

### ลิงก์เชิญ (คำเชิญครูร่วม / คำเชิญเข้า organization)

- **token ของลิงก์เชิญคือ bearer secret** ใครถือก็รับคำเชิญได้ จึงห้ามมี policy หรือ query ที่อ่านหรือแก้แถวคำเชิญโดยไม่ต้องรู้ token ก่อน
- `classroom_invitations` และ `org_invitations` อ่าน/เขียนตรงได้เฉพาะผู้จัดการคำเชิญ (`classroom_invitations_owner_all` = เจ้าของห้องหรือครูร่วม `admin` · `org_invitations_owner_*` = owner/admin ของ org หรือ super admin) และ `anon` ไม่มีสิทธิ์บนสองตารางนี้เลย
- ผู้รับเชิญใช้ฟังก์ชันที่ต้องได้ token ตรงตัวเท่านั้น: `get_classroom_invitation_preview` / `accept_classroom_invitation` และ `get_org_invitation_preview` / `accept_org_invitation` (`SECURITY DEFINER`, `search_path = ''`, execute เฉพาะ `authenticated`) · preview คืนแค่ชื่อห้องหรือ org กับสิทธิ์ ไม่คืน id · accept ล็อกแถวคำเชิญ (`FOR UPDATE`) เพิ่มสมาชิก และปิดคำเชิญในธุรกรรมเดียว ลิงก์หนึ่งใบจึงใช้ได้ครั้งเดียวแม้สองคนกดพร้อมกัน · คนที่สอนห้องหรืออยู่ใน org นั้นอยู่แล้วได้ id กลับไปโดยไม่ใช้ลิงก์ และสิทธิ์เดิมไม่เปลี่ยน
- server action (`lib/actions/co-teachers.ts`, `lib/actions/org-members.ts`) ตรวจ session และรูปแบบ token (`isInviteToken`: hex 64 ตัว) ก่อนถามฐาน และตอบข้อความทั่วไป ไม่ส่ง error ของฐานกลับไป
- หน้า `/classrooms/[id]` อ่านคำเชิญด้วย admin client จึงต้องกรองเองให้ตรงกับ RLS: โหลดเฉพาะเมื่อเป็นเจ้าของห้องหรือครูร่วม `admin` — **สิ่งที่ส่งเข้า Client Component อ่านได้จาก RSC payload แม้แท็บจะซ่อนไว้** ก่อนหน้านี้ครูร่วมทุกระดับรวม `view` ได้ token ของคำเชิญที่ยังใช้ได้ทุกใบ (รวมใบที่ให้สิทธิ์ `admin`)
- **ประวัติ (แก้ด้วย migration `20260928021309_close_invitation_token_reads.sql`, 27 ก.ย. 2026):** `classroom_invitations_token_select` ให้ผู้ใช้ที่ล็อกอินทุกคน (รวมนักเรียน) อ่าน token ของคำเชิญครูร่วมที่ยังใช้ได้ทุกใบ · `org_invitations_token_select` ไม่ได้จำกัด role จึงอ่านได้ด้วย anon key โดยไม่ต้องล็อกอิน แล้วสมัครบัญชีเข้า org ใดก็ได้ในฐานะ `admin` · `classroom_invitations_mark_used` ให้คนนอกกดคำเชิญครูร่วมทุกใบเป็น "ใช้แล้ว" หรือเปลี่ยนสิทธิ์ของคำเชิญเป็น `admin` · `org_invitations_mark_used` ให้ anon เปลี่ยน role และวันหมดอายุของคำเชิญ org ได้ แต่เพราะไม่มี `WITH CHECK` การตั้ง `used_at` จึงไม่เคยผ่าน **ลิงก์เชิญเข้า org ทุกใบใช้ซ้ำได้จนหมดอายุ** (`joinByToken` ไม่ได้ตรวจ error ของการปิดลิงก์) — ยืนยัน policy จริงบน Staging แล้ว (บทบาท `public` และ anon มี SELECT/UPDATE grant) และมี PGlite regression ที่ `lib/invitation-tokens-sql.test.ts` ซึ่งรันทั้ง policy เดิมและ policy ใหม่ในบทบาท `anon`/`authenticated`
- ยังไม่ได้ทำ: token เก็บแบบ plaintext (ต่างจากลิงก์ IOC ที่เก็บเฉพาะ SHA-256) เพราะหน้าจัดการคำเชิญแสดงลิงก์เดิมให้คัดลอกซ้ำ ถ้าฐานข้อมูลหลุด ลิงก์ที่ยังไม่หมดอายุก็ใช้ได้ · คอลัมน์ `email` ของคำเชิญไม่ได้ผูกผู้รับ ลิงก์ที่ถูกส่งต่อถึงใครก็ใช้ได้จนหมดอายุ (7 วัน) หรือถูกเพิกถอน

## Migrations

- ตรวจสถานะ migration ของฐานข้อมูลจริงก่อนเขียน
- ก่อน `migration list`, `db push` หรือ `migration repair` ต้องยืนยันว่า project ref จาก
  `NEXT_PUBLIC_SUPABASE_URL` ของ deployment เป้าหมายตรงกับ `supabase/.temp/project-ref`
  ของ CLI ห้ามอนุมานว่า linked project คือ Production จากชื่อ branch หรือผล push ครั้งก่อน
- ห้ามแก้ migration ที่ apply แล้วเพื่อเปลี่ยน production
- migration ที่แตะ policy/role/function ต้องผ่าน review เป็นพิเศษ
- รักษา backward compatibility ระหว่างช่วง deploy code และ schema
- อย่าใส่ secret หรือข้อมูลผู้ใช้จริงใน SQL

## คลังฝึกไม่มีคะแนน

- สรุปงานนักเรียนใช้ catalog loader ภายใต้ session/RLS เดิมหลัง Auth/student-role/feature-flag check. Allowlist มีเพียง library ID/title, classroom ID/name, จำนวนโจทย์ และเวลาสร้าง/เผยแพร่; projection ใช้ metadata ของห้องที่อยู่ใน roster และยัง active subject เท่านั้น. ไม่อ่าน/ส่ง attempt, answer, correctness, score หรือ access code และไม่ใช้สถานะฝึกเป็น completed/grade/calendar event. ไม่มี admin read หรือ RLS grant ใหม่สำหรับส่วนนี้

- `practice_libraries`, `practice_library_questions` และ `practice_answer_attempts` เป็น security boundary แยกจาก assignment/submission; ห้ามใช้การซ่อนคะแนนใน UI แทนการแยก schema และห้ามเขียน accepted-check เข้า gradebook, analytics, homeroom score หรือ question statistics
- server-only `PRACTICE_LIBRARY_ENABLED` คุมเพียงการเปิด route/navigation ค่า false ต้องตอบ 404/ซ่อนทางเข้า แต่ค่า true ไม่ให้สิทธิ์เพิ่ม ทุก page, Server Action และ RPC ต้องตรวจ session, role, exact organization, classroom relation และ resource ID ใหม่
- owner และ co-teacher `admin/manage` จัดการคลังและอ่าน roster progress ได้ ครูร่วม `view` อ่านได้เฉพาะ metadata library และต้องถูกปฏิเสธเมื่อเปิด progress URL/RPC โดยตรง นักเรียนต้องอยู่ใน roster ของ exact classroom และ library ต้อง `published`
- browser ไม่มี direct write grant บน `practice_answer_attempts`; `record_practice_answer_attempt` เรียกได้เฉพาะ service boundary หลัง validate คำตอบที่ไม่ว่างและ evaluate แล้ว และตรวจ `p_actor_id`/library/question/idempotency ซ้ำใน transaction
- event ถาวรเก็บเพียง library, student, question, database time และ UUID idempotency key ห้ามเก็บคำตอบ ความถูกต้อง คะแนน answer key เหตุผลที่ผิด solution หรือ derived accuracy; application/error/analytics log ห้ามพิมพ์ payload และ feedback
- query นักเรียนต้อง select allowlist และห้ามส่ง answer-bearing `questions` row เต็มเข้า Client Component; randomized question ใช้ HMAC receipt อายุจำกัดที่ผูก actor + library + question + exact revision ด้วย keyed binding แต่ payload ฝั่ง browserต้องไม่มีทั้ง seed และ raw revision ซึ่งใช้เดา permutation/answer key ได้ Server อนุมาน seed จาก nonce ด้วย `PRACTICE_VARIANT_SECRET` อย่างน้อย 32 ตัวอักษรหลังตรวจลายเซ็นเท่านั้น
- service-only read RPC ต้องตรวจ exact actor/resource ใหม่ใน SQL และไม่เปิด execute ให้ browser; manager RPC อนุญาต owner/admin/manage อ่านเฉพาะสมาชิกของ library นั้นเพื่อรักษา owner-private membership แต่การเพิ่ม UUID ใหม่และ bulk tag ต้องผ่าน visibility/ownership ที่แคบกว่า การสร้าง แก้ และทำสำเนาต้อง atomic เพื่อไม่ให้ metadata กับลำดับสมาชิกค้างคนละสถานะ
- DTO ครูเป็น allowlist และมี regression guard ต่อชื่อ field ต้องห้าม; ไม่มี export path, leaderboard, ranking, red/green mastery หรือ timeline activity ใน MVP
- negative test ขั้นต่ำต้องครอบคลุม anon, student คนอื่น, ถอน roster, draft/closed library, view-only co-teacher, ครูนอกห้อง, ต่าง organization, question ที่ไม่อยู่ใน library, UUID ซ้ำ และ concurrent retry ตาม `docs/SELF_PRACTICE_UAT.md`

## Grading integrity

- random values และ correct answer ต้องตรงกันตลอดหนึ่งชุดตัวเลข เปลี่ยนพร้อมกันเฉพาะ explicit reset/refresh ที่ตรวจสิทธิ์แล้ว; ลำดับข้อ/ตัวเลือกและประวัติที่ส่งแล้วตรึงต่อ attempt
- server ต้องบังคับเวลา attempts และ access code ไม่พึ่ง client
- หน้ารอของ exam/exercise ส่งเฉพาะ allowlisted metadata หลังตรวจ Auth/assignment roster/native session ไม่ส่ง assignment row, access-code value, question/answer content หรือ student score; GET/prefetch ไม่ allocate/grade/draw `startAssignmentFromWaiting` ตรวจทุก gate ใหม่ ไม่ถือว่า UI/previous receipt/query เป็น authorization และ teacher preview ต้องตรวจ `canManageAssignment` ทั้ง waiting และ answer-bearing route (12 ตุลาคม 2026)
- ประกาศจากครูในหน้ารอใช้ `assignments.description` แบบ rich text: create/update Server Action sanitize ก่อนเขียนและทุก render sanitize ซ้ำ อนุญาตรูปเฉพาะ HTTPS public URL ของ bucket `question-images` บน `NEXT_PUBLIC_SUPABASE_URL` ปัจจุบัน ตัด script/event/style/external/data/signed URL ออก; upload ใช้ session browser และ Storage RLS บังคับโฟลเดอร์ `{auth.uid()}` เดิม ไม่ใช้ service-role upload
- การแก้คะแนนต้องตรวจสิทธิ์ เก็บผู้แก้ และเวลา
- การปรับคะแนนกลุ่มส่งช้าต้องไม่รับ student ids จาก browser: Server Action ตรวจ `canManageAssignment` แล้วคำนวณสมาชิกจาก first completed submission, policy สี และ extension ในฐานข้อมูลใหม่ทุกครั้ง ก่อนเรียก RPC ที่ grant เฉพาะ `service_role`; current/audit tables เปิด RLS โดยไม่มี browser policy หรือ direct grant
- ค่าปรับแบบกลุ่มต้องเก็บแยกจากผลรวมคำตอบ ใช้ replacement semantics พร้อม batch/item audit และทำให้ attempt เดิมกับ retry ใหม่ของ student เดียวกันตรงกัน เพื่อไม่ให้การตรวจรายข้อซ้ำลบค่าปรับหรือการกดซ้ำหักสะสมโดยไม่ตั้งใจ
- score rescaling และ attempt strategy ต้องให้ผลเหมือนกันทุกหน้าที่อ่านคะแนน
- ห้ามให้นักเรียนอ่านเฉลยก่อนนโยบาย `show_results` อนุญาต

### Exam-taking data boundary

- `questions`, `assignments` และ `submission_answers` มี secret/answer-bearing columns จึงห้ามส่ง `select('*')` จากแถวเหล่านี้เข้า Client Component ของนักเรียน
- ระหว่างทำข้อสอบ browser รับเฉพาะ DTO จาก `lib/exam-safe.ts`; ต้องเพิ่ม field ใหม่ด้วย allowlist และ regression test ไม่ใช้ object spread จาก database row
- student RLS ห้ามอ่าน question-bank row และ assignment row เต็ม; `assignments.access_code` ต้องอยู่ฝั่ง server เท่านั้น · ตั้งแต่ migration `20260926022404` นักเรียนไม่มี policy อ่าน `questions` เลย — policy เดิม (`questions_student_results_select`) เปิดทั้งแถวหลังส่งตาม `show_results` จึงพาเฉลยวิธีทำไปให้นักเรียนที่ยังเหลือรอบอ่านผ่าน API ได้ หน้าผลสอบอ่านเฉพาะคอลัมน์ที่แสดงด้วย service role สำหรับ `question_id` ที่ RLS ของ `submission_answers` คืนมาเท่านั้น
- **เฉลยที่ไม่ให้ดู ต้องไม่ถูกส่งไปที่ browser เลย ไม่ใช่ส่งไปแล้วซ่อน** — นักเรียนที่เปิด DevTools อ่าน network response, React props, RSC payload, `localStorage` และ bundle ได้ทั้งหมด การซ่อนด้วย CSS, `hidden`, conditional render, การไม่ผูก state หรือการ obfuscate ไม่ใช่การปกป้อง ถ้าค่าอยู่ใน payload ถือว่านักเรียนอ่านได้แล้ว
- เกณฑ์ตัดสินคือ **serialize หรือไม่** ไม่ใช่ render หรือไม่: ฟิลด์เฉลยต้องหายไปจาก object ที่ server ส่งกลับ (conditional spread/omit) ไม่ใช่ส่งเป็นค่าว่าง `null` หรือ flag ให้ client ตัดสินใจเอง — ดู `buildAnswerFeedback` ที่ไม่ใส่คีย์ `correct` ของแต่ละแถวเมื่อ `instant_check_answer_key` ปิด และไม่มีเฉลยวิธีทำใน response เลยไม่ว่าตั้งอะไร พร้อมเทสต์ที่ยืนยันด้วย `JSON.stringify` ของ response
- การตัดสินถูก/ผิดทุกครั้งต้องเกิดที่ server จาก `submission_answers.correct_answer` ที่ตรึงไว้ **ห้ามส่งเฉลยลงไปให้ browser เทียบเอง** แม้จะเทียบแล้วส่งผลกลับขึ้นมาก็ตาม — ผลที่ client คำนวณหรือรายงานขึ้นมาห้ามถูกเชื่อ และห้ามใช้เขียนคะแนน สถานะ หรือตัวนับใด ๆ
- การเปลี่ยนตัวเลขใน active online exam/exercise ทำผ่าน `rerollCheckedRandomAnswer`: retry ต้องตรวจแล้ว ส่วน refresh เปลี่ยนข้อที่ยังไม่ตรวจได้ด้วย ไม่ขึ้นกับการเปิด answer key; ตรวจสิทธิ์เขียน/เวลา/native session ทุกครั้ง ข้อยกคะแนนและ streak ที่นับแล้วไม่เปลี่ยน ก่อน update ใช้ expected old numeric map และ exact row count · response ส่งกลับเฉพาะค่าตัวเลขที่ต้องแสดง ห้ามส่ง answer key ชุดใหม่
- ตัวนับที่เป็นเงื่อนไขจบงาน (`submissions.current_streak` / `best_streak` / `streak_reached`) เขียนได้จาก verdict ที่ server ตัดสินเองเท่านั้น ถ้ารับจาก browser ได้ นักเรียนจบงานจาก console ได้
- `correct_answer` เข้า Client Component ได้เฉพาะ `previewMode` ของครู ซึ่งครูเป็นเจ้าของเฉลยนั้นอยู่แล้ว เส้นทางนักเรียน (`getExamTakingData` → `toSafeExamAnswer`) ห้ามใส่ฟิลด์นี้ และ `SafeExamAnswer` ต้องไม่มีฟิลด์นี้อยู่ใน type
- นักเรียนอ่าน answer snapshot/คำตอบที่ถูกได้หลังส่งเมื่อ `show_results` เป็น `immediate` หรือ `after_due` ที่พ้นกำหนดแล้วเท่านั้น; `score_only` ห้ามอ่านคำตอบรายข้อและ `never` ห้ามอ่านคะแนนด้วย
- เฉลยวิธีทำที่ครูแนบ (`solution_text`/`solution_image_urls`) เปิดตามกติกาของตัวเองเท่านั้น: `assignments.show_solutions` และนักเรียนคนนั้นทำงานต่อไม่ได้แล้ว โดยไม่มี attempt ที่ยังเขียนได้ค้างอยู่ (`lib/solution-release.ts`) · ทางเดียวคือ `getAttemptSolutions` ที่ตรวจเจ้าของ attempt แบบ exact แล้วตัดสินซ้ำจากฐานทุกครั้ง หน้าสรุปผลก่อนกดปุ่มรู้แค่ว่าข้อไหนมีเฉลย ไม่ได้รับเนื้อหา · ไฟล์เฉลยอยู่ใน bucket สาธารณะ `question-images` ใครได้ URL ไปแล้วเปิดได้เสมอ — การปกป้องคือไม่ส่ง URL ก่อนถึงเวลา
- การบันทึกคำตอบ รูปวิธีทำ ไฟล์ การส่ง และการแก้คะแนนผ่าน server boundary หลังตรวจ session + exact owner/teacher + attempt status + deadline; browser role ไม่มีสิทธิ์เขียน `submissions`/`submission_answers` โดยตรง
- `users_update_own` ใช้สำหรับโปรไฟล์เท่านั้น ต้องมี trigger ป้องกัน self-update ของ authority fields (`role`, `status`)
- Fullscreen, tab visibility, copy/paste และ screenshot deterrence เป็นเพียงสัญญาณ/แรงเสียดทาน ไม่ใช่ security boundary และห้ามใช้แทนการปกป้องเฉลยฝั่ง server
- ลายน้ำข้อสอบแสดงเฉพาะชื่อเจ้าของ attempt, UUID ส่วนสั้น และเวลาปัจจุบันเพื่อให้ภาพที่ส่งต่อระบุที่มาได้ง่ายขึ้น ไม่ใช่การป้องกัน screenshot; ห้ามใส่อีเมล เบอร์โทร ข้อมูลอ่อนไหว หรือ answer content ลงในลายน้ำ
- ข้อมูลคุมสอบต้องเก็บเท่าที่จำเป็น: ชนิด browser event, เวลา, presence/counter, foreign keys และ UUID สุ่มต่อแท็บสำหรับ heartbeat lease เท่านั้น ห้ามเพิ่ม IP, user-agent, device fingerprint, ภาพหน้าจอ กล้อง ไมโครโฟน เนื้อหาคำตอบ หรือ keystroke โดยไม่มีการออกแบบวัตถุประสงค์ consent retention และสิทธิ์ใหม่
- หลักฐานคุมสอบตามนโยบายใหม่คงอยู่กับ assignment และลบตาม parent cascade เดิม ไม่มีการล้างแยกหรือรายงานดาวน์โหลด ผู้ใช้อนุญาตให้ apply เฉพาะ migration `20261015132234` และตรวจ metadata แบบอ่านอย่างเดียวแล้ว jobs/RPC อายุ 90 วันถูกถอดออกจริง รายการ local-only อื่น 20 รายการยังไม่ถูก apply สิทธิ์อ่าน exact owner/manage co-teacher/super-admin และ session RLS คงเดิม อายุ session/lease/SEB check-in/Android approval ยังตรวจตามเดิม การคงหลักฐานไม่ยืดสิทธิ์เข้าสอบ
- เหตุการณ์เปิดหลายหน้าจอต้องคำนวณฝั่งฐานข้อมูลจาก lease ที่ยังสด ไม่เชื่อ counter/event จาก client และเป็นเพียงสัญญาณให้ครูพิจารณา การ reload ปกติต้องนำ id เดิมกลับมาใช้เพื่อลด false positive
- นักเรียนห้ามเขียนตาราง proctor โดยตรง; Server Action ต้องตรวจ exact submission owner + `in_progress` ก่อนใช้ service role และครูอ่านได้เฉพาะ assignment ที่ตนจัดการ ข้อมูลเหล่านี้เป็นหลักฐานประกอบการพิจารณา ไม่ใช่การตัดสินทุจริตอัตโนมัติ
- การรับทราบ event ต้องตรวจ exact event ผ่าน RLS แล้วใช้ service-role-only RPC ที่ตรวจ owner/co-teacher `admin/manage`/super admin ซ้ำ; authenticated role ไม่มี `UPDATE`, evidence fields มี immutable trigger และเงื่อนไข `acknowledged_at IS NULL` ทำให้ครูคนแรกชนะโดยไม่เขียนทับ audit เดิม การลบบัญชีผู้รับทราบล้างเฉพาะ actor id แต่คงเวลาไว้
- รายงานสัญญาณคุมสอบเป็น read-only view ไม่ใช่ฐานข้อมูลคำตัดสิน: server ต้องตรวจ exact assignment manager (owner, co-teacher `admin/manage` หรือ super admin) ก่อน แล้วอ่าน session/event ผ่าน RLS ซ้ำ ตัวกรอง student/attempt/kind/acknowledgement ต้องผ่าน allowlist และ pagination ฝั่ง server; การ resolve ชื่อด้วย admin client จำกัดเฉพาะ student IDs ของ retained sessions ที่ RLS คืนให้ exact assignment หลัง authorization และมี hard cap 2,000 attempts ห้ามค้น roster ทั้ง organization หรือโหลดประวัติ event ทั้งชุดไปกรองใน browser
- เวลาหลักของรายงานคือ `exam_proctor_events.created_at` จาก server เท่านั้น `occurred_at_client` มาจากนาฬิกาที่ client ควบคุมและอาจคลาดเคลื่อนหรือถูกแก้ ห้ามใช้แทน server time เพื่อเรียงเหตุการณ์ ตัดสินความน่าเชื่อถือ หรือกล่าวหานักเรียน
- Browser Notification ของห้องคุมสอบต้องขอสิทธิ์จาก user gesture ใช้ข้อความทั่วไปที่ไม่มีชื่อนักเรียน และเป็นเพียงส่วนเสริมขณะ dashboard เปิดอยู่; ชื่อแสดงได้เฉพาะ toast/feed ภายในหน้าที่ผ่าน authorization แล้ว ห้ามอ้างว่าเป็น background push หรือช่องทางแจ้งเหตุที่รับประกันการส่ง
- ข้อสอบ `seb_required` ต้องตรวจ **ทั้ง** Config Key และ Browser Exam Key request hash จาก SEB JavaScript API ที่ server; ผูก hash กับ exact URL challenge (ตัดเฉพาะ fragment), ผูก challenge/session กับ user + assignment, ตรวจ origin/path และเก็บ token ใน HttpOnly SameSite=Strict cookie ห้ามใช้ user-agent หรือการมี `window.SafeExamBrowser` อย่างเดียวเป็น security boundary
- ห้ามส่ง `SEB_SESSION_SECRET`, CK, BEK หรือ Admin Password ไป client/log และห้ามส่ง Quit Password กลับจาก server ไป client; รหัสออกที่ครูกรอกส่งเข้า server ได้เฉพาะ action สำหรับตั้งค่า ห้าม log/analytics/เก็บ plaintext หรือ confirmation ทุกกรณี ตาราง revision เก็บเฉพาะ SHA-256 lower-case Base16 ส่วน raw CK/BEK เก็บได้เฉพาะ immutable `assignment_seb_config_releases` ที่ไม่มี browser policy/grant และ service-role-only registration/read boundary เท่านั้น RPC และสถานะครูต้องไม่คืน CK/BEK/hash ส่วน submission เก็บได้เฉพาะ release revision กับเวลา/platform/version ที่ผ่านตรวจ และห้ามเก็บ raw request hash
- การหมุนรหัสออก SEB ต้องให้ครู active ที่เป็นเจ้าของ exact assignment เท่านั้น ตรวจ org membership + `online` + `exam` + `seb_required` + ไม่ปิด + ไม่มี `in_progress` ซ้ำใน service-role-only transaction, ล็อก assignment ก่อนตรวจ active attempt ใช้ compare-and-swap revision, คืน published assignment เป็น `draft` และล้าง preflight check-in ของไฟล์เก่าใน transaction เดียว; co-teacher/admin/super admin ไม่มีสิทธิ์หมุนแทนเจ้าของ และห้ามกล่าวว่า “พร้อมใช้” จนกว่า exact revision จะถูกผูกกับ immutable private `.seb` artifact และ CK/BEK แล้ว
- Assignment-specific release ต้องตรวจ canonical Storage path, object size และ SHA-256 ของ bytes ที่ดาวน์โหลดกลับมาก่อน service-only registration; release row แก้ไข/ลบตรงไม่ได้, bucket ไม่มี browser object policy และ student ได้เพียง signed URL อายุสั้นหลัง authorization `test_plaintext` เปิดได้เฉพาะ flag ทดสอบร่วมกับ exact `https://staging.korkru.com`; Production รับเฉพาะ `x509_encrypted`
- การเผยแพร่ข้อสอบ `seb_required` ต้องผ่านทั้ง application gate และ database trigger ที่ยืนยัน release ของ current password revision + exact assignment/org/owner; migration ต้องคืน published SEB row รุ่นเก่าที่ไม่มี assignment-specific release เป็น `draft` เพื่อไม่ให้ deployment เก่าหรือ direct update สร้างช่วง bypass
- SEB preflight เก็บได้เฉพาะผล `system_check` ที่ผ่านล่าสุดต่อ assignment/student: `verified_at`, `valid_until` ไม่เกิน 12 ชั่วโมง, platform และ version ห้ามเก็บ failure, raw CK/BEK/request hash, IP, user-agent หรือ device fingerprint; browser เขียนตรงไม่ได้ service-role-only RPC ต้องตรวจซ้ำว่า assignment เผยแพร่และบังคับ SEB พร้อมตรวจ exact roster membership ส่วน RLS เปิดอ่านแก่ครูที่จัดการ assignment และ super admin เท่านั้น ตารางนี้ไม่เข้า Postgres Changes publication เพราะ RLS ไม่ครอบคลุม `DELETE` payload หน้าครูจึง refresh ผ่าน RLS-protected SELECT แทน
- สถานะ “พร้อม” ใน roster หมายถึงเคยผ่านการตรวจภายในอายุ session ไม่ใช่ device identity ไม่พิสูจน์ว่ายังใช้เครื่องเดิม และไม่ใช่หลักฐานว่าปกติหรือทุจริต จึงห้ามใช้ check-in เพียงอย่างเดียวเป็น hard gate หรือคำตัดสิน นักเรียนที่เปลี่ยนเครื่อง/รุ่น/ไฟล์ตั้งค่าต้องตรวจใหม่
- SEB session ต้องถูกตรวจซ้ำทุก mutation/read ของ attempt ไม่ใช่แค่หน้าเข้า และต้องตรงทั้ง opaque release ID + `submissions.seb_config_revision`; transaction สร้าง SEB attempt ต้องล็อก assignment แล้ว recheck current registered revision ก่อน insert access mode ถูกตรึงเป็น `seb` หรือ `android_monitored` ตั้งแต่เริ่มและห้าม fallback/สลับกลาง attempt ส่วน server-initiated forced finalize หลังหมดเวลาต้องทำได้แม้ client session หมดอายุ
- รูปวิธีทำใน `work-images` และไฟล์คำตอบใน `submission-files` ห้ามให้ browser session เขียน/ลบด้วย owner-folder policy โดยตรง: browser ต้องรับ signed upload target จาก Server Action ที่ตรวจ exact user + submission + answer, `in_progress`, timer/deadline และ SEB/Android access session; path ใหม่ต้องผูก student/submission/answer/upload และ server ต้องตรวจ origin/path, MIME, size กับ byte signature ของ object หลัง upload ก่อนบันทึก reference รวมทั้งตรวจ object ซ้ำตอน student submit Path legacy ยอมรับได้เฉพาะ reference เดิมระหว่าง rollout ห้ามใช้สร้าง attachment ใหม่
- Android monitored mode ไม่ใช่ SEB/kiosk และห้ามใช้ user-agent เป็น security boundary นักเรียนต้องรอโดยยังไม่สร้าง attempt แล้วให้ครูที่มีสิทธิ์ตรวจเครื่องจริงและอนุมัติ exact student + assignment ก่อนออก signed HttpOnly session; ทุก attempt read/write ต้องตรวจ session นี้ซ้ำเช่นเดียวกับ SEB
- Android approval เก็บได้เฉพาะ assignment/student/status/request/review/expiry และผู้อนุมัติ ห้ามเก็บ user-agent, IP, device ID/fingerprint หรือ screen content; ป้ายใน audit ต้องเป็น `android_monitored` และห้ามแสดงเป็น “SEB ยืนยันแล้ว”

## Uploads และ exports

- ตรวจ MIME type, ขนาด และจำนวนไฟล์ฝั่ง server/storage policy
- **URL ของไฟล์ที่ client ส่งกลับมาให้บันทึกต้องตรวจถึง “host” ไม่ใช่แค่ path** — `https://evil.example/storage/v1/object/public/classroom-post-files/x.png` มี path ตรงทุกตัวอักษร ถ้าตรวจแค่ path ไฟล์นอกโปรเจกต์จะถูกฝังเป็น `<img src>`/ปุ่มดาวน์โหลดต่อหน้าทั้งห้องได้ · ไฟล์แนบประกาศตรวจด้วย `isPostFileUrl()` เทียบกับ `NEXT_PUBLIC_SUPABASE_URL` (มี unit test ครอบ) และชื่อไฟล์ที่ client ส่งมาถูกตัดอักขระคั่น path และจำกัดความยาวก่อนเก็บ
- UI-036 ถอดการอัปโหลดและการแสดงรูปหน้าปกห้องเรียนออกแล้ว · สำหรับ metadata เก่าที่ยังคง round-trip ได้ action สร้าง/ทำสำเนา/แก้ไขยังตรวจ HTTPS origin ตรงกับ `NEXT_PUBLIC_SUPABASE_URL`, bucket, owner folder, filename และห้าม query/hash/credential ก่อนบันทึก; orphan sweep ยังรวม reference จาก `classrooms.description` แบบ fail closed และ `releaseQuestionFiles` ไม่ลบ prefix `classroom-cover_`
- ใช้ชื่อไฟล์และ path ที่ไม่เปิดเผยข้อมูลเกินจำเป็น
- จำกัดการอ่านไฟล์ตาม owner/classroom/assignment
- ระวัง orphan files เมื่อแก้หรือลบ resource
- Export ต้องตรวจผู้ขอและข้อมูลทุกแถวก่อนสร้างไฟล์
- PDF/CSV/รูปที่ส่งออกอาจมีข้อมูลส่วนบุคคล ต้องไม่ใช้ public URL ถ้าไม่จำเป็น
- การตอบไฟล์รายงานใช้ `Cache-Control: private, no-store`, `Content-Disposition: attachment` และ `X-Content-Type-Options: nosniff`; ห้ามบันทึกไฟล์ลง public storage หรือ application log และห้ามเรียกว่า tamper-proof/certified evidence เพราะ CSV เป็นสำเนาข้อมูลแบบมีขอบเขตที่ผู้รับแก้ไขต่อได้
- ผลวิจัยระดับบุคคลและแท็บข้อมูลที่ใช้ต้องตรวจสิทธิ์จัดการโครงการก่อน query; pagination/filtering ทำฝั่ง server และไม่ส่ง roster ทั้งโครงการเข้า Client Component เมื่อผู้ใช้ดูเพียงหน้าปัจจุบัน
- Excel ข้อมูลวิจัยรายบุคคลรับเฉพาะ `POST application/json` แบบ allowlist และ stream ไม่เกิน 1 KiB ตรวจ manage permission ก่อนอ่านทุกแถว จำกัด 2,000 คน และตอบด้วย `private, no-store`, attachment, `nosniff` และ same-origin resource policy; สร้างในหน่วยความจำโดยไม่ใช้ public Storage แบบไม่ระบุตัวตนห้าม query/ใส่ชื่อ รหัสนักเรียน UUID หรือเลขที่ในห้องและต้องสุ่มลำดับใหม่ ส่วนแบบมีตัวตนเปิดเฉพาะเมื่อครูเลือกเอง ทั้งสองแบบเตือนว่าไฟล์ที่ดาวน์โหลดต้องจำกัดผู้เข้าถึงและลบเมื่อหมดความจำเป็น
- audit การส่งออกวิจัยเก็บเฉพาะ project/org, actor, โหมด, รูปแบบ, จำนวนแถว, เวลา และเวลาแก้คะแนนล่าสุด ไม่มีชื่อ รหัส คะแนน ชื่อไฟล์ หรือ binary; authenticated role อ่านได้ตาม manage RLS แต่เขียนไม่ได้ การ insert ทำหลังสร้าง workbook สำเร็จผ่าน service-role-only RPC ที่ตรวจสิทธิ์ actor กับ exact project ซ้ำ และหากบันทึก audit ล้มเหลว route ต้องไม่ส่งไฟล์

### พื้นที่เขียนและวิธีทำที่แนบ

- ข้อความคณิตศาสตร์จากนักเรียนต้องผ่าน bounded allowlist parser เท่านั้น: จำกัดความยาว/token/depth/operation, ปฏิเสธ identifier และ syntax ที่ไม่รู้จัก, ไม่ใช้ `eval` หรือ `Function`, และไม่ส่ง mathjs เข้า initial client path โหมด DEG/RAD ที่ใช้ตรวจต้องมาจาก metadata ที่ validate แล้วและบันทึกพร้อมคำตอบ
- เครื่องคิดเลขแสดงจาก assignment flag ที่ server อ่านให้ แต่ไม่ถือเป็น security boundary ต่อเครื่องคิดเลขภายนอก; implementation โหลดหลัง user gesture และ history อยู่ใน memory ของหน้าเท่านั้น ห้ามเพิ่ม API, database row หรือ telemetry ที่ส่งนิพจน์/ประวัติการคำนวณขึ้น server
- กระดาษทดที่ยังไม่แนบอยู่ใน IndexedDB ของอุปกรณ์เท่านั้นแล้ว ไม่ส่ง scene ต่อ stroke และไม่ถือเป็น education record บน server; teacher preview ไม่เขียน IndexedDB เฟส drawing-board 3 เก็บ revision/fingerprint, attached artifact identity และ one-step recovery เป็น optional local metadata ใน record เดิม ข้อมูลนี้ต้อง validate ก่อนใช้และไม่เป็นหลักฐานแทน database artifact หรือ authorization ฝั่ง server
- Local key แยก authenticated user/submission/answer/part, scene ใช้ allowlisted format version และจำกัด 2 MiB/10,000 elements; ล้างเมื่อส่งสำเร็จแบบ best effort และ purge รายการหมดอายุ 7 วันเมื่อเปิด editor ครั้งถัดไป local data เป็น recovery convenience ไม่ใช่ trusted submission state ก่อน submit client อ่าน metadata ใหม่เพื่อเตือน stale/unverified แต่ server requirement เดิมยังเป็นผู้ตัดสินสุดท้าย
- guardrail ต่อไปนี้ทำแล้วบน branch `codex/drawing-board-phase-1` แต่ยังไม่ merge/deploy จึงยังไม่ใช่ production contract จนผ่าน authenticated Staging และ rollout gate
- Preview และ scene ที่แนบใหม่อยู่ใน private bucket `math-work-artifacts`; browser ส่ง scene แบบจำกัด 2 MiB ให้ Server Action หลังตรวจ exact submission/assignment authority จากนั้น server ใช้ strict role validator แล้วเขียน `scene.json` เอง ก่อนคืนเฉพาะ path-bound signed upload token ของ preview กับ signed receipt อายุ 2 ชั่วโมง ส่วน signed read URL ยังมีอายุ 5 นาทีและออกหลังตรวจสิทธิ์ ไม่มี client policy สำหรับ list/read/write/delete ทั้ง bucket
- Browser ส่ง preview MIME/size, preview format และ upload id มาได้แต่เชื่อไม่ได้ Receipt ฝั่งนักเรียนต้องผูก actor + submission answer + part + source type + include-scene + upload id + preview format; ฝั่งครูผูก actor + assignment + question + slot + upload id + preview format และทั้งสองฝั่งมี expiry Save action ตรวจ receipt, owner, tenant, exact in-progress answer, เวลา, SEB/Android access gate, preview byte signature และ server-stored scene ซ้ำก่อนบันทึก reference การ cleanup หลัง reject ต้องเช็กทั้งสอง reference table ก่อนเสมอเพื่อไม่ลบไฟล์ที่ active แม้ caller reuse upload id
- Scene validator ใช้ exact-key allowlist กับ envelope v1, stable app state, element ราย type, binding/roundness/crop/fixed segment, file และ claim metadata พร้อม finite numeric bounds, canonical base64, MIME/byte signature, 2 MiB และ 10,000 elements แบบ fail closed ก่อน raw scene เข้า editor และก่อน persist นักเรียนห้ามมี image/file; live mode ผ่อนเฉพาะ in-progress line/arrow/freedraw ที่ id ตรง active `newElement`/`editingLinearElement` ตัวเดียวและไม่ persist ฉากชั่วคราว ส่วน full validation รันซ้ำก่อนเขียนทุกครั้ง Deleted tombstone ยังตรวจ exact shape แต่ stale eraser relation ที่จบกับ tombstone เป็น inert history ขณะที่ relation ระหว่าง live elements ต้อง reciprocal Teacher file projection คงไฟล์ที่ current/deleted image อ้างถึงและตัด orphan ก่อน persist ฉาก invalid/unsupported จาก persistence ต้องแสดง safe read-only state โดยห้าม blank scene เขียนทับ ส่วน invalid live mutation ต้อง remount กลับ immutable last-good scene ของ editor revision เดียวกัน
- Drawing-board เฟส 7 ให้ครูเก็บ Library ได้เฉพาะ vector/text ใน memory ของ teaching route: sanitizer ตัด group/frame/binding/link/custom data/lock/files/app state แล้วใช้ scene validator ฝั่ง student ทั้งก่อนเก็บและก่อนวาง พร้อมจำกัด 12 items/100 elements/256 KiB และออก identity ใหม่ ห้ามเขียน localStorage/IndexedDB/server/Storage หรือรับ Public Library/import; route unmount ต้องล้างทั้งหมด Generic paste/drop/file/serialized scene, copy/cut นอก text editor และ context menu fail closed รวมใน read-only/presentation lock ก่อนข้อมูลถึง Excalidraw
- Student attach และ teacher save clone full-validated scene ออกจาก object ที่ Excalidraw mutate in place ก่อนเริ่ม async preview/upload แล้วใช้ snapshot เดียวกันสร้าง preview และ `scene.json` เพื่อไม่ให้ภาพกับต้นฉบับคนละ revision
- รูปโจทย์ของครูรับเฉพาะ URL exact ในโจทย์ของ assignment และ bucket origin ที่กำหนด Server Action ดาวน์โหลดเอง จำกัด input/pixel/output, rasterize เป็น static WebP, ตัด metadata แล้วออก HMAC claim อายุ 24 ชั่วโมงที่ผูก actor/assignment/question/source/file/MIME/bytes; legacy SVG ปฏิเสธ DOCTYPE/ENTITY declaration และ reference ที่ unknown/malformed, decode เฉพาะ predefined/numeric XML references ก่อน scan แล้วปฏิเสธ script/event/`foreignObject`, `<style>`, inline `style=`, `xml:base`, CSS escape/backslash, stylesheet/import และ external `href`/`url()` ก่อน rasterize เข้า browser หากไม่ผ่านให้ read-only โดยคงต้นฉบับเดิม
- board เก่าที่ผสม SVG กับ raster ต้อง full-validate ฉากหลังแปลงก่อน แล้ว re-claim retained raster ทุกไฟล์จาก exact decoded bytes และ full-validate ด้วยลายเซ็นจริงอีกครั้ง ห้ามสร้าง partial legacy trust จากฉากที่ยัง invalid
- Server Action body limit เป็น 4 MiB เพื่อรับ scene ที่มี envelope overhead แต่ policy ยังคงจำกัด scene จริงที่ 2 MiB; ห้ามขยาย policy limit ตาม transport limit
- หลังส่งต้องปฏิเสธการแก้ scene, preview และ metadata แม้ client ยังถือ URL หรือ local copy อยู่
- **scene ของกระดานเขียนเฉลยอยู่ใน PNG สาธารณะ** (`question-images` เป็น public bucket) ใครมี URL ก็อ่านเส้นบนกระดานได้เท่ากับเห็นรูป ซึ่งเป็นระดับเดียวกับรูปเฉลย และไม่มีข้อมูลนักเรียน ตอนเปิดกลับมาแก้ scene ถูกคลาย (จำกัด 2 MiB หลังคลาย กัน zip bomb) แล้วผ่าน `validateSolutionBoardScene` ก่อนเข้า Excalidraw — policy เดียวกับกระดานสอนที่เก็บไว้แต่ **ไม่รับรูปใด ๆ** เพราะกระดานนี้ไม่มีทางนำรูปเข้า ไฟล์ที่แนบในเฉลยรับเฉพาะ JPG/PNG/WebP/GIF/PDF (SVG ถูกปฏิเสธ เพราะ bucket เป็น public และ SVG พกสคริปต์ได้)
- **รูปในข้อความเฉลย** — editor รับ `<img>` ตามกฎเดียวกับ sanitizer (`isSolutionTextImageSrc` เรียก `isRichTextImageSrc`): src จาก `question-images` ของโปรเจกต์นี้ที่ host ตรงกับ `NEXT_PUBLIC_SUPABASE_URL` หรือ `blob:` ของห้องทดลองเฉพาะ development build ไม่รับ `data:` และตัดรูปภายนอกที่ติดมากับการวาง ด่านนี้เป็นแค่ความสะดวกของ editor — ตัวที่กันจริงคือ sanitizer ตอนแสดงผล/บันทึก ดูหัวข้อ "HTML ที่ครูเขียน (rich text)" ข้างล่าง (25 กันยายน 2026)
- `student_work_artifacts` แก้/ลบได้เฉพาะเจ้าของที่ submission ยัง `in_progress`; `teaching_boards` อ่านได้เฉพาะครูที่มีสิทธิ์ใน assignment และแก้/ลบได้เฉพาะผู้สร้าง unique slot กับ CHECK 1–5 เป็นเพดานของฐานที่กัน concurrent request ส่วนเพดาน 3 ช่องต่อข้อของแอป (25 กันยายน 2026) Server Action เป็นผู้บังคับ — ผู้สร้างที่ยิง API ตรงผ่าน RLS ยังสร้างแถวช่อง 4–5 ในขอบเขตงานของตัวเองได้ แต่ไม่มีไฟล์รองรับและไม่ข้ามผู้ใช้/tenant; ถ้าต้องการให้ฐานบังคับ 3 ด้วยให้ทำ migration แยก
- การ finalize งานที่บังคับแนบวิธีทำตรวจ exact answer/part ฝั่ง server และยอมรับเฉพาะ artifact reference หรือ `work_images` รุ่นเก่าที่มีอยู่จริงใน answer; หน้าผลลัพธ์ sign เฉพาะ preview path ที่ได้จากคำตอบซึ่งผ่าน result-visibility/RLS แล้วและไม่เปิด scene
- การแทนที่หรือลบต้องเปลี่ยน database reference ก่อนแล้วจึงลบไฟล์แบบ best effort; scheduled orphan cleanup เว้น grace period 7 วัน ลบเฉพาะ path ที่ตรงกับ builder ใต้ `students/`/`teachers/` หลังตรวจ exact path จากทั้งสอง reference tables ซ้ำ และหยุดก่อนเริ่มลบเมื่อ listing/reference scan ไม่ครบหรือเกินเพดาน
- Cleanup route ใช้ Bearer `CRON_SECRET` อย่างน้อย 32 ตัวอักษรและเปรียบเทียบแบบ constant-time ก่อนสร้าง admin client; response/log มีเฉพาะ aggregate/error code ไม่ส่ง path, URL หรือข้อมูลนักเรียน และ deployment ที่ไม่มี secret จะ fail closed ด้วย 503
- drawing-board เฟส 8 ตรวจ migration parity กับ Supabase Staging ก่อนเปลี่ยน schema แล้วสร้าง `20260921185046_allow_png_math_work_preview_paths.sql` ผ่าน CLI Migration เพิ่ม `.png` เฉพาะ exact preview suffix ใน CHECK ของ `student_work_artifacts`/`teaching_boards` และ student scope trigger โดยไม่เปลี่ยน RLS/grant/ownership/path namespace; PGlite regression ยืนยันว่า GIF, traversal และ cross-submission path ยังถูกปฏิเสธ จากนั้น commit ก่อน apply กับ Staging และตรวจ parity/lint/dry-run ซ้ำ ก่อน apply Production ก็ตรวจ ledger parity, dry-run ว่ามี migration นี้รายการเดียว และ linked lint ระดับ error ผ่านแล้ว; apply Production สำเร็จเมื่อ 22 กันยายน 2026 แต่ authenticated Safari/cross-account UAT ยังเป็น release gate นอกจากนี้ `CRON_SECRET` ต้องมีใน deployment เป้าหมายก่อนอ้างว่า scheduled cleanup ทำงานจริง
- ห้าม log scene, คำตอบเต็ม, signed URL หรือ path ที่เปิดเผยข้อมูลนักเรียน รายละเอียด threat model และ lifecycle อยู่ใน `docs/STUDENT_MATH_TOOLS.md`

## HTML ที่ครูเขียน (rich text)

- โจทย์ เฉลย ตัวเลือก และข้อความใน `extra_data` เก็บเป็น HTML แล้วแสดงด้วย `dangerouslySetInnerHTML` ต่อหน้านักเรียนทุกคน (หน้าทำข้อสอบ หน้าผล หน้าตรวจ โหมดสอน หน้าตัวอย่าง เอกสาร IOC) **Tiptap editor ไม่ใช่ security boundary** — ใครก็ตามที่ถือ session ครูส่ง HTML อะไรก็ได้ตรงเข้า Server Action หรือเขียนแถว `questions` เองผ่าน RLS ได้ และ `<img src=x onerror=…>` ที่เก็บไว้จะรันในเบราว์เซอร์ของทุกคนที่เปิดโจทย์นั้น
- **ทุกจุดที่เอา HTML ของครูลงหน้าเว็บต้องผ่าน `RichText` หรือ `renderRichTextHtml()` (`lib/rich-text-html.ts` → allow-list ใน `lib/rich-text-sanitize.ts`)** ซึ่ง sanitize ก่อนแล้วจึงแปลง TeX เป็น KaTeX (25 กันยายน 2026 ย้ายทุกจุดที่เคยเรียก `renderMathInHtml` ตรง ๆ แล้ว: `exam-client`, `question-preview-content`, หน้า submissions, หน้า results และ `ioc-print`) ห้ามส่งผลของ `renderMathInHtml` ที่ยังไม่ sanitize เข้า DOM
- เป็น allow-list ที่เขียนเอง (ไม่ใช้ DOMPurify/jsdom เพราะต้องรันทั้ง server และ browser และหน้าข้อสอบมีงบ JS) เก็บเฉพาะสิ่งที่ editor เขียน: `p br span strong b em i u s sup sub ul ol li` แบบไม่มี attribute (ยกเว้น `ol` เก็บ `start` เป็นเลขจำนวนเต็ม และ `type` เฉพาะ `1 a A i I`), `code` ไม่มี attribute, `a` ที่ `href` เป็น `https:`/`http:`/`mailto:` แบบ absolute และไม่มี user:password โดยเขียน `target="_blank" rel="noopener noreferrer nofollow"` ทับเสมอ, และ `img` ที่มีเฉพาะ `src` `alt` `width` `height` — `a` กับ `code` อยู่ในรายการเพราะ StarterKit v3 เปิด Link (autolink) และ Code ไว้ editor จึงสร้างได้จริงแม้ไม่มีปุ่ม
- `img src` ต้องเป็น `https:` ที่ origin ตรงกับ `NEXT_PUBLIC_SUPABASE_URL` และ path ขึ้นต้นด้วย `/storage/v1/object/public/question-images/` ไม่มี query/hash/credential และ key ไม่มี segment ว่าง `.` `..` หรือ `%2F`/`%5C` (ตรวจ host ไม่ใช่แค่ path ตามข้อ Uploads) · `blob:` รับเฉพาะ development build เพราะเป็นไฟล์ในหน่วยความจำของแท็บใน QA lab บนเครื่อง — lab บน Staging ซึ่งเป็น production build จึงไม่แสดงรูป `blob:` · `width`/`height` ต้องเป็นตัวเลขล้วน 1–5 หลัก · รูปที่ `src` ไม่ผ่านถูกตัดทั้ง element ส่วนลิงก์ที่ `href` ไม่ผ่านเหลือแต่ข้อความ · ค่า URL ถูก decode character reference ก่อนตรวจ (`&#106;avascript:` คือ `javascript:`) แล้วเขียนกลับเป็น URL ที่ตรวจแล้ว ไม่ใช่ตัวสะกดเดิม
- attribute อื่นทั้งหมดถูกตัด (`on*`, `style`, `class`, `id`, `data-*`, `srcset` …) element อื่นเหลือแต่ข้อความ ยกเว้น `script style template iframe noscript noembed noframes textarea title xmp` (และทุกอย่างหลัง `plaintext`) ที่ตัดทั้งเนื้อหา · block ที่ editor ไม่สร้าง (`div`, ตาราง, `h1`–`h6` …) เหลือข้อความขึ้นบรรทัดใหม่ และเซลล์ตารางคั่นด้วยช่องว่าง — HTML จาก Moodle import ที่มีตารางจึงแสดงเป็นข้อความทีละแถว ไม่ใช่ตาราง แต่ต้นฉบับในฐานข้อมูลไม่ถูกแก้
- sanitizer ไม่จำเป็นต้อง parse เหมือน browser ทุกกรณี เพราะไม่ส่งต่อ markup ตามที่อ่านมาเลย: เขียนกลับเฉพาะที่เก็บไว้ ครอบ attribute ด้วย `"` และ escape `<` `>` กับ `&` ที่ไม่ได้เริ่ม character reference ทุกตัว ส่วนที่อ่านผิดจึงออกมาเป็นข้อความหรือหายไป ไม่กลายเป็น markup ที่ browser อ่านต่างออกไป
- KaTeX ทำงาน **หลัง** sanitize (class/style/MathML/SVG ของ KaTeX เป็น output ที่เชื่อได้) ด้วย `trust` ค่าเริ่มต้น `false` จึงไม่มี `\href` `\url` `\includegraphics` `\htmlClass` และ `renderMathInHtml` แปลงเฉพาะข้อความระหว่าง tag — TeX ใน `alt` จะไม่ถูกแทรก markup ของ KaTeX กลาง tag
- `lib/text-blank.ts` (แยกข้อความโจทย์เติมคำ/`[คำตอบ]` บนหน้าข้อสอบ) parse HTML ใน document จาก `document.implementation.createHTMLDocument()` ไม่ใช่ `document.createElement` ของหน้า — element ใน document ของหน้าโหลดรูปและยิง `onerror` ทันทีที่ parse แม้ยังไม่ต่อเข้า DOM และก่อนที่ `RichText` จะได้ sanitize ชิ้นที่แยกออกมา
- sanitize ตอนบันทึก (`sanitizeRichTextForStorage`) ทำเฉพาะช่องที่มาจาก rich-text editor: `question_text`/`solution_text` ใน `createQuestion`/`updateQuestion` และ `solution_text` ใน `saveQuestionGroup` และไม่เก็บ `blob:` ไม่ว่า build ไหน **เป็นการรักษาความสะอาดข้อมูล ไม่ใช่ boundary** เพราะ RLS ให้ครูเขียนแถวเองได้โดยไม่ผ่าน Server Action · ตัวเลือก (`mcq_options[].text`), `extra_data`, บริบท/ข้อย่อยของโจทย์ชุด และการนำเข้าไฟล์ (`importQuestionsFromFile`) ไม่ sanitize ตอนบันทึก เพราะหลายช่องเป็น plain text ที่ `x<y` คือข้อความจริง และไฟล์นำเข้าควรเก็บต้นฉบับไว้ — ที่ป้องกันจริงคือ sanitize ตอน render ทุกจุด
- เทสต์อยู่ที่ `lib/rich-text-sanitize.test.ts` (script, `on*`, ลิงก์ `javascript:`/`data:` แบบ encode, markup ซ้อน/เพี้ยน, รูปนอก host/bucket, KaTeX หลัง sanitize, ผลลัพธ์ sanitize ซ้ำแล้วเท่าเดิม) และ `lib/math/latex.test.ts` (ไม่แตะ TeX ใน tag) ทำ sanitizer ให้หลวม 12 แบบ (ปล่อย host อื่น ไม่ตัด script ไม่ decode reference ปล่อย `on*` ฯลฯ) เทสต์แดงทุกแบบ · `text-blank.ts` ไม่มีเทสต์อัตโนมัติเพราะ vitest รันใน node ไม่มี DOM

## Logging และ errors

- ห้าม log access code, token, service key, คำตอบเต็ม, health/family notes หรือข้อมูลผู้ปกครอง
- ส่งข้อความทั่วไปให้ผู้ใช้และเก็บรายละเอียดเฉพาะ server log ที่ควบคุมสิทธิ์
- อย่าแสดง SQL, table policy หรือ stack trace แก่ผู้ใช้

## Billing

- ห้ามเชื่อ client ว่าผู้ใช้ชำระแล้ว
- entitlement ต้องตรวจจาก server-side source of truth
- webhook ต้องตรวจ signature และทำงานแบบ idempotent
- ห้ามเก็บข้อมูลบัตรเอง
- pricing UI ปัจจุบันเป็นต้นแบบ ไม่ใช่ระบบชำระเงินจริง

## Compliance claims

ห้ามประกาศว่า KorKru “เป็นไปตาม PDPA”, “เข้ารหัสครบ”, “ได้ ISO 27001”, “มี SSO/SLA” หรือข้ออ้างคล้ายกันเพียงเพราะผู้ให้บริการ infrastructure มีคุณสมบัติบางอย่าง ต้องผ่านการตรวจระบบ กระบวนการ สัญญา และกฎหมายก่อน

## ก่อนเปิดให้ผู้ใช้จริง

- สรุป authority matrix และ data-retention policy
- ทำ threat model สำหรับ auth, tenant isolation, exam integrity, uploads และ exports
- ทดสอบ RLS แบบ automated ด้วยหลายบทบาท
- ตรวจ storage policies และ public URLs
- เพิ่ม audit ที่เชื่อถือได้สำหรับ privileged actions
- ทำ backup/restore และ incident-response procedure
- ตรวจ privacy notice, consent และการจัดการข้อมูลผู้เยาว์กับผู้เชี่ยวชาญที่เกี่ยวข้อง

เอกสารนี้เป็น engineering guardrail ไม่ใช่คำรับรองทางกฎหมาย

- รูปโปรไฟล์ถาวร (14 ต.ค. 2026): server verified Auth + users.status active ก่อน admin upload/update, decoded PNG square 512px ไม่เกิน 2 MiB, re-encode strip metadata, owner UUID/immutable file UUID; compare-and-set ป้องกัน concurrent overwrite/cleanup และลบเฉพาะ avatar URL ที่เป็น bucket/namespace เจ้าของตรงตัว. Public bucket ใช้เพื่อรูปแสดงตัวตนเท่านั้น restrictive policy ปิด browser metadata/read/write แม้มี broad permissive policy; ไม่เก็บสุขภาพ/ผู้ปกครอง/เอกสารใน bucket นี้. ดู `STUDENT_PROFILE_AVATARS.md`.

- โฮมรูมฝั่งนักเรียน (14 ต.ค. 2026): หลัง verified Auth และ roster membership guard อ่านชื่อเต็มกับ `student_profiles.class_number` ของ UUID เพื่อนในห้องนั้นเท่านั้น เพื่อแสดงรายชื่อเรียงเลขที่ตามคำขอเจ้าของ ไม่เปิด direct profile RLS หรือส่ง profile record; ชื่อ/เลขที่เป็นข้อยกเว้นที่เห็นใน roster ร่วม ส่วน school/สุขภาพ/ครอบครัว/ผู้ปกครอง/คะแนนยังไม่ส่งให้เพื่อน.

## Solution attribution overlay — 14 October 2026

- Required solution identity is read with the service client only after verified Auth plus exact ownership/management checks. The DTO excludes email, guardians, health/contact fields, peers and answers. No browser-provided owner is accepted. Existing release/visibility checks remain authoritative; failed identity lookup does not return unwatermarked solution bodies.
- The name/code/class/number/date overlay is mandatory for released exam/exercise keys even if optional taking watermark is disabled. Authorized teacher result review has an explicit teacher-view label. No new access or RLS/storage changes are made.
- This is a visible attribution aid; screenshots can be cropped/edited and browser rendering altered. It is not proof of who shared content. Existing external PDF links have no physical watermark; the inline reader is pending the owner's decision. No production data, migration or hosted deployment changed in this task.


- Student classroom calendars (14 October 2026): subject events derive only from the membership/group-authorized work list. The student homeroom calendar loader runs after verified Auth/exact homeroom membership, restricts memberships/submissions to that student and published assignment links to enrolled room IDs, then applies the dashboard group-reach projection. It returns no peer attempts or hidden scores. No RLS, schema, storage or Production change is made; Staging verification used zero-row reads only.
