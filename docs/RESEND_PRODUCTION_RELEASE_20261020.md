# Resend quota Production release — 20 ตุลาคม 2026

**Release เสร็จแล้ว:** โค้ด 80/90/95 ทั้งรายวันและรายเดือนขึ้น Production Ready, เปิด flag และย้าย webhook แล้ว Signed provider replay ผ่าน HTTP200/`below_threshold` โดยไม่ส่งอีเมลใหม่ Primary localhost:3000 sync และตรวจ runtime แล้ว ไม่มี release gate ที่ค้างสำหรับ quota monitor นี้

## ขอบเขตและสถานะ

เจ้าของอนุญาตตั้งแจ้งเตือนโควตา Production แบบทีละขั้นตอน Candidate นี้อยู่ branch `codex/resend-quota-production-20261020` ใน checkout `korkru-quota-production-20261020` เริ่มจาก `origin/master` **7065d32ee841f904312aa12d4eced11938bab199** และนำเฉพาะ quota implementation **0352be1bc6bfbf2d88b5780b025dfe88294dbb7e** มาปรับเอกสาร ต่อมารวม current Production master **d3b864ff601ce5a14f42e30e19d233b719de3d0b** ซึ่งมี assigned-work popup ที่ปล่อยแล้ว โดยรักษาโค้ด master ทั้งชุด ไม่ merge Stage ทั้ง branch

Production base ยังเป็น daily-only 80/90/97 รุ่นใหม่ตรวจ **80/90/95 ทั้งรายวันและรายเดือน** มี durable claim/receipt แยก scope/period/window และให้ provider idempotency key ใช้ UUID คงที่ ป้องกันส่งซ้ำหรือส่งระดับต่ำกว่าหลังระดับสูงเริ่มแล้ว Request ที่ไม่ผ่าน Svix ไม่แตะ provider หรือ admin client Missing ledger/config ต้องหยุดส่ง

ไฟล์แอป/SQL/test ทั้งแปด path ตรงกับ implementation ที่ผ่าน Staging byte-for-byte; `package.json` และ lockfile ไม่เปลี่ยน Current master มี Svix2.8.0/Supabase/Zod/PGlite ที่ต้องใช้แล้ว ไม่รวม recovery/UI/auth feature เพิ่ม, SEB, grading, assignment reminders หรือ migration อื่น

## สิ่งที่ตรวจใน candidate

- รัน Node.js **24.19.0** และ dependency tree ที่มีอยู่ซึ่งตรงกับ package/lockfile โดยไม่ติดตั้งหรือเปลี่ยน dependency
- Quota Vitest **3 ไฟล์ / 132 เคสผ่าน**: runtime90, SQL จริงใน PGlite31, store/RPC11 ทุกกรณีเป็น local mocks/throwaway database ไม่ติดต่อ Supabase หรือ Resend
- TypeScript `tsc --noEmit` ผ่าน
- Full Vitest **324 ไฟล์ / 4,563 เคสผ่าน** โดยใช้ 2 workers และ Node24; ไม่มี failed หรือ skipped cases
- Production Webpack build ผ่านพร้อม TypeScript ใช้ placeholder keys/loopback Supabase URL และ isolated `.next-quota-production-build` ไม่ใช้ Production credentials การโหลด Google Fonts ต้องอนุญาต network สำหรับ build; build-generated tsconfig include ถูกคืนก่อน commit
- Compiled production Next HTTP route ผ่าน **9 กรณี**: unsigned rejection ก่อนเรียก provider/DB, ทั้ง6threshold พร้อม dedup, partial retry ส่งเฉพาะช่วงที่ขาด และ daily95 self-event ข้ามไป monthly80 โดยไม่วนซ้ำ ใช้ provider/ledger จำลองทั้งหมด ไม่ติดต่อบริการภายนอก ตัว fixture รอบแรกไม่ตรง URL จำลองที่ Next ฝังตอน build จึงแก้เฉพาะ fixture และรันซ้ำผ่าน ไม่มี application change และปิด server3072 หลังตรวจ
- Independent review ยืนยัน application/SQL byte-equivalence และไม่พบ code/SQL blocker; `git diff --check` ผ่าน
- ไม่มี UI behavior/copy เปลี่ยน จึงไม่ต้องเพิ่ม UI tests หรือ token-lint coverage สำหรับการย้าย scope นี้

หลักฐาน Staging ก่อนหน้า: implementation เดียวกันผ่าน signed Next HTTP fixture9กรณี, signed provider webhook→Usage APIจริง และอีเมล TEST1ฉบับDeliveredพร้อมเจ้าของยืนยันInbox วันที่19ตุลาคม รายละเอียด `RESEND_SETUP.md` ไม่ถือว่าบังคับให้ยอดจริงแตะทั้ง6thresholdและไม่ใช่ผล Production

## ตรวจ integration กับ Production master ล่าสุด

