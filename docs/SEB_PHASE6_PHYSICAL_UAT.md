# SEB Phase S6 — Physical platform UAT

อัปเดต: 8 ตุลาคม 2026 · **กำลังดำเนินการ — เจ้าของยืนยัน Windows เข้าโจทย์ได้หลัง signed-session fix; กำลังทดสอบบันทึกคำตอบ**

เฟสนี้พิสูจน์ assignment-specific `.seb` artifact เดียวกันบน Windows, macOS,
iPadOS และ iPhone/iOS จริง หลัง authenticated Staging mock ของ S5 ผ่านแล้ว
ผลจากไฟล์กลางรุ่นเก่า, native lab, browser จำลอง หรือคนละ artifact ห้ามนำมารวมกัน

**จุดพัก/แผนใหม่ 9 ตุลาคม 2026:** เจ้าของขอพักก่อนขั้น Windows เน็ตหลุด แล้วขอแผน
ห้องรอสอบและโหมดข้อสอบเดียวก่อนทดสอบต่อ แผนย่อย W1–W7 อยู่ใน
[`SEB_COMPLETION_PLAN.md`](./SEB_COMPLETION_PLAN.md) และยังรอคำสั่งเริ่ม implementation
ภาพล่าสุดของ r2-sessionfix อยู่ที่หน้าโจทย์เลือก ก พร้อมข้อความบันทึกอัตโนมัติ/
เชื่อมห้องคุมสอบแล้ว ยังไม่มีผล offline/reconnect/resume/upload/submit/quit รอบนี้
ไม่แก้ final r2, release, candidate manifest หรือสถานะผ่าน ให้เก็บเป็นประวัติเดิมและแยก
candidate ใหม่เมื่อ source/config เปลี่ยน ไม่ให้นักเรียน/เจ้าของเริ่มตั้งค่า native ใหม่ก่อนเว็บนิ่ง

## สิ่งที่ยืนยันจาก S5 แล้ว

- isolated Staging journey `seb-s5-20260927av` จบสถานะ `complete` เมื่อ
  `2026-09-27T06:51:22.600Z`
- ผ่าน synthetic login, system check, revision-bound attempt, autosave/retry,
  reload/resume, PDF upload/retry, heartbeat, submit/result, cross-account denial
  และ cleanup
- durable evidence อยู่ local แบบสิทธิ์ owner-only และไม่ commit credential,
  assignment ID, CK, BEK หรือรหัสผ่าน

หลักฐานนี้ปิด S5 แต่ไม่แทน native physical UAT ของ S6

## Dedicated SEB UAT boundary

- origin สำหรับ physical UAT คือ `https://korkru-seb-uat.vercel.app` ใน Vercel project
  `korkru-seb-uat` แยกจาก project หลัก `jk`
- project นี้เปิดสาธารณะเฉพาะเพื่อ native SEB UAT แต่ใช้ Supabase Staging และข้อมูลสังเคราะห์
  เท่านั้น ไม่มี Production credential และ deploy ด้วย `vercel.seb-uat.json` ซึ่งไม่มี Vercel Cron
- Vercel Authentication ของ project หลักยังคงเดิม จึงไม่เปิด Preview deployment อื่นต่อสาธารณะ
- deployment contract ยอมรับ production target ของ Vercel เฉพาะ exact UAT origin + exact
  system project URL + `SEB_UAT_ISOLATED_PROJECT=true`; ค่าอื่น fail closed

## Candidate r2-sessionfix และจุดทำต่อ — 8 ตุลาคม 2026

- เจ้าของรายงานว่าปุ่มขอรหัสตรวจสอบใหม่ขึ้น “ยืนยันสำเร็จ” สีเขียวชั่วครู่ แล้ววนกลับแดง
  เพิ่มหลักฐานว่าขั้น verify ผ่านก่อนหน้าโจทย์ แต่ไม่ถือว่าถึง attempt หรือผ่านเคสสอบรวม
- ตรวจ exact deployed `lib/seb-claims-core.mjs` พบ `validVersion` ยังรับเฉพาะ five-part
  ต่างจาก `parseSebVersion` ที่รับ compact Windows แล้ว Synthetic sign→verify ของ production
  primitive ยืนยัน legacy true / compact false; coupled test ของ real verification→cookie→
  real session/access read ก่อนแก้ล้ม 3 cases ที่ session เป็น null นี่คือบั๊กที่ยืนยันได้จาก source
  เรื่อง SPA/native stale hashes ที่วินิจฉัยก่อนหน้าอาจเป็นอีกเงื่อนไข แต่ยังไม่ยกเป็นสาเหตุหลัก
- รวม version grammar ที่ `lib/seb-version-core.mjs` ให้ native parser กับ signed claim reader
  ใช้ implementation เดียวกัน รองรับ Windows compact + legacy Windows/macOS/iOS โดยยังต้อง
  exact platform match, bounded/control-free metadata, signed HMAC/expiry และ exact
  user/assignment/release/revision เช่นเดิม CK+BEK challenge verification ไม่เปลี่ยน
- ขยาย regression ให้ใช้ real verification action, signed cookie, real `getSebSession`,
  real `getExamAccessSession` และ real `startSubmission` resume โดย mock เฉพาะ auth/DB/cookie
  storage/external dependencies; ตรวจทั้ง take/system_check, tampering, exact bindings,
  wrong key/build/version, expiry และ malformed/platform mismatch ไม่ใช้ server mocks เป็น
  native pass ไม่สร้าง attempt หรือปลอม keys บน fixture จริงเพื่อให้ gate ดูผ่าน
