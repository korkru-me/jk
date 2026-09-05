# SEB รายข้อสอบ — เฟส 3ก: password/revision core

อัปเดต 5 กันยายน 2026

## ขอบเขตและสถานะ

ผู้ใช้ล็อกอินเว็บ local ให้และอนุญาตให้เดินเฟสถัดไปโดยเลื่อนการทดสอบ SEB จริงไว้ก่อน ตรวจแบบอ่านอย่างเดียวแล้วว่าหน้า dashboard หลังล็อกอินเข้าถึงได้ แต่การล็อกอิน KorKru **ไม่ใช่** การเชื่อม/ยืนยัน SEB Server

งานรอบนี้ต่อเฉพาะ **โครงสร้างรหัสแยกเจ้าของครู/ข้อสอบและเวอร์ชัน** ที่ไม่ขึ้นกับ Docker ไม่มีการรับรหัสของผู้ใช้จริง ไม่มี UI, Server Action, route, migration, persistence adapter, `.seb` download หรือการเรียก SEB Server เพิ่มขึ้น ไม่มีข้อมูลจาก dashboard ถูกนำไปเป็น fixture

สถานะคือ **core ที่ยังไม่ต่อ runtime** ไม่ใช่ฟีเจอร์ครูตั้งรหัสที่เสร็จแล้ว ในเว็บ local จะยังไม่เห็นช่องตั้งรหัสใหม่ และผลทดสอบ native/server ของเฟส 1–2 ยังคง pending ไม่ใช่ passed

## สิ่งที่เพิ่ม

- `lib/seb-password-policy.ts`: policy สำหรับเจ้าของข้อสอบ SEB online, ตรวจรูปแบบรหัส/ID และคำนวณ revision ถัดไปจาก expected version
- `lib/seb-password-vault.ts`: server-only AES-256-GCM envelope, dedicated keyring และการเตรียมร่างรหัส ไม่เรียก database/network และไม่อ่าน env ใดเอง
- Unit tests ของทั้งสอง module ใช้ ID/key/password สมมติทั้งหมด ทดสอบข้ามเจ้าของ/organization/ข้อสอบ/revision, tampering, key rotation, redaction และสถานะ draft รวมทั้ง decrypt ผ่าน WebCrypto API ที่แสดง contract แยกจาก implementation

## Policy ที่ใช้ใน core รอบนี้

- Actor ต้อง active และมี role `teacher` หรือ `admin` **พร้อมเป็น `assignments.created_by` ของข้อสอบนั้นจริง** ไม่มี global admin/co-teacher bypass ให้เปลี่ยนรหัสของครูคนอื่น
- ตรวจ membership ของ organization ที่ assignment ถือครอง ไม่เลือก personal organization ของ actor มาแทน และไม่อาศัยการมองเห็นปุ่มใน UI
- เฉพาะ `type=exam`, `mode=online`, `secure_browser_mode=seb_required`
- Owner context ต้องถูก resolve จาก session + RLS/authorization ฝั่ง server ใหม่ทุกครั้ง **ห้ามรับ object นี้จาก browser** helper ตรวจเงื่อนไขบนข้อมูลที่ส่งให้เท่านั้น ยังไม่ได้พิสูจน์ live authentication/RLS/membership
- รหัสทดลองต้องเป็น printable ASCII ที่ไม่มี whitespace ยาว 12–64 ตัวอักษร ไม่ trim/normalize/truncate และไม่มี fallback รหัสกลาง ขอบเขตนี้เป็น compatibility subset ชั่วคราว ยังต้องพิสูจน์ native Unicode/password behavior ก่อนตัดสิน UX production
- ครูแต่ละคนตั้งรหัสของข้อสอบตนเองได้ตาม policy แต่ไม่ได้บังคับว่ารหัสต้องไม่ซ้ำกับที่คนอื่นตั้ง (ไม่ควรมีระบบเทียบรหัสครูข้ามคน) และยังไม่ได้เพิ่มค่า default ต่อครูที่ใช้ข้ามหลายข้อสอบ

## Encryption contract

