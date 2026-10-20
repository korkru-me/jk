# Resend quota Production candidate — 20 ตุลาคม 2026

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

การตรวจนี้ครอบคลุม integration ในเครื่องและ quota runtime ไม่ใช่ผล Production signed delivery หรือ primary localhost:3000 parity ซึ่งต้องทำหลัง deploy จริง ไม่มี app/code/SQL ที่ปรับเพิ่มหลัง checks

## Production readiness และขั้นตอนที่เหลือ

- **ฐานข้อมูลพร้อมแล้ว 20 ตุลาคม:** ตรวจ remote baseline 151 versions ตรงกันใน isolated CLI workspace `/private/tmp/korkru-quota-prod-delivery-7Gtequ` เพิ่มเฉพาะ `20261018154826_resend_quota_alert_delivery_ledger.sql` ที่ commit/push แล้วใน candidate `8478f884` Dry-run พบ pending เพียงไฟล์เดียว จากนั้น apply ไฟล์เดียวกันโดยไม่เพิ่ม roles/seeds และใช้ `--skip-vault` ไม่ replay/repair ประวัติเดิมหรือ apply SEB/backlog
- SQL SHA-256 ที่ตรวจตรงกับ candidate: `185073728e4960988fcb4c47757dd6ba9a960eb21f6dc3dca144ed5b42d9e04c` หลัง apply history **152/152**, pending **0**
- Post-apply read-only catalog: RLS เปิด, anon/authenticated ไม่มี table privilege หรือ RPC execute; service-role grants ถูกต้อง RPC เป็น **SECURITY INVOKER** และ `search_path` ว่าง Receipt count **0** ไม่มีการสร้างข้อมูลทดสอบบน Production
- Fingerprints ของฟังก์ชันเดิม/table security/policies คงเดิม New WARN **0**; มี INFO ที่คาดไว้เพียง RLS-enabled/no-policy ของ service-only ledger ไม่ใช่หลักฐานว่าเปิด browser access
- **Vercel ที่เจ้าของบันทึกแล้ว:** Production monitor key แบบ sensitive และผู้ส่ง `auth@mail.korkru.com`/ผู้รับ `korkru.me@gmail.com` Root ยืนยันแถวใน UI แล้ว ไม่อ่านหรือบันทึกค่าคีย์ Production flag คง **`RESEND_QUOTA_ALERTS_ENABLED=false`**
- ตรวจแถว Vercel และเปิดดูเฉพาะค่าที่ไม่ลับของ **`KORKRU_DEPLOYMENT_ENV=production`** แล้ว scope ฝั่งแอปตรง Production
- **Rotation เป็น owner-reported confirmation:** หลังเลือก Rotate signing secret เจ้าของตอบว่า “เห็นกล่องยืนยัน และกดยืนยันแล้ว” ไม่ได้ยืนยันโดย provider logs อย่างอิสระ Dashboard ไม่คง success toast และ API Logs list ไม่พบ rotate row; การไม่พบแถวนั้นไม่ใช่หลักฐานว่า rotation ล้มเหลว ไม่อ่านหรือบันทึก secret และไม่กด rotation ซ้ำเพื่อเดาผล
- **Signing secret บันทึกแล้ว:** เจ้าของคัดลอก current provider secret หลัง rotation ที่รายงานแล้วมา Save เอง Root ยืนยันแถว `RESEND_QUOTA_WEBHOOK_SECRET` แบบ sensitive เฉพาะ Production พร้อม success toast โดยไม่อ่านค่าลับ ไม่กด rotation ซ้ำ ไม่เปลี่ยน flag หรือ provider URL

1. ตรวจ candidate ที่รวม master ล่าสุดให้ผ่านก่อน deploy code/config โดย flag ยัง `false` การบันทึก key/from/to/signing secret และ scope Production พร้อมแล้ว แต่ไม่ใช่หลักฐานว่า provider ส่งถึงแอปรุ่นใหม่นี้ได้ ไม่อ่าน secret กลับ
2. Free มี 1 webhook จึงย้าย endpoint เดิมหลังหยุด Staging monitor ใช้ signing secret ที่เจ้าของรายงานว่าหมุนและ Save แล้ว ไม่หมุนซ้ำเพื่อเดาผล Dual-sign 24 ชั่วโมงไม่ใช่ถอน old secret ทันที คง events `email.sent`/`email.received` และตรวจ current-window receipts/ระดับจริงก่อนเปลี่ยน scope เพื่อกันเตือนซ้ำ
3. เปิด Production flag/redeploy เฉพาะรุ่นที่ตรวจแล้ว รอ Ready/source SHA/canonical domain ให้ตรงก่อนเปลี่ยน provider URL เป็น `https://www.korkru.com/api/webhooks/resend` ตรวจ delivery/log response แบบอ่าน ไม่ส่ง fixture/ลดเกณฑ์/ล้าง ledger หรือทำอีเมลจริงเพิ่มโดยไม่มีขอบเขตที่เจ้าของตกลง
4. หลัง Production Ready ต้อง sync เฉพาะ released files/deps ไป checkout ที่เสิร์ฟ **localhost:3000** จริง รักษางาน dirty question UI และ local env การตรวจที่ preview worktree/build เพียงอย่างเดียวไม่ใช่ primary parity

**แอป candidate ยังไม่ deploy; webhook cutover และ localhost:3000 parity ยังรอ** การ apply additive ledger และบันทึก monitor/from/to ไม่ได้เปิดการส่งแจ้งเตือน Production SMTP/Google และ SEB ไม่อยู่ใน scope นี้ รอบเอกสารสถานะนี้ไม่เปลี่ยน app/SQL/env/provider และไม่รัน test/build ซ้ำจากผล `8478f884` เพราะไม่มี application change

## ข้อจำกัดและ rollback

Webhookเป็นตัวกระตุ้น ไม่มีcronขณะไม่มีevent ยอดกระโดดข้ามระดับจะเตือนสูงสุดที่พบ อีเมลเตือนใช้quotaเองและอาจส่งไม่ทันเมื่อquotaหมด วันUTCเป็นnotificationdedupไม่ใช่คำรับรองproviderdailyreset Monthlywindowใช้providerresets_at ถ้าpendingreceiptเกิน23hต้องreconcileไม่ส่งใหม่อัตโนมัติ Provideraccepted/deliveredไม่ใช่Inboxproof

หากความพร้อมไม่ผ่านให้คง/ปิดflagfalse และแก้สาเหตุ additiveledgerควรเก็บไว้ ไม่ลบหรือแก้appliedmigrationเพื่อrollbackแอป ต้องประสานendpoint/secret/flagเป็นชุดและไม่เปิดStage/Productionmonitorพร้อมกัน