- main ผ่าน 211 files / 2,887 tests และ token lint; `npx tsc --noEmit` ติดเฉพาะ error เดิม
  `.error` บน union ใน `create-classroom-modal.tsx` และ `create-classroom-form.tsx`
  ไม่แก้สองฟอร์มนี้และไม่รัน main production build ซ้ำเมื่อ type gate เดิมยังไม่ผ่าน
- สำเนาที่จะ deploy จาก frozen `9390ab91d14a4a7649becc89b65e14a692ed7218` เปลี่ยนเพียง
  5 source/test files กับเอกสาร 2 files ไม่มีงานอื่น Source `07209c7597d8aadc9bbaa5a3e11e0572dfd256ca`
  push บน `codex/seb-windows-version-fix` แล้ว ผ่าน 184 files / 2,536 tests, TypeScript,
  token lint และ production build; compact session round-trip/signature/expiry diagnostic ผ่าน
- skill `next-dev-loop` ตรวจ running local fixture และ compile route `/assignments/[id]/take`
  ผ่าน ไม่มี compilation/runtime error; React state ของ Chrome ธรรมดายัง outside ไม่ปลอม
  native verification Browser session ของงานปิดแล้ว โดยคง local dev server ไว้
- ก่อน rollout read-only migration parity ตรง 140 รายการถึง `20261006102054`; r2 ยัง
  revision 2/published และ 52,606-byte final/digest/CK/3 exact entries ตรงเดิม Vercel API
  เริ่มตอบ 403 แต่ CLI refresh session สำเร็จ จากนั้น authenticated source/alias check ผ่าน
  ไม่ให้เจ้าของ login ใหม่ ไม่แสดง credential และไม่เปลี่ยน fixture/password/artifact/schema
- deploy เฉพาะ `korkru-seb-uat` สำเร็จเป็น `dpl_4DRgqUQV1W7SmJYRsT7w2d6Y4yhE`;
  post-deploy authenticated read ยืนยัน exact project/source/alias/READY, login 200 ที่ UAT
  origin มี Staging badge ไม่มี Vercel auth page และ post-deploy immutable release read ตรงเดิม
- ล็อก candidate `seb-s6-20261008-r2-sessionfix` ที่ `2026-10-08T13:29:29.000Z` พร้อม source/
  deployment ข้างต้นและ release commitment `1d94096a600395ad9208f79576ebe60624b09b9f9441bf0957814a12193b3536`
  เดิม Shared session-reader change กระทบทุก platform จึง reset 32 cases เป็น pending
  ของ source/deployment ใหม่ โดยเก็บสอง pass/หนึ่ง failed เดิมในประวัติด้านล่างและ Git
  ไม่กล่าวว่า native ผ่านจากผลจำลอง ไม่มี platform ผ่านครบและห้ามเริ่ม S7
- เจ้าของอยู่ Windows launch gate เดิม: หลังแจ้งว่า deploy/attest สำเร็จ ให้กด
  **ขอรหัสตรวจสอบใหม่** อีกครั้งเพียงครั้งเดียวเพื่อ full navigation รับหน้า/action/challenge ใหม่
  แล้วรายงานว่าเห็นโจทย์หรือ error โดยยังไม่ submit/ปิด SEB ถ้าเกิดข้อผิดพลาดให้หยุด ไม่วนกดซ้ำ
  ใช้ final r2/credentials เดิม ไม่ต้องแก้/บันทึกไฟล์ เปลี่ยนรหัส หรือเก็บ native keys ใหม่
  ผล launch/system-check และเคสสอบของ candidate ใหม่นับผ่านเฉพาะเมื่อยืนยันเครื่องจริงอีกครั้ง
- เจ้าของยืนยันว่า **เข้าทำข้อสอบได้แล้ว** หลัง retry รอบแพตช์ signed-session;
  รับรองคำยืนยันที่ `2026-10-08T13:45:23.000Z` (เวลา Agent รับรอง ไม่ใช่เวลาเครื่อง Windows)
  authenticated read-only Vercel check ซ้ำยืนยัน exact source/deployment/alias/READY และ
  Staging badge ตรง candidate ปัจจุบัน ไม่มี deploy หรือข้อมูล fixture เปลี่ยนในรอบนี้
  บันทึกเป็นความคืบหน้าเฉพาะถึงหน้าโจทย์ ไม่ใช่ผลผ่าน `autosave-reconnect-upload-submit`
  และไม่อนุมานว่า launch/system-check ของ candidate ใหม่นับผ่านแล้ว ทั้ง 32 cases ยัง pending
- ขั้นต่อไปบน Windows เดิม: ตอบข้อแรกหนึ่งข้อ แล้วรอข้อความ **บันทึก...** กลับเป็น
  **บันทึกอัตโนมัติ** ให้เจ้าของรายงานสถานะก่อนทดสอบเครือข่ายต่อ ยังไม่ submit,
  ปิด SEB, ปิด Wi-Fi หรือแก้ final r2/รหัส/คีย์; ถ้ายังรอซิงก์หรือมี error ให้รายงานตามจริง