ใช้ Node `crypto.createCipheriv/createDecipheriv` สำหรับ AES-256-GCM ไม่เขียน primitive เอง IV สุ่มใหม่ 12 bytes ต่อ seal, auth tag 16 bytes, dedicated random master key 32 bytes; เรียก `final()` เพื่อยืนยัน tag ก่อนคืน plaintext ตาม [Node crypto documentation](https://nodejs.org/api/crypto.html#class-decipheriv)

AAD มีลำดับตายตัว: purpose `korkru:seb-quit-password`, format version, algorithm, key ID, org ID, teacher ID, assignment ID, revision UUID และ revision number การสลับ context/key ID หรือนำ ciphertext ไปใส่ revision อื่นจึงต้องถูกปฏิเสธ Caller ต้องส่ง **expected binding จาก authorized versioned record** ไม่ใช้ binding ที่ client อ้างมาเป็นแหล่งความจริง

Envelope เป็นข้อมูลเข้ารหัสสำหรับ core ภายใน **ไม่ใช่ format ไฟล์ `.seb` และไม่ใช่ CK/BEK/ASK/session token** การเตรียม envelope ไม่ได้ทำให้ native SEB รับรอง config

Keyring รับเฉพาะ explicit keys ที่ base64 canonical และ decode เป็น 32 bytes มีได้ไม่เกิน 5 key IDs เขียนด้วย active key และอ่านข้อมูลเก่าได้เมื่อยังมี key ID เดิม ไม่ดึง `SEB_SESSION_SECRET`, CK, BEK, Quit/Admin Password หรือ Supabase key มาใช้แทน ไม่มี env ใหม่ที่ต้องตั้งใน Vercel สำหรับรอบนี้

KeyObject อยู่ใน private fields ไม่ serialize เป็น JSON; errors ใช้รหัสทั่วไป ไม่มี raw crypto exception/input/cause ส่วน plaintext buffers ถูกล้างหลังใช้ แต่ JavaScript strings/GC ไม่รับประกัน secure erasure จึงห้ามอ้างว่ารหัสไม่เคยอยู่ในหน่วยความจำ

ก่อนเชื่อม storage จริง ต้องออกแบบ KMS/secret manager, dedicated encryption key provisioning, key backup/rotation/retention และสิทธิ์ service ให้เสร็จ ห้ามเก็บ cleartext หรือส่ง ciphertext/key/รหัสให้ browser/logger การเรียก `open()` ไม่ใช่ authorization check ต้องตรวจสิทธิ์ก่อนเปิดทุกครั้ง

## Revision และความหมายของการเปลี่ยนรหัส

`prepareSebPasswordDraft()` คืน immutable draft ที่มี revision UUID ใหม่และ `revision = current + 1`; ถ้า `expectedPreviousRevision` ไม่ตรงกับ current จะปฏิเสธ ไม่แก้ object เก่า

นี่เป็น **revision planning ใน memory ไม่ใช่ database concurrency control** เมื่อเพิ่ม persistence ต้องมี atomic compare-and-swap/transaction และ unique constraint เพื่อให้บันทึกสำเร็จเพียงหนึ่งรายการจาก expected revision เดียวกัน หากสอง call ทำพร้อมกัน ทั้งสองยังเตรียม draft ได้ แต่มี UUID คนละค่า ห้ามถือว่า helper นี้ล็อกฐานข้อมูลแล้ว

`sebPasswordDraftSummary()` คืนเฉพาะสถานะที่ไม่รวม secret:

- `status: draft`
- `appliedToSeb: false`
- `existingSessionsUpdated: false`
- `requiresNewConfigFile: true`

Summary ไม่ใช่ acknowledgement ว่าบันทึกแล้ว และไม่มีทาง promote เป็น ready/applied ใน core นี้ การ retire encryption key ไม่ได้ยกเลิกรหัสของไฟล์ที่นักเรียนมีอยู่หรือ session ที่กำลังเปิดอยู่ ต้องเก็บไฟล์/version linkage และ recovery policy ก่อนใช้งานจริง

## ไม่เปลี่ยนอะไรบ้าง

- ไม่แก้ gate CK + BEK, challenge, HttpOnly session หรือ production `.seb`
- ไม่เปลี่ยน auth/RLS ของระบบเดิม ไม่เขียนข้อมูลครู/นักเรียน และไม่สร้างหรือ apply migration
- ไม่เปิด native SEB, Docker หรือ SEB Server ไม่เช่าบริการ ไม่ deploy production
- ไม่มีหน้า “บันทึกสำเร็จ” จำลอง ไม่มี flag ที่ทำให้ฟีเจอร์นี้ผ่าน integrity gate โดยไม่ผ่านการทดสอบ

## การทดสอบและงานที่ยังค้าง

ผลรอบนี้: tests ใหม่ 71 ข้อผ่าน; ทั้ง repository 882 ข้อ / 72 files ผ่าน, `npx tsc --noEmit` และ `git diff --check` ผ่าน ไม่รัน production build/lint UI เพราะไม่มี route/runtime caller/UI change ไม่ได้เขียนฐานข้อมูลหรือ apply migration

รัน unit tests และ TypeScript ต่อได้ตามปกติ การอนุญาตเลื่อนขั้นทดสอบครั้งนี้หมายถึงเลื่อน **manual native/server integration** ไม่ใช่การทำเครื่องหมายผ่านหรือถอด security gate

ยังต้องทำก่อนเปิดใช้ฟีเจอร์:

1. เตรียมและรัน SEB Server lab จริงตาม [เฟส 2](SEB_PHASE2.md) พร้อม native tests ของ [เฟส 1](SEB_PHASE1.md)
2. ออกแบบ/persist revision แบบ atomic พร้อม live server authorization/RLS, ownership/delegation และ retention/audit โดยตรวจ migration ledger ก่อนทำ schema
3. จับคู่ org/assignment/revision/student/attempt กับ SEB Server connection และ explicit trusted-build ASK/server-driven BEK แบบ fail closed
4. เพิ่ม UI ครูและ Server Actions ที่ใช้ core นี้จริง หลัง readiness/error states และ storage/integrity integration พร้อม ไม่ส่ง private draft/envelope ไป client
5. ทดสอบเปลี่ยนรหัสหลังแจกไฟล์ ข้ามครู ข้ามข้อสอบ stale revision reconnect และการออกหลังส่ง/ออกกลางคันบนทุก platform ที่รองรับ

การเลื่อน manual test ไม่อนุญาตให้เปลี่ยน `pending` เป็น `passed`, ลด gate เป็น CK-only หรือ deploy ฟีเจอร์รหัสใหม่ไปสอบจริง