รวม `d3b864f` บน quota candidate โดยรักษา assigned-work publisher/inbox และเอกสารที่ปล่อยแล้วทั้งหมด Dependency/package/lock/proxy/Next config ไม่เปลี่ยนจาก master แก้ add/add conflict เฉพาะหัวข้อ `DATA_MODEL.md` โดยเก็บทั้ง quota ledger และ assigned-work projection

Quota runtime/store/route, tests และ SQL ทั้งแปด non-document paths ยังคงตรง `0352be1` byte-for-byte Diff เทียบ master `d3b864f` มีเฉพาะ 14 paths โควตา Programmatic comparison ยืนยันทุก application path และ unrelated document ที่ master เพิ่มจากฐานเดิมคงเดิม byte-for-byte รวมทั้ง package/lock/proxy/Next config

ผล integrated candidate ผ่าน **full Vitest 326 ไฟล์ / 4,663 เคส**, TypeScript, token lint ไม่มี regression, **Node24.19 production Webpack build** และ compiled Next HTTP **9 fixtures** เดิมครบ ใช้ output `.next-quota-production-integrated-build` และ placeholder keys/loopback provider+ledger จำลอง ไม่ใช้ Production credentials ไม่ส่งอีเมลจริง ไม่ใช้ build เก่าที่ฐาน `7065d32` แทนผล integration นี้ ปิด fixture server3072 และคืน build-generated tsconfig ก่อน commit

การตรวจชุดนี้ครอบคลุม integration ในเครื่องและ quota runtime ผล Production signed delivery และ actual primary localhost:3000 parity ที่ทำหลัง deployจริงบันทึกแยกในหัวข้อถัดไป ไม่มี app/code/SQL ที่ปรับเพิ่มหลัง checks

## Production database และ configuration

- Apply เฉพาะ `20261018154826_resend_quota_alert_delivery_ledger.sql` ที่ commit/push แล้ว ตรวจ remote baseline151ตรงกันใน isolated CLI workspace `/private/tmp/korkru-quota-prod-delivery-7Gtequ` ก่อน dry-run ซึ่งพบ pendingเพียงไฟล์เดียว และ actualapplyไฟล์เดียวกันโดยไม่เพิ่ม roles/seeds พร้อม `--skip-vault` ไม่ replay/repair ประวัติเดิมหรือ apply SEB/backlog
- SQL SHA-256: `185073728e4960988fcb4c47757dd6ba9a960eb21f6dc3dca144ed5b42d9e04c` หลัง apply history **152/152**, pending **0**
- Catalog ยืนยัน RLS เปิด, anon/authenticated ไม่มี table privilege/RPC execute, service-role grants ถูกต้อง และ RPC เป็น **SECURITY INVOKER** พร้อม `search_path` ว่าง ฟังก์ชันเดิม/table-security/policy fingerprintsคงเดิม New WARN **0** มี INFOที่คาดไว้ของ service-only RLS/no-policy ไม่ได้เปิด browser access หรือสร้างข้อมูลทดสอบบน Production
- Vercel monitor key/from/to/signing-secret ทั้งสี่รายการเป็น **sensitive / Production เท่านั้น** ยืนยัน metadata โดยไม่อ่านค่าลับ ผู้ส่ง `auth@mail.korkru.com`, ผู้รับ `korkru.me@gmail.com`; ตรวจค่าที่ไม่ลับ `KORKRU_DEPLOYMENT_ENV=production` แล้ว เจ้าของยืนยันกล่อง Rotate signing secret และ Save secretเอง การหมุนเป็น owner-reported confirmation; ผล signed delivery หลัง cutover เป็นหลักฐาน runtime แยกต่างหาก
- สถานะปัจจุบัน **Production `RESEND_QUOTA_ALERTS_ENABLED=true` / Staging `false`** ไม่เปิด Production SMTP/Google หรือ SEB จากงานนี้

## Release และ cutover ที่ตรวจแล้ว