- ภาพถัดมาจาก Windows ยืนยันหน้าโจทย์สังเคราะห์ข้อ 1/1, เลือก **ก** พร้อมข้อความ
  **บันทึกอัตโนมัติ**, **เชื่อมห้องคุมสอบแล้ว** และ badge **STAGING · ระบบทดสอบ**;
  รับรองภาพที่ `2026-10-08T14:03:07.000Z` (เวลา Agent ไม่ใช่เวลาเครื่อง)
  นับเฉพาะผลแสดงสถานะหลังตอบออนไลน์ ไม่ใช่การอ่านคำตอบกลับจากฐานข้อมูลหรือหลักฐาน
  reconnect/resume/upload/submit ทั้งเคสรวมยัง pending และยังไม่ให้ส่งข้อสอบ
  ขั้นถัดไปให้เปิดเมนู Wi-Fi ของ SEB แล้วส่งภาพเมนูเพื่อชี้ตำแหน่งตัดการเชื่อมต่อให้ตรง
  กับเครื่องจริง ไม่เดาว่ามีสวิตช์ปิด Wi-Fi และไม่ให้ออกจาก SEB/แก้ artifact เพื่อปิดเน็ต
  หลังยืนยันวิธีตัดเน็ตแล้วจึงทดสอบเปลี่ยนคำตอบเป็น **ข** ขณะ offline และตรวจสถานะ
  **รอซิงก์ 1** ก่อนเปิดเน็ตกลับ ไม่เริ่มขั้นนี้โดยไม่รู้ว่าตัดการเชื่อมต่อสำเร็จแล้ว
- รอบบันทึกความคืบหน้านี้แก้เฉพาะ runbook: evidence regression 1 file / 8 tests ผ่าน,
  schema/candidate lock ผ่าน แต่ physical aggregate ยัง `NOT READY` ตาม pending;
  next-step checker ยังชี้ launch เพราะไม่ได้ใช้การถึงโจทย์แทนหลักฐานทั้งเคส
  ไม่รัน full tests/TypeScript/lint/build ใหม่ ไม่มี application change, migration หรือ deploy

## Candidate r2-winfix — ประวัติก่อน signed-session fix

- เจ้าของอนุมัติแก้ compatibility และ deploy เฉพาะ dedicated SEB UAT; source
  `9390ab91d14a4a7649becc89b65e14a692ed7218` มาจาก frozen deployment parent
  `a5c417afe238c00d815d1ee233c93c5ef3311055` และเปลี่ยนเพียง parser/test กับเอกสารสองไฟล์
  ไม่รวมงานอื่นจาก main integration branch ไม่ merge master และไม่ deploy Production
- `parseSebVersion` รับ native Windows `SEB_Windows_3.10.2.920` เพิ่มด้วย strict full-string
  grammar จำกัด Windows; format เดิมยังผ่าน และ exact platform/version/build + CK/BEK
  request hashes ทั้งคู่ยังบังคับเหมือนเดิม ไม่มี user-agent/version-only authorization
- สำเนา frozen source ผ่าน 182 files / 2,504 tests, TypeScript, token lint และ production
  build; authenticated Vercel API ตรวจ deployment `dpl_CDU2Yk9HWLGTj1C5YMNGwwguLFyD`
  เป็น READY ใน exact project, source metadata ตรงและ alias target ตรง หน้า login 200
  บน exact UAT origin พร้อม Staging badge และไม่มี Vercel auth page
- เพิ่ม regression ของ real verification action บน main branch โดย mock เฉพาะ external
  dependencies: native/legacy formats ผ่านเมื่อ hashes ตรง, wrong build/version/CK/BEK,
  URL binding/revision mismatch และ check-in persistence failure ไม่ออก session;
  ไม่ปลอม native pass บนเว็บ deploy Main regression รวมผ่าน 210 files / 2,864 tests
  และ TypeScript ผ่าน Local running fixture ผ่าน compile/runtime checks และ browser
  ธรรมดายังคงถูกระบุว่าอยู่นอก SEB ไม่ใช่ผลผ่านของ native device
- main integration build compile ผ่านแต่ type-check ติดข้อผิดพลาดเดิมนอก scope ใน
  `create-classroom-modal.tsx` และ `create-classroom-form.tsx` เรื่อง `.error` บน union;
  ไม่แก้ฟอร์มห้องเรียนรอบนี้ สำเนาที่ deploy ผ่าน build ครบแล้ว
- post-deploy read-only release attestation ยืนยัน revision 2 ยัง published, final ขนาด
  52,606 bytes/digest/CK/สาม exact native entries ตรงเดิม ไม่มี artifact re-save,
  enrollment ใหม่, password rotation, migration apply/repair หรือ Production mutation
- candidate ปัจจุบัน `seb-s6-20261008-r2-winfix` ล็อก source/deployment ข้างต้น ณ
  `2026-10-08T10:17:24.000Z` และคง release commitment
  `1d94096a600395ad9208f79576ebe60624b09b9f9441bf0957814a12193b3536` เดิม
  เริ่มจากทั้ง 32 cases เป็น pending ของ source/deployment ใหม่; ผล failed ก่อนแพตช์เก็บในประวัติ
  ด้านล่างและ Git ไม่ยกมาเป็น pass หรือรวมข้าม candidate ยังห้ามเริ่ม S7
