# Resend quota Production candidate — 20 ตุลาคม 2026

## ขอบเขตและสถานะ

เจ้าของอนุญาตตั้งแจ้งเตือนโควตา Production แบบทีละขั้นตอน Candidate นี้อยู่ branch `codex/resend-quota-production-20261020` ใน checkout `korkru-quota-production-20261020` เริ่มจาก `origin/master` **7065d32ee841f904312aa12d4eced11938bab199** และนำเฉพาะ quota implementation **0352be1bc6bfbf2d88b5780b025dfe88294dbb7e** มาปรับเอกสาร ไม่ merge Stage ทั้ง branch

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

## Production ที่ยังต้องทำก่อนเปิด flag

1. ตรวจ `supabase migration list`/remote history ใหม่กับ Production เป้าหมายจริงจาก isolated workspace ก่อน apply เฉพาะ **20261018154826_resend_quota_alert_delivery_ledger.sql** ห้าม broad db push/replay backlog/repairประวัติเดิม ไม่ apply SEB หรือ migration ที่ไม่อยู่ใน scope ตรวจ catalog/RLS/grants/RPC แบบอ่านหลังปล่อย ไม่มีการทำ test data บน Production
2. เก็บ monitor key/ผู้ส่ง/ผู้รับ/signing secret ใหม่ใน Vercel **Production**; คง **RESEND_QUOTA_ALERTS_ENABLED=false** จน code/ledger/config พร้อม ไม่อ่านค่าลับมาใส่ log/repo หรือคัดลอก Staging secrets
3. ใช้ current canonical endpoint `https://www.korkru.com/api/webhooks/resend` Free มี 1 webhook จึงย้าย endpoint เดิมหลังหยุด Staging monitor ใช้ rotation เพื่อสร้าง Production signing secret ต่างค่าเดิมได้; dual-sign24hไม่ใช่ถอนoldsecretทันที คง events email.sent/email.received ตรวจ currentwindow receipts/ระดับจริงก่อนเปลี่ยน scope เพื่อกันเตือนซ้ำ
4. เปิด Production flag/redeployเฉพาะรุ่นที่ตรวจแล้ว รอReady/sourceSHA/canonicaldomainให้ตรงก่อนสลับ provider URL ตรวจ delivery/log response แบบอ่าน ไม่ส่ง fixture/ลดเกณฑ์/ล้าง ledger หรือทำอีเมลจริงเพิ่มโดยไม่มีขอบเขตที่เจ้าของตกลง
5. หลัง ProductionReady ต้อง sync เฉพาะ released files/deps ไป checkout ที่เสิร์ฟ **localhost:3000** จริง รักษางาน dirty question UI และ local env การตรวจที่ preview worktree/buildเพียงอย่างเดียวไม่ใช่ primary parity

Candidate นี้ **ยังไม่ apply SQL, เปลี่ยน env/flag/webhook, เปิด Production SMTP/Google หรือ deploy**; rootทำ rolloutแยกและต้องบันทึกผลตามจริงก่อนประกาศพร้อม Production Primarylocalยังไม่syncเพราะยังไม่มีProductionreleaseจากcandidateนี้

## ข้อจำกัดและ rollback

Webhookเป็นตัวกระตุ้น ไม่มีcronขณะไม่มีevent ยอดกระโดดข้ามระดับจะเตือนสูงสุดที่พบ อีเมลเตือนใช้quotaเองและอาจส่งไม่ทันเมื่อquotaหมด วันUTCเป็นnotificationdedupไม่ใช่คำรับรองproviderdailyreset Monthlywindowใช้providerresets_at ถ้าpendingreceiptเกิน23hต้องreconcileไม่ส่งใหม่อัตโนมัติ Provideraccepted/deliveredไม่ใช่Inboxproof

หากความพร้อมไม่ผ่านให้คง/ปิดflagfalse และแก้สาเหตุ additiveledgerควรเก็บไว้ ไม่ลบหรือแก้appliedmigrationเพื่อrollbackแอป ต้องประสานendpoint/secret/flagเป็นชุดและไม่เปิดStage/Productionmonitorพร้อมกัน