[PR #75](https://github.com/korkru-me/jk/pull/75) merge เป็น **216d492469259a3e22945413e4ca798e71439a1f** Deploymentแรก Readyขณะ Production flagยังfalse: canonical `/login` ได้200 และ webhook POSTได้503 `not_configured` จึงยังไม่เปิดการส่งระหว่างเตรียม

1. ปิด Staging flag เวลา **04:04:55.898 UTC (11:04:55 น. ไทย)** แล้ว redeploy `dpl_3MF5dx9xRELpf18CaoxWKne1Bp12` จาก source `c77f4ec` เป็น Readyเวลา **04:08:28.634 UTC** พร้อม alias Stagingจริง รวม `jk-resend-staging-korkru-mes-projects.vercel.app` Exact-alias POSTได้503 `not_configured` เวลา **04:11:04.094 UTC** หลัง Readyเกิน60วินาที จึงตรวจ quiescence ก่อนเปิด Production
2. เปิด Production flagเวลา **04:11:47.011 UTC** และ redeploy **`dpl_EU5HJV6xvj4kgZSJ6NbRKjS2nbc4`** source **216d492** เป็น Readyเวลา **04:15:07.111 UTC (11:15:07 น. ไทย)** canonical aliases `www.korkru.com`/`korkru.com` ถูกต้อง Unsigned canonical POSTถูกปฏิเสธ **400 `invalid_webhook`** เวลา **04:16:36.155 UTC**
3. บันทึก URLของ Resend webhookเดิมเป็น **`https://www.korkru.com/api/webhooks/resend`** คง Enabled และ events `email.sent`, `email.received` ไม่ disable/delete endpoint
4. Replay **เพียงหนึ่ง event `email.sent` จริงที่ providerเคยสร้างสำหรับอีเมล TESTตัวอย่างวันที่19ตุลาคม** ไม่ส่งอีเมลใหม่ Exact canonical-host POSTของ Productionตอบ **200 เวลา04:17:05.066 UTC (11:17:05 น. ไทย)** หลัง reload Resend detailขึ้น **Success / HTTP200 / Attempts2 / `below_threshold`** Timestampของรายการต้นฉบับยังเป็นวันที่19ตุลาคม; current request timestampใน Vercelและattemptที่เพิ่มยืนยัน replayรอบใหม่นี้ ไม่ใช่อ้างผลเก่าว่าเป็น Production
5. ผลนี้ยืนยัน **signatureจริง → Production route → Resend Usage APIจริง** ทั้งสองช่วงต่ำกว่าเกณฑ์ ไม่ใช่การบังคับให้ยอดจริงแตะทั้ง6threshold หลัง replayอ่าน aggregate ledgerของ **ทั้ง StagingและProduction** ได้ **total0 / pending0 / completed0** ไม่มีอีเมลส่งระหว่าง rollout และไม่มี alertเพิ่มจาก replay

ไม่เก็บ provider/event IDs, raw payload, secret หรือ request/response bodyที่มีค่าลับลงเอกสาร

## Actual primary localhost parity — complete

- Checkoutจริง **`/Users/korkusonmasaen/Korkru/korkru`**, port **3000**, PID **54741** คงเดิม Primary HEAD **794077bf**; syncทำใน working treeโดยรักษางานร่วม จึงไม่ได้ commit/rewrite primarybranch ขณะ release sourceและhandoffอยู่ใน branchที่pushแล้ว
- ไฟล์quota7รายการตรงกับ release **216d492** byte-for-byte เพิ่มเฉพาะ `.env.example` อีก15บรรทัด และ dependency `svix@2.8.0` พร้อม lock entries4รายการแล้วติดตั้งจริง ไม่คัดลอก Production/Staging envหรือsecret
- Quota132cases, TypeScript และ **Node24 isolated snapshotของ current primary → production Webpack buildผ่าน** ไม่แตะ running `.next`/tsconfig และไม่ restart server ตรวจ **Next MCP compile/runtime0** บน actualport3000 และ POSTตอบ503 `not_configured` เพราะ localmonitorยังปิด
- Protected hashesเดิม18รายการไม่เปลี่ยน รักษางานร่วม `teacher-view-client` และ classroom lab ไม่มี blanket reset/stash/copy ไม่ถือว่า previewworktreeแทนprimary
- Technical note: ระหว่าง npm install ตัวจัดการแพ็กเกจนำ `node_modules/cn` ที่เป็น undeclared/unlocked extraneous CLIออก ไม่พบ importsหรือversionที่ยืนยันได้ จึงไม่ติดตั้ง artifactที่ไม่ทราบversionกลับ ไม่ใช่ app dependencyที่เปลี่ยนใน releaseนี้

Release source/deployment, signed webhook/Usage integration และ required primary parityครบแล้ว Current behaviorพร้อมใช้งาน Productionตามข้อจำกัดด้านล่าง การปรับเอกสาร handoffครั้งสุดท้ายไม่เปลี่ยน app/SQL/env/provider/deployment และไม่รันชุดเว็บซ้ำจาก checksที่บันทึกไว้

## ข้อจำกัดและ rollback

Webhookเป็นตัวกระตุ้น ไม่มีcronขณะไม่มีevent ยอดกระโดดข้ามระดับจะเตือนสูงสุดที่พบ อีเมลเตือนใช้quotaเองและอาจส่งไม่ทันเมื่อquotaหมด วันUTCเป็นnotificationdedupไม่ใช่คำรับรองproviderdailyreset Monthlywindowใช้providerresets_at ถ้าpendingreceiptเกิน23hต้องreconcileไม่ส่งใหม่อัตโนมัติ Provideraccepted/deliveredไม่ใช่Inboxproof

หากความพร้อมไม่ผ่านให้คง/ปิดflagfalse และแก้สาเหตุ additiveledgerควรเก็บไว้ ไม่ลบหรือแก้appliedmigrationเพื่อrollbackแอป ต้องประสานendpoint/secret/flagเป็นชุดและไม่เปิดStage/Productionmonitorพร้อมกัน