- ภาพล่าสุดจากเจ้าของยืนยัน Windows system check ผ่านครบสี่แถวและแสดง
  “เครื่องนี้ผ่านการตรวจสอบ”, ระบบ Windows, พร้อมข้อความว่าบันทึกผลให้ครูแล้ว
  จึงบันทึกเฉพาะ `windows/system-check=passed` ที่ `2026-10-08T10:27:58.000Z`
  ซึ่งเป็นเวลา Agent รับรองภาพ ไม่ใช่เวลาของเครื่อง/เวลา expiry ภาพไม่มีรหัสหรือ raw key;
  ตรวจ Vercel metadata ซ้ำว่า source/deployment/alias ยังตรง lock ปัจจุบันก่อนบันทึก
- เจ้าของยืนยันต่อว่าเปิดไฟล์รอบนี้ไม่ถามรหัสใดก่อนถึงเว็บ จึงบันทึก
  `windows/opens-without-entry-password=passed` ที่ `2026-10-08T10:32:14.000Z`
  (เวลา Agent รับรองข้อความ ไม่ใช่เวลาที่เครื่องเปิดไฟล์) จากคำยืนยันโดยตรง ไม่ใช่อนุมานจากภาพ
- ขั้นถัดไป Windows autosave/reconnect/upload/submit: เริ่มด้วยเลื่อนลงใต้กล่องผลตรวจ
  กด **กลับรายการข้อสอบ** แล้วเริ่มชุด `SEB S6 Physical UAT Exam` ใน native SEB เดิม
  ยืนยันหน้าโจทย์ก่อนค่อยทดสอบคำตอบ/เครือข่ายทีละขั้นและยังไม่ submit
  ใช้ `korkru-s6-assignment-r2-final.seb` เดิม ไม่ต้องเปิด Configuration Tool,
  เปลี่ยนรหัสหรือเก็บคีย์ใหม่ อีก 30 cases pending และยังไม่มี platform ผ่านครบ
- รอบบันทึกผลเครื่องนี้เปลี่ยนเฉพาะ manifest/docs: evidence regression 1 file / 8 tests ผ่าน,
  schema/candidate lock checks ผ่าน, next-step ชี้ Windows autosave/reconnect/upload/submit และ aggregate
  ยัง NOT READY ตาม pending ไม่มี application change จึงไม่รัน full tests/TypeScript/lint/build
  ใหม่ ไม่ deploy และไม่มี migration/data mutation
- ภาพขั้นเริ่มสอบถัดมาขึ้น “การตั้งค่า Safe Exam Browser หรือเวอร์ชันไม่ตรงกับที่โรงเรียนอนุญาต”
  ใน launch gate ยังไม่ถึงโจทย์ จึงบันทึก `windows/autosave-reconnect-upload-submit=failed`
  ที่ `2026-10-08T10:36:27.000Z` (เวลา Agent รับรองภาพ) โดย substeps autosave/network/upload/
  submit ยังไม่ได้ทดสอบ ไม่ลบสองผลผ่านเดิมเพราะ source/deployment/artifact ยังไม่เปลี่ยน
- ตรวจ exact deployed source แล้วข้อความนี้มาจาก `verifySebRequestHashes` หลังผ่าน challenge,
  release/version และ URL shape; ไม่ใช่ parser error เดิมและไม่ใช่หลักฐานว่ารหัสออกผิด
  authenticated Vercel read ยืนยัน source/deployment/alias ยังตรง r2-winfix lock
- พบเส้นทางที่อาจใช้ hash เก่า: dashboard ใช้ Next `Link` ไป take และ launch gate ใช้ค่า API
  ที่มีอยู่ทันที โดยไม่สร้าง document context ใหม่; [Windows v3.10.2 Api.js](https://github.com/SafeExamBrowser/seb-win-refactoring/blob/v3.10.2/SafeExamBrowser.Browser/Content/Api.js)
  มี `updateKeys` ที่เพียงเรียก callback และ [RenderProcessMessageHandler](https://github.com/SafeExamBrowser/seb-win-refactoring/blob/v3.10.2/SafeExamBrowser.Browser/Handlers/RenderProcessMessageHandler.cs)
  คำนวณ hashes ของ `frame.Url` ใน `OnContextCreated` จึงอนุมาน SPA URL change อาจคง hashes
  ของ document เดิม Synthetic-only diagnostic ยืนยัน old URL hashes ไม่ตรง new URL
  และ fresh context matches; ยังไม่อ่าน native request hashes จากอุปกรณ์ จึงยังไม่ยืนยันสาเหตุจริง
- ขั้นวินิจฉัยบนเครื่องเดิม: กด **ขอรหัสตรวจสอบใหม่** เพียงครั้งเดียว ปุ่มนี้ใช้
  `window.location.assign('/assignments/.../take')` เพื่อ full navigation ไม่ใช่ถามรหัสผ่าน
  ให้รายงานหน้าโจทย์หรือ error โดยยังไม่ submit และไม่เปลี่ยนไฟล์/รหัส/คีย์ ไม่ให้กดซ้ำวน
- รอบวินิจฉัยนี้ parser/verification regressions 2 files / 43 tests ผ่าน บันทึกเฉพาะ
  manifest/docs ไม่มี application implementation, deploy หรือ migration/data mutation
  full tests/TypeScript/lint/build ไม่รันใหม่; ต้องพิสูจน์ทางแก้ก่อนออก candidate ใหม่

## Candidate r2 ก่อนแพตช์ — ประวัติที่ไม่ผ่าน ห้ามใช้ล็อก deployment ใหม่

- physical Windows system check จากภาพเจ้าของไม่ผ่าน: แถวตรวจว่าเปิดใน SEB ผ่าน แต่ server
  ตอบ `ไม่พบเวอร์ชัน Safe Exam Browser ที่รองรับ` บันทึกเคส `system-check` เป็น `failed`
  โดย `testedAt=2026-10-08T09:44:22.000Z` คือเวลา Agent รับรองผลจากภาพ ไม่ใช่เวลาที่อ่านจากเครื่อง Windows;
  เคส launch ยัง pending เพราะยังไม่ได้ยืนยันชัดเจนว่าไม่มี prompt ก่อนเปิด
- ตรวจ frozen source และซอร์สทางการ SEB Windows `v3.10.2` แล้ว: [Api.js](https://github.com/SafeExamBrowser/seb-win-refactoring/blob/v3.10.2/SafeExamBrowser.Browser/Content/Api.js)
  ใช้ `SEB_Windows_` ตามด้วย `ProgramBuildVersion` ผ่าน [RenderProcessMessageHandler](https://github.com/SafeExamBrowser/seb-win-refactoring/blob/v3.10.2/SafeExamBrowser.Browser/Handlers/RenderProcessMessageHandler.cs)
  จึงเป็นรูปแบบ `SEB_Windows_3.10.2.920` ต่างจาก five-part format ที่ parser ก่อนแพตช์รับ
  diagnostic เรียก parser ก่อนแพตช์กับ native format แล้วได้ `null`; ไม่ใช่หลักฐานว่าคีย์ผิด
- ขณะบันทึกผล failed ยังไม่ได้แก้ application/deploy; รอบแพตช์ที่ได้รับอนุมัติและล็อกใหม่
  อยู่หัวข้อ r2-winfix ด้านบน โดยคง immutable release/artifact เดิม
- เจ้าของขอให้บัญชีนักเรียนสังเคราะห์พิมพ์ข้ามเครื่องได้ง่าย จึงเปลี่ยนเฉพาะอีเมลและ
  รหัสบัญชี `student-primary` บน Staging เป็นข้อมูลสั้นสำหรับ UAT โดยคง user identity,
  role และ roster เดิม ตรวจ password login ใหม่ผ่านและ global sign-out session ตรวจสอบแล้ว
  ข้อมูลใหม่อยู่ใน owner-only fixture/handoff นอก Git; ไม่เปลี่ยนบัญชีครู รหัสออก SEB,
  artifact, source/deployment หรือ policy ของบัญชีจริง และยังไม่ใช่ผลผ่าน native system check
- ครูตั้ง Quit/Unlock Password ของ revision 2 ผ่านเว็บแล้ว; ลงทะเบียน immutable release r2
  และเผยแพร่ assignment `seb_required` ผ่าน UI ครูสังเคราะห์แล้ว ก่อนเผยแพร่ยังไม่มี attempt
  ข้อมูลและ mutation รอบนี้จำกัดเฉพาะ synthetic fixture บน Staging
- ไฟล์ `korkru-s6-assignment-r2-final.seb` ขนาด 52,606 bytes ตรวจผ่าน passwordless
  plaintext policy, Start/Quit URL, `sendBrowserExamKey` และ quit hash ของ exact revision;
  bytes ต่างจากทั้ง seed r2 และ final r1 ห้ามแก้หรือบันทึก final ซ้ำ
- เก็บ native evidence ครบ Windows 3.10.2 build 920, macOS 3.7 build 1591F,
  iPadOS และ iPhone/iOS 3.7.1 build 15753 โดย CK ตรงกันและ iPad/iPhone มี BEK เดียวกัน
  operator ตรวจครบ 4 targets และ deduplicate ได้ 3 exact native build entries
- build 15753 ของ iOS 3.7.1 ยืนยันจาก [official release tag](https://github.com/SafeExamBrowser/seb-mac/blob/3.7.1/SafeExamBrowser.xcodeproj/project.pbxproj#L5204)
  ไม่ใช่การอ่าน build จากเครื่องจริง; ต้องตรวจ exact runtime build อีกครั้งใน system check
- ช่อง BEK ในไฟล์ข้อความ iPad กลับมาว่างหลังการตรวจคู่คีย์สำเร็จ จึงประกอบ evidence จาก
  iPhone key ที่เก็บจริงและเคยตรวจตรงกับ iPad แล้ว เฉพาะเมื่อ CK/version/build ตรงกัน;
  ไม่สร้างหรือเดาคีย์ใหม่ และไม่แก้ไฟล์ข้อความต้นทาง
- evidence และ wrapper ของ r2 อยู่ใน `.local/seb-s6/` นอก Git และไม่แสดง raw keys
  `build-r2-native-evidence.mjs` ตรวจไฟล์ owner-only; `run-r2-enrollment.mjs dry-run` ผ่าน
  แล้ว `apply` สำเร็จแบบ upload ใหม่ไม่ overwrite; อ่าน release กลับมาตรวจ byte SHA-256,
  size, CK และ registry ทั้งสาม entries ตรง native evidence ครบ จากนั้น publish ผ่าน UI ครู
- รวม `origin/master` ถึง `c677d8e` เพื่อให้ migration history ตรงกับ Staging 140 รายการ
  ถึง `20261006102054`; SQL สองรายการใหม่เป็น assignment presets ที่ apply ไว้แล้ว
  รอบนี้ไม่ได้ apply/repair migration และไม่ได้เปลี่ยน Production
- หลังรวม master: 209 files / 2,839 tests, TypeScript, token lint และ production build ผ่าน
  ผลนี้ไม่แทน browser/native UAT และไม่เปลี่ยน frozen dedicated UAT deployment
- หลังเจ้าของล็อกอิน Chrome และยืนยัน CLI ใหม่ ตรวจ Vercel API ผ่านครบ exact project,
  alias target, READY และ source metadata ของ `dpl_BfjRy3mrTfv8hnvd7oNxRrWc7iM1`
  จาก source `a5c417afe238c00d815d1ee233c93c5ef3311055` บน project `korkru-seb-uat`;
  หน้า login ตอบ 200 ที่ exact origin พร้อม Staging badge และไม่มี Vercel auth page
- source marker ใน HTML ไม่มี เพราะ deployment นี้สร้างผ่าน CLI; ไม่ใช้ marker ที่ขาดเป็น
  หลักฐาน source การยืนยัน source ข้างต้นอาศัย authenticated Vercel deployment metadata
- ก่อน enrollment ตรวจ migration parity ตรง 140 รายการถึง `20261006102054`, fixture เป็น
  draft/revision 2 ไม่มี release/attempt และ final policy ผ่านครบ ตรวจ master ใหม่พบงาน
  late-submission อีก 3 migrations แต่ยังไม่อยู่บน Staging จึงไม่ merge/apply งานนั้นในรอบ SEB
- candidate `seb-s6-20261008-r2` ล็อก source/deployment เดิมข้างต้น และ
  `releaseCommitmentSha256=1d94096a600395ad9208f79576ebe60624b09b9f9441bf0957814a12193b3536`
  ที่ `2026-10-08T03:30:18.709Z` (เวลา created_at ของ release); post-publish read ยืนยัน
  status `published` และไฟล์/native keys ยังตรงเดิม ไม่มี deploy, migration apply/repair หรือ
  Production mutation รอบนี้
- ขั้นต่อไปเปิด `korkru-s6-assignment-r2-final.seb` เดิมด้วย Safe Exam Browser ตัวสอบบน
  Windows (ไม่ใช่ Configuration Tool); ต้องถึง KorKru login โดยไม่ถาม Exam/Settings Password
  แล้วทำ system check และเคสที่เหลือตามลำดับ Windows → Mac → iPad → iPhone

Manifest ของ candidate ก่อนแพตช์เริ่มจากทั้ง 32 cases เป็น `pending` แล้ว Windows system check
เป็น `failed` อีก 31 cases pending; manifest ปัจจุบัน reset เป็น r2-winfix ด้านบนแล้ว
ยังไม่มี platform ใดผ่าน S6 ครบและห้ามเริ่ม S7

การตรวจรอบ enrollment นี้: focused artifact/evidence tests ผ่าน 2 files / 23 tests,
candidate/schema checks ผ่านและ next-step ชี้ Windows launch; physical release gate ยัง
`NOT READY` ทั้ง 4 platforms ตามผลที่ pending ไม่ได้รัน full tests, TypeScript, lint หรือ
build ใหม่ในรอบนี้ เพราะเปลี่ยนเฉพาะ manifest/docs และ Staging fixture ไม่ได้แก้ application
code หรือ frozen deployment

## Candidate r1 — ประวัติที่ไม่ผ่าน ห้ามใช้ล็อกรอบ r2

- candidate metadata: `seb-s6-20260927b`
- source ถูกล็อกที่ `47c35d69ef21571401f02dca529f5f4024297f1d` และ dedicated UAT
  deployment `dpl_4VGLadkUHsvCsU9e6b48vYvs5baR` อยู่สถานะ READY แล้ว
- public health/isolation check ของ `/`, `/login`, `/exam-screen-lab`, `/exam-screen-lab/seb`
  และ `/exam/quit` ตอบ 200 บน exact UAT origin, แสดง `STAGING · ระบบทดสอบ` และไม่พบ
  Vercel Authentication marker
- UAT project ใช้ session secret ที่สร้างใหม่เฉพาะ project และไม่คัดลอก global CK/BEK
  รุ่นเก่าที่ retire แล้ว; การตรวจ assignment ใช้ release CK/BEK แบบ assignment-specific เท่านั้น
- เก็บ CK/BEK จาก artifact bytes เดียวครบทุก exact build, ลงทะเบียน immutable release
  และล็อก `releaseCommitmentSha256`/`lockedAt` ที่ไม่เปิดเผย raw key แล้ว
- ห้ามใช้ bypass token หรือ shareable secret ใน Start URL/ไฟล์ `.seb`; dedicated UAT origin
  ต้องเข้าได้โดยตรงและยังแสดง `STAGING · ระบบทดสอบ`

### ผล physical UAT ของ candidate r1

- Windows 11 Home Single Language 25H2 (OS Build 26200.9550), SEB 3.10.2 build 920
  เปิดไฟล์โดยไม่มี entry/settings password แต่ไปไม่ถึง KorKru และแสดง `Page Blocked`
  จึงบันทึกเคส `opens-without-entry-password` เป็น `failed`; การไม่ถามรหัสอย่างเดียวไม่พอให้เคสผ่าน
- ตรวจซอร์ส SEB Windows 3.10.2 และ artifact แล้วพบว่า URL ถูกซ่อนในข้อความตาม `browserWindowShowURL=0`
  ไม่ใช่คำขอ URL ว่าง สาเหตุคือ seed เปลี่ยน `startURL` ไป dedicated UAT แต่ไม่ได้เปลี่ยน
  authoritative `URLFilterRules` จาก Staging origin ทำให้ redirect หลัง Start URL ถูก default-deny
- ทดสอบ Quit/Unlock Password ของ candidate r1 บนเครื่องจริงแล้ว SEB ออกสำเร็จ จึงยืนยันเฉพาะกลไก
  emergency quit แต่ไม่ทำให้ candidate r1 ผ่าน launch หรือใช้แทน end-to-end UAT ได้
- ต้องแก้ materializer ให้ย้าย active non-regex allow rule เป็น exact `https://korkru-seb-uat.vercel.app/*`, เพิ่ม validator
  ป้องกัน stale origin แล้วให้ครูตั้งรหัสใหม่เพื่อสร้าง revision 2; หลัง native Final Save ต้องเก็บ CK/BEK
  ของ artifact ใหม่ครบทุก exact build และลงทะเบียน candidate r2 ก่อนเริ่ม Windows ใหม่

### Synthetic fixture รอบ r1

- สร้างบัญชีครู/นักเรียน, personal workspace, ห้องเรียน, สมาชิกห้อง และโจทย์สังเคราะห์
  ผ่าน UAT UI จริงแล้ว; credential และ resource ID อยู่ใน local owner-only state นอก Git เท่านั้น
- สร้างข้อสอบออนไลน์แบบ `seb_required` แล้ว โดยช่องรหัสผ่านเข้าทำว่าง,
  teacher-owned Quit/Unlock Password ผ่าน policy 20–64 ตัว และ revision ปัจจุบันเป็น revision 1
- Final Save บน Windows สร้าง artifact เดียวแบบ read-only แล้ว; operator ตรวจ policy และเก็บ CK/BEK
  จาก Windows, macOS, iPadOS และ iOS exact build ผ่าน owner-only channel โดยไม่ส่งค่าเข้า Git/แชต
- ลงทะเบียน immutable release บน Supabase Staging สำเร็จและเผยแพร่ข้อสอบผ่าน UI ครูจริงแล้ว;
  ฐานยังเก็บ Quit/Unlock Password เฉพาะ SHA-256 และยังไม่มี attempt ก่อนเริ่ม physical UAT

## ขั้นตอนเตรียม candidate (รายการด้านล่างสำเร็จสำหรับ r2 แล้ว)

release ของ assignment เป็น immutable และ S5 ลงทะเบียน Windows BEK เท่านั้น จึงนำ release
นั้นไปอ้างว่า Mac/iPad/iPhone ผ่านไม่ได้ สำหรับ S6 ต้องสร้าง synthetic assignment revision ใหม่
และใช้ artifact bytes ชุดเดียวตลอดทั้งสี่ระบบ:

1. ✅ ครูสังเคราะห์ตั้ง Quit/Unlock Password ใหม่ใน KorKru UAT แล้ว; รหัสผ่านเข้าทำและ
   Settings/Exam Password ยังคงว่าง
2. ✅ Final Save บน Windows หนึ่งครั้งเป็น candidate artifact แล้วและตั้ง read-only; ห้ามบันทึกซ้ำ
3. ✅ เปิด **ไฟล์เดียวกันโดยไม่บันทึก** ใน exact SEB build ของทุกระบบ แล้วนำ CK/BEK
   เข้าช่องทาง local secret collection เท่านั้น
4. ✅ ลงทะเบียน CK และ BEK ทุก build พร้อมกันใน immutable release เดียวแล้ว
5. ✅ publish synthetic assignment แล้วล็อก source revision, Staging deployment และ
   `releaseCommitmentSha256` ที่ไม่เปิดเผย raw key/รหัส
6. 🟡 เริ่มบันทึก physical UAT ลง `config/seb-physical-uat-evidence.json`; ยังไม่มี platform ใดผ่านครบ 8 cases

เหตุผลที่ห้ามบันทึกไฟล์ซ้ำ: Config Key เปลี่ยนเมื่อแก้และบันทึก config และ Browser Exam Key
ต่างกันตาม platform/build เอกสารทางการกำหนดให้โหลดไฟล์ final เดียวกันในแต่ละ platform
แล้วคัดลอก BEK โดยไม่ re-save ไฟล์นั้น:

- [SEB Config Key / JavaScript API](https://safeexambrowser.org/developer/seb-config-key.html)
- [SEB Integration](https://safeexambrowser.org/developer/seb-integration.html)
- [SEB macOS manual](https://safeexambrowser.org/macosx/mac_usermanual_en.html)

### ช่องทางลงทะเบียน multi-platform

operator รองรับ evidence schema 2 ที่มี target ครบ `windows`, `macos`, `ipados`, `ios`
และตรวจว่า runtime platform ตรง (`windows`, `macos`, `ios`, `ios`) หาก iPad กับ iPhone
ใช้ native version/build เดียวกัน ต้องให้ BEK ตรงกันและ operator จะ deduplicate เป็น registry entry
เดียว หาก key ต่างกันจะ fail closed

เก็บ evidence JSON ไว้ใน local owner-only directory นอก Git แล้วส่งผ่าน stdin เท่านั้น:

```bash
node scripts/enroll-assignment-seb-artifact.mjs \
  --assignment '<synthetic-assignment-id>' \
  --revision '<revision>' \
  --artifact '<absolute-path-to-unchanged-candidate.seb>' \
  --multiplatform \
  --apply < '<absolute-path-to-owner-only-native-evidence.json>'
```

ห้ามใส่ CK/BEK ใน argument, shell history, screenshot, commit หรือแชต คำสั่งจะคืนเฉพาะ
metadata ของ release และจำนวน key โดยไม่คืนค่า key ใด ๆ ก่อนใช้ `--apply` ให้รันคำสั่งเดียวกัน
โดยตัด `--apply` ออกเพื่อตรวจ environment/arguments แบบไม่อ่าน evidence และไม่ mutate

## ข้อมูลที่ห้ามส่งหรือเก็บใน Git/แชต

- CK, BEK, Quit/Unlock Password, Administrator Password และ Settings Password
- token, session, signed URL, secret-manager value หรือ request hash
- assignment/release/student/user ID, ชื่อนักเรียน, คำตอบหรือภาพหน้าจอที่มีข้อมูลบัญชี
- free-text note ใน evidence manifest

เจ้าของผลิตภัณฑ์แจ้ง Agent เฉพาะ platform, OS version, SEB version/build, case id และ
`ผ่าน`/`ไม่ผ่าน` หากไม่ผ่านให้บอกอาการทั่วไปโดยไม่ถ่ายส่วนที่มี key/รหัส

## ลำดับทดสอบต่อระบบ

ใช้ลำดับ Windows → macOS → iPadOS → iPhone/iOS เพื่อเริ่มจาก build ที่ pipeline
ตรวจได้แน่นอนก่อน แต่ทุกระบบต้องอ้าง candidate lock เดียวกัน

1. `opens-without-entry-password` — เปิดไฟล์แล้วต้องถึง KorKru โดยไม่ถาม Exam/Settings Password
2. `system-check` — ล็อกอินบัญชีสังเคราะห์และทำ system check ผ่าน
3. `autosave-reconnect-upload-submit` — ตอบ, autosave, ปิด/เปิดเครือข่าย,
   resume attempt เดิม, อัปโหลดไฟล์สังเคราะห์ และ submit
4. `quit-link-after-submit` — หลัง submit สำเร็จ กดทางออกของ KorKru แล้ว native SEB
   ต้องปิดโดยไม่ถามรหัส
5. `wrong-config-rejected` — เปิดไฟล์คนละ revision แล้ว system check ต้องปฏิเสธ
6. `modified-config-rejected` — แก้ **สำเนา** อย่างน้อยหนึ่งค่าและบันทึกเป็นอีกไฟล์
   โดยไม่แตะ candidate แล้ว system check ต้องปฏิเสธ
7. `wrong-quit-password-rejected` — ก่อน submit ลองรหัสออกผิดหนึ่งครั้งแล้ว SEB ต้องไม่ปิด;
   รหัสจริงใช้เฉพาะผู้คุมสอบเมื่อจำเป็นและห้ามส่งให้ Agent
8. `normal-browser-rejected` — เปิดเส้นทางเริ่มสอบเดียวกันใน browser ปกติแล้วต้องเริ่ม
   SEB attempt ไม่ได้

หากเคสใดไม่ผ่าน ให้หยุดระบบนั้น เก็บสถานะ `failed`, แก้บั๊กและออก candidate ใหม่เมื่อ
artifact/source/deployment เปลี่ยน ผลของ suite ที่ได้รับผลกระทบต้อง reset เป็น `pending`
และทดสอบใหม่ ห้ามแก้เวลา/สถานะให้ดูเหมือนผ่าน

## คำสั่งตรวจ

```bash
npm run check:seb-physical-uat
npm run next:seb-physical-uat
```

คำสั่งแรกตรวจ fixed schema, candidate lock, exact platform และ 8 cases ต่อระบบแบบ fail closed
คำสั่งที่สองบอกงานถัดไปเพียงหนึ่งข้อ Manifest ปัจจุบันล็อก source/deployment/release ของ
r2-sessionfix ครบแล้ว ตัวตรวจยังเป็น `NOT READY` เพราะทั้ง 32 cases ของ source/deployment ใหม่
และ OS metadata iPad/iPhone pending ไม่ยกผลของ r2-winfix มาปิด suite นี้ เจ้าของยืนยันเข้า
หน้าโจทย์ Windows ได้หลังแพตช์แล้ว ขั้นต่อไปเก็บผล autosave ก่อนเครือข่าย/upload/submit
และยืนยัน launch/system-check ของ candidate ใหม่เมื่อถึงจังหวะเหมาะสม โดยไม่บังคับตั้งค่า/
เก็บคีย์ซ้ำหรือออกจาก attempt ที่กำลังทำเพียงเพื่อเรียง checklist

หลัง physical evidence ผ่านครบ Agent จึงอัปเดต aggregate
`config/seb-platform-evidence.json`, รัน regression + `check:seb-platforms` และปิด S6
โดย **ยังไม่เริ่ม S7** จนเจ้าของผลิตภัณฑ์สั่งต่อ
