# แผนปิดงาน Safe Exam Browser หลัง Drawing Board

อัปเดต: 9 ตุลาคม 2026

เอกสารนี้กำหนดลำดับงาน SEB/Exam ต่อจาก `origin/master` ที่ commit
`15be506d38e06449a9a2d40242a2b9a0d919fa91` โดยแยกขอบเขตจาก Drawing Board
อย่างชัดเจน งานทั้งหมดทำบน branch/worktree แยกและห้าม merge หรือ deploy Production
จนกว่าเจ้าของผลิตภัณฑ์จะอนุมัติเป็นครั้ง ๆ

## ขอบเขตคงที่

- Drawing Board เฟส 0–8 merge/deploy Production แล้ว แต่ manual UAT ยัง **NOT READY**
- ห้ามเปลี่ยน `config/drawing-board-uat-evidence.json`, สถานะ Drawing Board,
  canonical Staging alias หรือ Drawing Board candidate จากงานในแผนนี้
- ห้ามนำผล SEB ไปนับเป็น Drawing Board UAT และห้ามรวมหลักฐานจากคนละ revision,
  deployment หรือ SEB config
- หากต้องแก้หน้าทำข้อสอบ, submission flow, Auth/session, route, environment guard,
  shared component, Server Action หรือ dependency ที่ Drawing Board ใช้ร่วมกัน ต้องรักษา
  contract เดิมและรัน regression ที่เกี่ยวข้องก่อน commit
- หากจำเป็นต้องเปลี่ยน contract, schema, migration, RLS หรือ Storage policy ที่ Drawing Board
  พึ่งพา ให้หยุดและขออนุมัติก่อน
- การทดสอบที่แตะเว็บ deploy, Auth, Supabase, Storage, email, integration หรือ SEB
  ต้องใช้ Staging แยกและข้อมูลสมมติเท่านั้น

## สถานะเริ่มต้นที่ยืนยันแล้ว

- ระบบปัจจุบันตรวจ CK และ BEK request hash จาก SEB JavaScript API ฝั่ง server
  ผูก challenge/session กับผู้ใช้และข้อสอบ และเก็บ session ใน HttpOnly SameSite cookie
- boundary หลักของข้อสอบตรวจ secure session ซ้ำตอนเริ่ม/resume, อ่าน attempt,
  บันทึกคำตอบ, แนบวิธีทำ, heartbeat และ submit
- มี system check ก่อนเริ่มเวลา, readiness UI, ห้องคุมสอบ, retention และ evidence gate
- native core ของ macOS, iPadOS, iOS และ Windows มีผลผ่านใน manifest แล้ว
- production BEK verification, Staging mock exam และ physical UAT ของ config/build เดียวกัน
  ยังไม่ผ่านครบทั้งสี่ platform จึงยัง **NOT READY**
- release candidate `final-release-uat-r8` เป็นหลักฐานรอบเก่าก่อนงาน Drawing Board ล่าสุด
  ห้ามยกผลข้ามมาใช้กับ candidate ใหม่โดยอัตโนมัติ
- ตัวตรวจใน worktree นี้ไม่เห็น QA/SEB secrets ที่ฉีดจาก Keychain/CI จึงรายงาน environment
  เป็น blocker ตามที่ออกแบบไว้ ผลนี้ไม่แปลว่า Staging หรือค่าใน Vercel ถูกลบ
- branch ทดลองเดิม `feat/seb-phase1-prototype`, `feat/seb-phase2-server-lab` และ
  `feat/seb-phase3-password-core` ไม่ได้เป็น ancestor ของ `master` และมีโค้ดหน้าข้อสอบรุ่นเก่า
  ปะปนอยู่ ห้าม merge/cherry-pick ทั้ง branch; ย้ายเฉพาะ capability ที่ผ่านการทบทวนใหม่

## คำว่า “SEB เสร็จ” ในแผนนี้

แบ่งเป็นสองชั้นเพื่อไม่กล่าวอ้างเกินหลักฐาน:

1. **SEB v1 พร้อมใช้สอบจริง** — config กลางที่ versioned, CK+BEK server gate,
   teacher/student flow, recovery, mock exam และ physical UAT ผ่านครบ platform ที่ประกาศรองรับ
2. **ความสามารถขั้นสูง** — รหัสออกแยกครู/config revision และอนุญาตนักเรียนออกเป็นรายคน
   ต้องผ่าน feasibility/security gate แยก เพราะ native SEB intercepts Quit URL ก่อน HTTP handler
   ปุ่มบนเว็บอย่างเดียวจึงไม่ใช่ authorization boundary ของการปิด native SEB

หากความสามารถขั้นสูงยังพิสูจน์ไม่ได้ ให้เปิด v1 ด้วย Quit Password ที่ครูผู้คุมถือไว้และบอก
ข้อจำกัดตามจริง ห้ามลดจาก CK+BEK เป็น CK-only หรือรับ BEK/ASK ที่ client อ้างมาเพื่อให้ gate ผ่าน

## เฟส S0 — Baseline และขอบเขตงาน

**สถานะ: เสร็จแล้ว** — ผลตรวจอยู่ที่ [`SEB_BASELINE_AUDIT.md`](./SEB_BASELINE_AUDIT.md)
โดยยังไม่มี runtime/migration/Storage/Production change

**Agent ทำ**

- อ่านกติกา/เอกสาร, fetch origin, ตรวจ worktree/branch/upstream และสร้าง branch จาก
  `origin/master` โดยไม่แก้ local `master`
- ทำ inventory ของ runtime, Server Actions, session boundary, config/evidence และ branch ทดลอง
- บันทึกผลกระทบที่อาจแตะ shared exam/Drawing Board files ก่อนเริ่ม implementation
- รันตัวตรวจ read-only เพื่อยืนยันว่า blocker มาจากหลักฐานจริง ไม่ติ๊กสถานะผ่านเอง

**เจ้าของผลิตภัณฑ์มีส่วนร่วม:** ไม่ต้องทดสอบอุปกรณ์ ตัดสินใจเฉพาะเมื่อ audit พบว่าต้องเปลี่ยน
contract หรือขยายขอบเขต

**เกณฑ์ผ่าน:** baseline/ข้อห้าม/รายการช่องว่างถูกบันทึก และ worktree สะอาดบน branch SEB

## เฟส S1 — Harden server boundary และ regression

**สถานะ: เสร็จใน branch SEB แล้ว; ยังไม่ apply migration หรือ deploy** — upload รูปวิธีทำและ
ไฟล์คำตอบเปลี่ยนเป็น signed target ที่ server ออกให้หลังตรวจ exact user/attempt/answer,
สถานะ, เวลา, deadline และ SEB/Android session จาก boundary กลางเดียวกัน เมื่ออัปโหลดแล้ว
server ตรวจ path, MIME, size และ byte signature ซ้ำก่อนยอมบันทึก URL; final submit ตรวจ object
ซ้ำอีกครั้ง Migration `20260922005743_gate_exam_attachment_writes.sql` ถอนเฉพาะ browser
INSERT/DELETE ของ `work-images` และ `submission-files` โดยไม่แตะ Drawing Board bucket/policy
และยังรอ apply ในเฟส Staging ที่ได้รับอนุมัติ

**Agent ทำ**

- ทำ matrix ทุก read/write boundary ของ attempt แล้วเพิ่ม regression ที่ขาดสำหรับ
  start/resume, answer save/check, dynamic question draw, work attachment, upload,
  heartbeat/proctor, timer expiry และ submit
- ทดสอบ wrong user, wrong assignment, expired/tampered session, wrong purpose challenge,
  normal browser และ Android monitored mode ไม่ให้ปะปนเป็น SEB
- ตรวจ safe DTO ว่าไม่ส่ง answer key, CK, BEK, request hash หรือ secret ไป client/log
- ไม่แก้ schema/RLS/Storage เว้นแต่พบช่องว่างที่แก้ใน application boundary ไม่ได้;
  หากจำเป็นต้องแตะส่วนเหล่านี้ให้หยุดและรายงานก่อน
- รัน targeted tests, `npm test`, `npx tsc --noEmit`, `npm run lint:tokens` และ
  `npm run build` ตามไฟล์ที่แก้ รวม Drawing Board regression ที่ใช้ shared flow

**เจ้าของผลิตภัณฑ์มีส่วนร่วม:** ไม่ต้องทดสอบเครื่องจริง; อ่านเฉพาะรายงานถ้าพบความเสี่ยง
หรือการเปลี่ยน behavior

**เกณฑ์ผ่าน:** normal browser/invalid SEB/session ข้ามผู้ใช้หรือข้อสอบถูกปฏิเสธที่ทุก boundary
และ Drawing Board automated regression ที่เกี่ยวข้องยังผ่าน

## เฟส S2 — Versioned config และ release registry สำหรับ SEB v1

**สถานะ: ส่วน Agent ทำเสร็จใน branch SEB แล้ว; รอเจ้าของยืนยัน native policy/build/BEK** —
artifact ใน repository ถูกผูก checksum กับ immutable revision, runtime เลือก BEK ตาม exact
platform/version/build และ session ผูก revision, evidence/candidate schema ปฏิเสธข้อมูลคนละ revision
แล้ว รอบ `r8` ถูกเก็บเป็นประวัติและเปิด `seb-v1-uat-r1` แบบ pending โดยยังไม่มี deploy หรือ
การเปลี่ยน secret ดูขั้นตอนที่ `docs/SEB_CONFIG_RELEASE_RUNBOOK.md`

อัปเดต 23 กันยายน 2026: retire encrypted Staging revision `korkru-staging-v1-d85fd70...`
หลัง physical check พบ opening password และ key ของ revision นั้นปรากฏใน screenshot ส่วนไฟล์
plaintext no-entry-password ที่ใช้รหัสออกแบบง่ายถูกจัดเป็น test-only สำหรับ isolated Staging ตาม
เจตนาของเจ้าของผลิตภัณฑ์ ไม่ใช่ release candidate/evidence และยังไม่ถือว่า S2 หรือ S5 ผ่าน

**Agent ทำ**

- ตรวจไฟล์ production config, canonical start URL, download path, content/navigation filters,
  upload policy, quit/admin policy และ platform build matrix โดยไม่อ่านหรือ commit secret
- ทำ contract ของ config id/revision, supported platform/build, retirement และ rollback
- ทำให้ readiness/evidence ผูก exact config revision + release candidate และปฏิเสธข้อมูลเก่า
- ตรวจขั้นตอน rotate CK/BEK/session secret ว่าห้ามทำกลางการสอบและมี rollback ที่ชัดเจน
- เตรียมข้อความครู/นักเรียนและ runbook แจกไฟล์โดยไม่เปิดเผยรหัสหรือ key

**เจ้าของผลิตภัณฑ์มีส่วนร่วม:**

- ยืนยัน platform/build ที่จะประกาศรองรับจริง
- เปิดไฟล์ final config บน native SEB แต่ละ platform เพื่ออ่าน production BEK แล้วนำไปใส่
  secret manager โดยตรง ห้ามส่งค่าในแชตหรือ commit
- ยืนยัน Quit/Admin Password policy และช่องทางแจกไฟล์

**เกณฑ์ผ่าน:** exact config revision มี BEK ที่ลงทะเบียนครบ platform/build เป้าหมายและมี
ขั้นตอนออก/rollback ที่ผู้คุมสอบทำได้จริง

## เฟส S3 — Teacher/student readiness และทางเข้าสอบ

**สถานะ: ส่วน Agent เสร็จใน branch SEB แล้ว; รอเจ้าของทดลอง UX บน Staging** — system check
ยังไม่สร้าง attempt/ไม่เริ่ม timer, หน้าทางเข้ารับมือ network failure โดยไม่ค้าง, แยกสถานะ
browser ปกติออกจาก native SEB ตามจริง และถ้อยคำครู/นักเรียนไม่ประกาศรองรับ platform/build
เกิน release registry เพิ่มห้องทดลอง `/exam-screen-lab/seb` สำหรับ local/Staging เท่านั้นเพื่อ
ตรวจ normal-browser, config-not-ready, responsive และ accessibility โดยไม่มี assignment หรือ
ฐานข้อมูลอยู่เบื้องหลัง ผลนี้ไม่แทน native CK/BEK UAT และไม่ทำให้ S2 ผ่าน

**Agent ทำ**

- ตรวจเส้นทางครูเปิด SEB, publish gate, readiness card, config download และคำอธิบายข้อจำกัด
- ตรวจ system check ว่าไม่สร้าง attempt/ไม่เริ่ม timer และ roster แสดง ready/expired/not checked
  ตามข้อมูลล่าสุดโดยไม่ใช้สถานะนี้เป็น device identity หรือคำตัดสินทุจริต
- ตรวจ error states ภาษาไทยสำหรับ browser ปกติ, config/key/build ไม่ตรง, session หมดอายุ,
  network failure และ config download ไม่พร้อม
- ตรวจ responsive/accessibility ของหน้าที่แก้โดยไม่เปลี่ยน Drawing Board contract

**เจ้าของผลิตภัณฑ์มีส่วนร่วม:** ทดลองอ่านและกดเส้นทางครู/นักเรียนบน Staging เพื่อยืนยันว่า
คำอธิบายและขั้นตอนใช้งานเข้าใจง่าย โดยยังไม่ใช่ physical release UAT

**เกณฑ์ผ่าน:** ครูตั้งข้อสอบ SEB และนักเรียนตรวจเครื่องได้โดยไม่มีสถานะจำลองหรือข้อความที่
กล่าวอ้างเกินหลักฐาน

## เฟส S4 — ทางออก, พักสอบ และรหัสรายครู

**สถานะ: server/database binding deploy เฉพาะ isolated Staging แล้ว; ยังรอ native artifact enrollment** — migration ledger/dry-run ตรง, application เปิดผ่าน `staging.korkru.com`, ครูเจ้าของตั้งรหัสออกต่อ assignment, การหมุนรหัสคืนข้อสอบเป็น draft, release registry ผูก private artifact + CK/BEK กับ exact revision และ session/attempt ตรวจ revision + access mode เดิมทุก boundary โดย Production application/database ไม่เปลี่ยน รายละเอียดอยู่ที่ `docs/SEB_ASSIGNMENT_ARTIFACT_PHASE4.md`

นโยบายเดิมที่ยืนยันไว้คือ เมื่อครูอนุญาตให้ออกกลางคัน ให้กลับมาทำ attempt เดิมได้และเวลาไม่หยุด
แต่ implementation ต้องแยก “สิทธิ์ในเว็บ” ออกจาก “native SEB ปิดจริง”

**Agent ทำ**

- พิสูจน์ native behavior ของ submit → exit, teacher-authorized interruption และ resume ด้วย
  config ทดลองก่อนต่อ database/UI จริง
- ทำ managed per-teacher/revision ให้หน้าเว็บ KorKru รับการตั้งหรือรีเซ็ต Quit/Unlock Password
  จากครูที่มีสิทธิ์และผูก exact owner + exam/config revision ห้ามใช้รหัสกลางร่วมข้ามลูกค้าครู
- ตรวจความแข็งแรงฝั่ง server, สร้าง immutable `.seb` revision และ CK/BEK release unit ใหม่ แล้ว
  ทิ้ง plaintext password ทันที ห้ามเก็บ/แสดงย้อนกลับ และห้าม rotate ระหว่างมี attempt กำลังทำ
- ห้ามอ้างว่า static Quit URL ที่ซ่อนปุ่มไว้เป็น authorization, ห้ามเปิด CK-only และห้าม merge
  vault/migration เก่าจนผ่านการทบทวน ledger, key recovery, tenant isolation และ BEK lifecycle ใหม่
- contract ของ S4/r2 ใช้ native Quit URL `/exam/quit` และแสดงลิงก์เฉพาะหน้าผลของ attempt
  ที่ตรวจ SEB แล้ว เป็น convenience ไม่ใช่ authorization boundary; requirement ห้องรอสอบ
  ที่เพิ่มใน W1–W7 ห้ามใช้ contract นี้ยืนยันว่าออกก่อนส่งไม่ได้ revision ใหม่ต้องรอ W1 exit decision

**เจ้าของผลิตภัณฑ์มีส่วนร่วม:**

- ทดสอบ native exit/resume บน Mac/iPad/iPhone/Windows ตามเคสที่ Agent เตรียม
- ยืนยัน UX การตั้ง/ยืนยัน/รีเซ็ตรหัสของครู รวมถึงข้อความว่ารหัสเดิมเรียกดูย้อนหลังไม่ได้
- หากต้องมี service เพิ่ม ค่าใช้จ่าย หรือ production migration ต้องอนุมัติแยกก่อน

**เกณฑ์ผ่าน:** มีขอบเขตที่พิสูจน์ได้จริงและข้อความผลิตภัณฑ์ตรงกับ assurance ที่ได้ หาก managed
exit ยังไม่ผ่าน ให้ปิด capability นั้นและไม่ใช้เป็นเงื่อนไขขวางการเปิด v1

## เฟส S5 — Staging integration และ mock exam อัตโนมัติ

**สถานะ: เสร็จแล้วบน isolated Staging** — live run `seb-s5-20260927av` จบสถานะ
`complete` เมื่อ `2026-09-27T06:51:22.600Z` ผ่าน synthetic login, system check,
revision-bound attempt, autosave/retry, reload/resume, PDF upload/retry, heartbeat,
submit/result, cross-account denial และ cleanup โดย durable evidence เป็น local owner-only
และไม่เก็บ credential, raw CK/BEK หรือรหัสผ่านใน Git

ฐาน implementation ด้านล่างเป็นลำดับที่นำไปสู่ผลผ่านดังกล่าว —
operator สำหรับสร้าง seed และ enroll exact assignment artifact ยังคง fail closed, dry-run เป็นค่าเริ่มต้น,
รับ CK/BEK ทาง stdin เท่านั้น และใช้เฉพาะ canonical site + allowlisted Supabase Staging ส่วน pure
mock-harness ใช้ synthetic fixture เท่านั้นและครอบคลุมเส้นทางจนถึงผลครู/authorization/cleanup

อัปเดต 23 กันยายน 2026: เพิ่ม fail-closed live runner และ Auth fixture bridge แล้ว โดย runner
รับ release identity หลังขั้น register จริงแทนการเดา assignment UUID ล่วงหน้า, ตรวจ revision ตาม
ขอบเขต database, หยุดทันทีเมื่อ step แรก fail และเรียก exact cleanup หลัง mutation ส่วน fixture
สร้างบัญชีสังเคราะห์สี่บทบาทด้วย credential ใน closure, ส่งเข้า browser-session capability ภายใน
trust boundary เดียวกัน, ตรวจ app metadata/user id กลับ และอ่าน target/environment ซ้ำก่อนทุก create,
login และ delete การสร้างที่ผลลัพธ์ไม่แน่นอนจะไม่รายงาน cleanup ว่าผ่าน และ uncertain delete รองรับ
confirmed not-found แบบ exact ID โดยไม่เปิด credential/ID ใน evidence ลำดับ mock แก้ให้ตรง UI จริง:
สร้างโจทย์สองชนิด, นักเรียน self-join, ครูสร้าง assignment + quit password แบบ atomic และ expired
challenge/session ใช้ operator-side offline control เท่านั้น ไม่เพิ่ม signing endpoint บนเว็บ

รอบปัจจุบันเพิ่ม composite coordinator ที่บังคับลำดับทุกขั้นและหยุดเมื่อขั้นใดล้มเหลว พร้อม live preflight
ที่ผูก exact Vercel Staging project/deployment, canonical alias และ Git SHA เดียวกัน ใช้ Deployment
Protection bypass ได้เฉพาะ secret header, อ่าน alias ซ้ำหลังโหลดหน้า และ probe schema ที่จำเป็นแบบ
อ่านอย่างเดียว เพิ่ม durable cross-process run-ID reservation บนฐานข้อมูลแบบ service-role-only,
RLS/forced RLS และเก็บ tombstone ไม่ให้นำ ID กลับมาใช้ซ้ำ Migration apply เฉพาะฐาน Staging แล้ว
และ ledger local/remote ตรงกัน ส่วน application commit `7030b3c` deploy Staging สำเร็จ แต่ exact canonical
DOM preflight ยัง pending เพราะต้องใช้ automation bypass แบบ server-only ผ่าน header เท่านั้น
รวมทั้ง aggregate cleanup ตามลำดับ answer storage → artifact storage → database fixture → personal
organization → reservation โดยหยุดทันทีเมื่อ participant ใดล้มเหลวและ retry ต่อจากจุดเดิม; ภายใน
fixture ต้องปิด browser session ก่อนล้าง resource และลบ Auth เป็นขั้นสุดท้ายเสมอ ชุด focused tests
หลังเพิ่ม cleanup และ authorization-role regression ผ่าน 139 tests

อัปเดต 24 กันยายน 2026: ตรวจ canonical Staging แบบอ่านอย่างเดียวผ่าน browser session ที่ผู้ใช้
ยืนยันตัวตนแล้ว พบ source revision `bc31bb7a11c4bac0b1ef7b84f04020b8b0ed99ca`, root marker
`data-deployment-environment="staging"`, ป้าย `STAGING · ระบบทดสอบ` และ robots
`noindex, nofollow, nocache` ตรงกัน การตรวจนี้เป็นหลักฐาน manual เฉพาะ deployment ปัจจุบัน
ไม่ใช้แทน exact automated preflight; automation ยังต้องรับ Deployment Protection bypass จาก
secret manager โดยไม่พิมพ์หรือส่งค่าผ่าน client ก่อนเริ่ม live mock

อัปเดตฐานความปลอดภัยรอบถัดมาในวันเดียวกัน: เพิ่ม browser-session/runtime ที่ใช้ Chrome แบบ isolated,
browser/data adapter, private run ledger, cleanup participants/runtime, narrow Supabase driver และ durable
evidence sink ที่เขียนแบบ directory-relative + immutable โดยไม่บันทึก credential/release identity ตรง ๆ
ทุก operation ที่ timeout ต้อง quiesce ก่อน cleanup และ preflight ต้องปิด resource สำเร็จก่อน reservation
หรือ mutation แรก ส่วน cleanup รองรับ object กำพร้าจากการเขียนฐานไม่สำเร็จแต่ยังตรวจ exact reserved run,
บัญชี/องค์กรสังเคราะห์, path, owner, เวลา, MIME, size และ hash; FK drift guard ครอบคลุม direct และ
transitive cascade graph Migration `20260923201848_seb_s5_atomic_cleanup_rpcs.sql` apply เฉพาะ Korkru
Staging แล้ว, ledger local/remote ตรงกัน และ database lint ไม่มี error ใหม่ รอบถัดมาแก้ browser/data contract
เป็น plan-with-marker → browser mutation → service-role attest actual ID แบบ exactly-one แล้ว โดยขั้น prepare
ห้ามมี target ID ทุกกรณี, attestation ต้องผูก parent/related lineage และ path encoding ให้ตรงก่อน commit ใด ๆ,
assignment/config ผูกหลัง commit ครบเท่านั้น และ `startSubmission` เป็นเจ้าของ submission กับ answer rows
ทั้งสองตามพฤติกรรมจริง เพิ่ม closure-private browser operation runtime สำหรับ 24 operation ที่ผูก alias
ตายตัว, ใช้ one-shot ticket, ตรวจ write gate ซ้ำชิด mutation, บังคับ native prerequisite ก่อนออก ticket,
sanitize error และคง unresolved cleanup obligation แบบมี deadline/retry โดยไม่คืน Page/credential/ID
ระหว่างตรวจ selector จริงพบและแก้ recovery gap สองจุด: autosave ที่ล้มเหลวหยุดสถานะกำลังบันทึกแต่ยังคง
คำตอบไว้รอซิงก์พร้อมปุ่มลองใหม่แบบ single-flight และไฟล์คำตอบใช้ upload ID เดิมเมื่อ retry เพื่อคืน object
ที่อัปโหลดสำเร็จแต่ response หายโดยไม่สร้าง path ซ้ำ เพิ่ม concrete private ticket/selector provider
ชุดแรกสำหรับ `create-subject-classroom` ที่เก็บ Page/marker/target ไว้ใน closure, ผูก full creation window,
บังคับ selector ตามหน้าจริง และจะรายงาน abort ผ่านต่อเมื่อ private data boundary ยืนยัน reconciliation แล้ว
ประกอบ provider → operation runtime → isolated browser runtime → browser/data adapter เป็น closure เดียวแล้ว
โดย public surface เหลือเฉพาะ `executeStep` และ cleanup ไล่จาก browser edge เข้าหา private boundary แบบ retryable
เพิ่ม service-role classroom data boundary ที่อ่าน owner/organization จาก committed private ledger,
query เฉพาะ safe marker fields และยอมรับ exact candidate ได้ไม่เกินหนึ่งรายการก่อน attest/abort
จากนั้นห่อ dedicated query driver + service-role provider เข้า async classroom stack โดย factory output
ยังเหลือเพียง browser-data `executeStep` กับ `closeAll` และปิด driver ทันทีหาก constructor ชั้นถัดไปล้มเหลว
ชุด S5 ผ่าน 22 files / 548 tests, ทั้งโครงการผ่าน 161 files / 2,279 tests และ
TypeScript/syntax/runtime checks ผ่าน

อัปเดต 24 กันยายน 2026 รอบล่าสุด: concrete private ticket/selector provider และ service-role attestation
ขยายครบ teacher setup กับ student browser journey แล้ว รวม system check, attempt/revision, autosave/retry/resume,
in-memory PDF upload, heartbeat, submit/result และ denial ข้ามบัญชี โดยไม่เปิด Page, credential, fixture bytes,
รหัสออกหรือ service-role client ออกจาก private closure ชุดทั้งโครงการผ่าน 162 files / 2,295 tests,
TypeScript และ webpack production build 64 routes ผ่าน

ข้อห้ามเดิมเรื่อง live mock ถูกปิดด้วย private live stack, Windows native key runner,
server-only Deployment Protection bypass และ immutable redacted evidence แล้ว ผล S5 ไม่ได้เปลี่ยน
Production และไม่ใช่หลักฐาน physical platform ของ S6

**Agent ทำ**

- ตรวจ Staging isolation/bootstrap โดยใช้ secret ที่ฉีดจาก Keychain/CI และไม่พิมพ์ค่า
- สร้าง/ใช้เฉพาะบัญชีและ fixture สมมติใน Staging
- ทดสอบ login → system check → start → autosave → reload/resume → upload → heartbeat →
  submit → teacher result และ authorization ข้ามบัญชี
- ทดสอบ invalid/expired/replayed challenge/session และ failure/retry ที่ทำอัตโนมัติได้
- ไม่ย้าย canonical Staging alias หรือเปลี่ยน candidate จนได้รับอนุญาต

**เจ้าของผลิตภัณฑ์มีส่วนร่วม:** ให้สิทธิ์/ดำเนินการในจุดที่ secret manager หรือ Vercel ต้องใช้
บัญชีเจ้าของ และอนุมัติ deployment/candidate ใหม่ก่อนเริ่มเก็บหลักฐาน

**เกณฑ์ผ่าน:** authenticated Staging mock exam ผ่านจาก source revision, deployment และ config
เดียวกัน โดยไม่มีข้อมูล Production ปะปน

## แผนย่อย W1–W7 — ห้องรอสอบและโหมดข้อสอบเดียว

### ส่วนเพิ่มที่เจ้าของอนุมัติ 10 ตุลาคม — ข้อสอบที่ไม่ใช้ SEB ต้องมีหน้ารอด้วย

- เพิ่มเฉพาะ `type=exam` บนเว็บปกติและ legacy verified SEB/approved Android path: เปิดหน้ารอก่อนโจทย์และก่อนเริ่มเวลา กดปุ่ม POST เพื่อเริ่ม/ทำต่อ/ตรวจผลรอบที่หมดเวลา แบบฝึกหัดไม่เปลี่ยน และไม่กล่าวว่า browser ธรรมดาล็อกการออกแบบ native SEB
- GET/prefetch เป็น metadata-only ไม่สร้างรอบ/grade/draw; resume ใช้ own exact current receipt และ `started_at` เดิม URL hint ไม่จัดรอบใหม่ กรณี slow read ข้ามเวลาไม่ serialize โจทย์; stale operation/recovery replay ไม่สร้าง successor
- Streak ข้อแรกย้ายไป explicit POST เฉพาะรอบที่ไม่มี answer rows การกลับเข้าสอบที่มีข้ออยู่แล้วไม่ draw ข้อถัดไป ไม่เปลี่ยน scoring/verdict contract
- ไม่เพิ่ม migration ไม่เปลี่ยน Auth/RLS สูตรคะแนน native files/keys/release/activation และไม่ยก ordinary separate header/answer writes เป็น atomic guarantee
- Local verification: entry/route regressions ใหม่ 31 cases, full 238 files / 3,629 tests, TypeScript/token lint/guarded build ผ่าน; shared controller UI lab ผ่าน idle/explicit/code/refusal/no-replay/double-submit/recovery และ 320px/axe/Next runtime ไม่มี errors ไม่ใช่ hosted Auth-to-DB หรือ native physical proof
- **W7 HOLD ตามเดิม** ส่วนเพิ่มนี้ไม่ใช่การอนุมัติ native activation หรือ Production; บันทึก source/deployment แยกเมื่อ deploy เฉพาะ dedicated TEST สำเร็จ

เสนอวันที่ 9 ตุลาคม 2026 · ตรวจล่าสุด 10 ตุลาคม 2026 · **W2–W6 fixed-exam machine checks/fixture/seed/dedicated UAT deploy DONE; หยุดก่อน W7/native activation**

เจ้าของขอให้หลังเปิดไฟล์ SEB และล็อกอิน นักเรียนอยู่ในหน้ารอของข้อสอบนั้นเท่านั้น
ไม่ไปห้องเรียน/แบบฝึกหัด/เฉลยงานอื่น ไม่มีโจทย์และไม่มีเวลาเดินจนกดเริ่มสอบ
เมื่อเริ่มแล้วใช้เวลาเดิมตลอดการ reconnect/resume; ทางออกปกติแสดงหลัง server ยืนยัน
การส่งสำเร็จ ส่วนการออกก่อนส่งใช้ Quit/Unlock Password ที่ครูเจ้าของตั้งไว้
ไม่มี Exam/Settings Password หรือรหัสเข้าสอบเพิ่มเติมจากการล็อกอินบัญชีตามปกติ

นี่เป็นแผนย่อยก่อนกลับไปปิด S6 เดิม **ไม่ใช่การเริ่ม S7** และไม่ทำให้ผล S6 ผ่านเอง
เจ้าของสั่งทำ W1–W6 ต่อเนื่อง อนุญาตทดสอบ/deploy เฉพาะเว็บทดสอบ และหยุดก่อน W7
คำสั่งนี้ไม่ยกเลิกจุดหยุดด้าน requirement/shared contract ด้านล่าง เจ้าของตอบ “อนุมัติๆ”
ให้ทดลอง initial Quit URL ว่าง → committed completion reconfiguration และเพิ่ม atomic
start RPC บน Staging แล้ว จึงเริ่ม implementation โดยยังไม่เปลี่ยน r2/keys/Production

### ผล implementation W2–W6 (9 ตุลาคม 2026)

- เพิ่ม canonical `/exam/{assignment}/r/{revision}` แยกจาก app shell: entry/login/profile/
  waiting/system-check/take/submitted และ closed JSON API/resource/upload/completion
- signed host-only context เป็นเพียง routing restriction ไม่ใช่ native proof; auth/roster/
  current release/revision/native session ตรวจซ้ำก่อนคำถามและ mutation; context หายหรือ
  เสียบน canonical path ไม่ fallback ไปเว็บปกติ และ request เว็บปกติที่ไม่มี marker คงเดิม
- waiting/GET/prefetch ไม่สร้างรอบหรือโหลดโจทย์; explicit signed generation start ผ่าน
  service-role-only atomic RPC `20261009142610` ล็อก assignment และ commit header+snapshots
  พร้อมกัน; receipt retry คืนรอบเดิม รวม retry หลังส่งแล้ว ไม่เพิ่ม timer หรือ attempt
- เก็บ `started_at` เดิมในการ resume; ตรวจ duration และ effective per-student deadline
  ก่อน question/resource DTO และก่อนส่งหน้า; timeout ใช้ exact native-authorized recovery
  ไฟล์-upload ใน forced expired recovery เป็น pending teacher (`is_correct=null`, score 0)
  ไม่ให้ full credit จาก URL ที่ไม่ได้ตรวจใหม่ และไม่บังคับซ่อมไฟล์หลังปิดรับคำตอบ
- resource proxy ตรวจเฉพาะ snapshot/own-artifact allowlist; upload ใช้ bounded signed
  receipt + create-only bytes และ read-back verification ไม่เปิด direct Supabase REST/
  public solutions ใน native policy; client bridge ไม่เปลี่ยน stored resource models
- submit error ไม่เปิด exit; lost response ตรวจ committed own receipt; terminal bytes
  ออกได้จาก current exact submitted/graded receipt เท่านั้น ไม่ใช้ client success เป็นสิทธิ์
- เพิ่ม strict frozen initial/terminal profile, private operator prepare/enroll พร้อม
  fresh random admin hash, teacher-owned quit hash, no Exam/Settings Password, wx0600
  outputs และ reconciliation-required แทน blind retry หลัง registration outcome ไม่ชัด
- **ขอบเขตรุ่นทดลอง:** fixed online SEB exams ที่ `access_code IS NULL` เท่านั้น รูปแบบ
  ตอบถูกติดต่อกันถูก fail closed พร้อมข้อความแจ้ง ไม่ตีความเป็น fixed และไม่เปลี่ยน legacy
  streak การตรวจทานพบ check-count/summary แยก commit มี race ที่ deterministic draw ID
  อย่างเดียวไม่แก้ จึงถามเจ้าของแยกเรื่อง atomic check ก่อนเพิ่ม SQL/grading authority
- UI ใช้ primitives เดิม; local runtime UI-only fixture ยืนยัน waiting → verified →
  active → submitted ทั้ง desktop/390px และ Next runtime ไม่พบ errors ไม่ใช้ภาพจำลอง
  เป็นหลักฐานว่า auth/native/DB journey จริงผ่าน แก้ union narrowing สองฟอร์มห้องเรียน
  อย่างน้อยที่สุดเพื่อปลด type/build blocker เดิม ไม่มี behavior/schema change ในสองฟอร์ม
- เพิ่ม composed offline server journey 11 tests ใช้ real Proxy/middleware, entry/auth/
  signed context/waiting/API/start/save/submit/resource/completion modules โดยแทนเฉพาะ
  framework request context/cache และ external Auth/DB/Storage; synthetic native inputs
  เป็น local fixture เท่านั้น ไม่ enroll cloud keys และบังคับว่าไม่มี network call ครอบคลุม
  no-timer/no-question wait, explicit start, autosave fail/retry, same-timer resume,
  submit failure/committed-retry/exit bytes และ host/context/CSRF/resource negatives
- full suite ล่าสุดผ่าน 236 files / 3,598 tests พร้อม TypeScript, token lint และ guarded
  Next.js 16.3.5 webpack build; real-client browser QA ผ่าน 8 observations ใช้ actual
  WaitingExamRunner/ExamClient กับ browser-only interception: autosave/refusal/offline
  backup/remount/reconnect เวลาเดิม, MCQ, lost-upload-response retry หนึ่ง uploadId/หนึ่ง
  binary/หนึ่ง reference, submit refusal ไม่ออก และ success ไป canonical submitted receipt
  ไม่มี unexpected requests/new active-client errors ไม่ใช่ Auth/DB/Storage/native proof
- Independent PostgreSQL scratch proof02 ผ่าน 3 race rounds แต่ละรอบเห็น 4 backends
  อิสระและสอง active Lock waits ไปยัง held assignment; one allocation, immutable receipt/
  answer snapshots, completed replay, snapshot constraint rollback/ไม่กิน generation และ
  wrong-only carried metadata ผ่าน ล้าง exact owned scratch แล้ว รอบแรก NOT OBSERVED
  เก็บเป็นประวัติ ไม่ลบผลล้มเหลว SQL body ตรง committed/deployed function แต่ rebound
  เฉพาะ private scratch models จึงไม่ใช่ public-RPC/whole-RLS/native integration proof
  CLI startup stagger 2,500ms ไม่ serialize SQL หรือผ่อน strict overlap assertions
- source code+SQL+docs `7cde7b4089092e7e65077094671f892a0e79d5a7` commit/push แล้วก่อน
  mutation; exact dry-run พบเพียง `20261009142610` และ apply บน Staging สำเร็จ parity
  ตรง 141 รายการ ไม่มี local-only/remote-only; live invalid-input permission check ยืนยัน
  anon เรียก RPC ไม่ได้ (`42501`) และ service role ถูกปฏิเสธ invalid input (`22023`)
  ไม่สร้าง attempt/fixture หรือถือว่าเป็น independent concurrent-start/native proof
- deploy เฉพาะ `https://korkru-seb-uat.vercel.app` สำเร็จ จาก source `7cde7b4` ที่ตรึงไว้
  deployment `dpl_H24Jhy2A5YYjjkLKv1L4LZgMRf2r` ตรวจ exact project/source/alias/READY,
  login HTTP 200 + STAGING badge, UI-only lab และ missing-context start denial ผ่าน
  ไม่มี Cron/Production mutation และไม่ได้ merge master; build/runtime flags บังคับ
  `SEB_EXAM_WAITING_ENABLED=false`, manifest `[]` จนมี native final/evidence ใหม่
- **latest verified W6 deployment:** candidate `a6ed37b9a4208812d5dff2873fc7ce635bc73929`
  commit/push ก่อน deploy จาก frozen checkout; `dpl_8PiUS9WjtqFXCHEaFV4ThhJMgQe4`
  ตรวจ exact dedicated project/source/alias/READY, login STAGING badge, UI labs และ
  missing-context canonical start HTTP 403 ผ่าน Build/runtime overrides คง flag=false/
  manifest=[] ไม่มี release activation/master merge/Production/Cron mutation
- เจ้าของอนุมัติ W6 TEST preparation เพิ่มแล้ว: สร้าง fixture ใหม่แยกจาก r2 บน isolated
  Staging ผ่าน real Auth และ actual application actions มี 2 บัญชีสังเคราะห์, 1 ห้อง,
  3 โจทย์ (written/MCQ/file upload), draft fixed `seb_required` exam ที่ไม่มี `access_code`
  และ teacher-owned quit revision 1 (รหัส ASCII 6 หลักเฉพาะ fixture นี้ ไม่ใช่รหัสกลาง)
  Selected actual authenticated read negatives ผ่าน: student อ่าน questions ได้ 0,
  draft assignments ได้ 0 และ registry ถูกปฏิเสธ; teacher อ่าน own rows ได้ตามที่ตรวจ
  ผลนี้ไม่ใช่ whole-flow/direct-RLS proof เพราะบาง application actions ใช้ service role
- scoped prepare สร้าง private seed ใหม่แล้ว 4,039 bytes และ private admin credential;
  ตรวจ seed policy ว่าไม่มี Exam/Settings file-entry password, initial Quit URL ว่าง
  และ scope/filter ตรง revision ใหม่ รายละเอียด nonsecret digest อยู่ในชุดส่งต่อ W6
  ไม่มี native final save, keys, Storage upload/enrollment, publish, start หรือ attempt ใหม่
- **หยุดก่อน W7:** fresh fixture/revision/seed และ machine checks เป็น W6 preparation
  ไม่ใช่ native pass; deployed waiting flag ยัง false/manifest `[]` และ source/alias ของ
  deployment รอบล่าสุด attest แล้ว ไม่เปลี่ยน r2/keys/evidence เดิม Live native
  auth/exit/reconfiguration failure matrix ยัง NOT RUN ไม่ enroll คีย์สมมติหรือยกผล
  r2/local mocks มาปิดช่องว่าง ดูผลแยกแต่ละประเภทใน `SEB_WAITING_ROOM_W6_EVIDENCE.md`

ชุด W6 → W7 อยู่ใน `docs/SEB_WAITING_ROOM_NATIVE_HANDOFF.md`; ห้ามเริ่ม W7 จนเจ้าของ
อนุมัติใหม่ ผล physical S6/r2 เดิมยังไม่ครบและไม่เลื่อนเป็นผ่านจาก implementation นี้

### ขอบเขตและการรบกวนเจ้าของ

- ขอบเขตเริ่มต้นที่เสนอคือ restricted SEB session ของ exact user/assignment/release/revision
  ไม่ล็อกทั้งบัญชีบนทุกอุปกรณ์ ไม่เปลี่ยนการใช้งานเว็บปกติของครู/นักเรียนหรือ Android
  monitored; หากต้องการ account-wide restriction ให้แยกตัดสินใจและประเมิน schema/RLS
- ไม่ถือ query, user-agent หรือการมี JavaScript API เป็นสิทธิ์ ต้องตรวจ native CK+BEK
  และ signed server context ตาม release ก่อนอนุญาตเริ่ม/อ่าน/เขียนข้อสอบ
- รักษาวิธีล็อกอินเดิมที่ประกาศรองรับและตรวจ callback/return target; หาก OAuth/Magic Link
  ต้องขยาย allowlist หรือเปลี่ยนวิธีที่รองรับ ให้แจ้งก่อน ไม่ปิดฟีเจอร์เดิมเงียบ ๆ
- ทำ machine-testable work ให้ครบก่อนขอให้เจ้าของเปิด Windows/Mac/iPad/iPhone หรือ
  เก็บ native keys; ส่งขั้นตอนเหล่านี้เป็นชุดเดียวเมื่อ source/policy นิ่งแล้ว
- แจ้งทันทีเฉพาะสิ่งที่หยุดงานจริง: ต้องยืนยันตัวตน, ขาดสิทธิ์, requirement ขัดกับ native
  behavior, migration/RLS/Storage contract เปลี่ยน หรือข้อมูล/ประวัติ migration ไม่ตรง
  เรื่องทดลองอ่านข้อความ/ตำแหน่งปุ่มที่ไม่กระทบ correctness รวมแจ้งตอนส่งมอบ
- คำสั่งเริ่มแผนนี้ไม่ใช่อำนาจ merge master/deploy Production; การ deploy dedicated UAT
  และ schema/authority-changing migration ต้องได้รับอนุมัติที่ตรงขอบเขต ก่อน mutation

### W1 — ตรึง baseline และพิสูจน์ข้อจำกัด

- ตรวจ branch/upstream/งานอื่นที่เปลี่ยนหลังหยุด; แยก implementation จากไฟล์/fixture ของ r2
- ทำ route/action/resource inventory ตั้งแต่ entry/login/callback ถึง submit/quit รวม
  prefetch, Back, URL ตรง, session expiry และ solution endpoints ของงานอื่น
- กำหนดสถานะก่อน login → ห้องรอ → in progress → submitted/expired โดยไม่ให้สถานะ
  client เป็นผู้เริ่มเวลา/สร้างสิทธิ์ และระบุวิธีรักษา exam context ก่อน native verification
- ตรวจ native Quit URL interception เป็น feasibility gate ต้นงาน: static Quit URL และ
  การซ่อนปุ่มไม่ใช่ authorization; ห้ามอ้างว่าปิดก่อนส่งไม่ได้หากยังเข้าลิงก์ตรงแล้วออกได้

**ผ่านเมื่อ:** มีขอบเขต/negative-test matrix และไม่มีข้อจำกัดที่ยังซ่อนอยู่; ถ้าต้องเปลี่ยน
requirement หรือ Drawing Board contract ให้หยุดถามก่อน ไม่ให้เจ้าของเริ่มตั้งค่า native ใหม่

#### ผลตรวจ W1 เริ่มต้น — 9 ตุลาคม 2026 (ก่อนคำอนุมัติสอง gate)

**สถานะ ณ การตรวจเริ่มต้น:** baseline, route/action inventory และ native source audit เสร็จ; **gate ยังไม่ผ่านในตอนนั้น**
รอเจ้าของตัดสินใจวิธีออกใหม่และอนุมัติ shared database contract ที่จำเป็นก่อน W2–W6
ไม่ใช่ข้อสรุปว่า requirement ทำไม่ได้ แต่ยังไม่มีวิธีทดแทนที่พิสูจน์ครบทุก platform

**Baseline และ isolation**

- เริ่มจาก `4421f63` ที่ `codex/seb-phase-6` และ fetch/upstream ตรงกัน แยก branch
  `codex/seb-exam-only-waiting-room`; ไม่ merge งาน UI/late-submission ของ master ที่ใหม่กว่า
- tracked worktree ไม่มีงานค้าง; `.playwright-cli/` และ `output/` เป็น untracked เดิมและไม่แตะ
- source ของ r2 dedicated UAT ที่บันทึกไว้คือ `07209c7597d8aadc9bbaa5a3e11e0572dfd256ca`
  ไม่ deploy branch ใหม่ ไม่ยกผล source audit เป็นการตรวจ live alias ซ้ำหรือ physical pass
- read-only Staging migration parity ผ่าน 140 รายการ ไม่มี local-only/remote-only ล่าสุด
  `20261006102054`; ไม่ apply/repair SQL และไม่เปิดเผย credential/project ref

**สถานะที่ออกแบบไว้ (ยังไม่ implementation)**

- ก่อน login: signed navigation context รักษาข้อสอบปลายทางเท่านั้น ไม่ใช่สิทธิ์อ่านโจทย์
- ห้องรอก่อนเริ่มครั้งแรก: auth/roster/window/release/native verification; ไม่สร้าง attempt/
  question snapshot หรือเริ่ม timer จากหน้า/GET/RSC/prefetch ถ้ามี active attempt อยู่แล้ว
  ให้แสดงเส้นทาง resume ของรอบเดิม ไม่กล่าวว่าไม่มี attempt หรือเริ่มนับเวลาใหม่
- เริ่มสอบ: explicit server mutation สร้างหรือคืน exact active attempt แบบ atomic/idempotent
  เริ่มเวลาจาก server `started_at`; reload/reconnect/resume ใช้ attempt และเวลาเดิม
- ส่งแล้ว: ยืนยัน committed status ของ exact user/attempt/release ก่อนอนุญาตทางออกปกติ
  response หายต้อง reconcile status ไม่เรียกสร้าง attempt ใหม่หรือเชื่อ client state
- session หมดอายุ/ถูกแก้ไข: ปิดสิทธิ์อ่าน/เขียนจนตรวจใหม่ ไม่ลบเวลา/คำตอบ; exam timeout
  ต้องคง server finalization เดิม การหมดเวลาฝั่ง client อย่างเดียวไม่ใช่ committed submission

**ช่องว่างในเว็บ/ฐานข้อมูล**

- `app/(app)/assignments/[id]/take/page.tsx` render เรียก `startSubmission` จึงใช้เป็นห้องรอ
  ไม่ได้; password login, callback และ profile completion ยังกลับ dashboard/general shell
- `create_seb_submission_with_revision` ใช้ `FOR KEY SHARE` และสร้างเฉพาะ submission header;
  `lib/actions/submissions.ts` insert answer snapshots แยกอีกคำขอ unique attempt constraint
  ป้องกันเลขซ้ำแต่ไม่คืน attempt เดิมให้ผู้แพ้ concurrent start และอาจเหลือ header ไม่มีคำตอบ
  ต้องเพิ่ม service-role-only start RPC/transaction ที่ตรวจสิทธิ์/window/release/limits ซ้ำ
  serialize ให้เข้ากับ revision rotation และ commit header+validated snapshots พร้อมกัน
  นี่เป็น migration/function contract บน shared submissions ที่ต้องขออนุมัติก่อนเปลี่ยน
- `getAttemptSolutions` และ result ของงานอื่นยังอาศัยสิทธิ์บัญชีปกติ ต้องเพิ่ม signed
  restricted-request context และ guard ที่ page/action/read/write/resource ไม่ใช่แค่ซ่อนเมนู;
  absent context ของ request เว็บปกติคงเดิม แต่ missing/expired/tampered context บน
  canonical exam request รวม Server Action ที่ POST ไป exam URL ต้อง fail closed
- Supabase ไม่เห็น application cookie และ RLS ยังให้อ่าน released own answers ตามสิทธิ์เดิม;
  known solution URLs ใน public bucket ยังอ่านได้ ต้องกัน REST/solution asset ด้วย narrow
  native filter; ถ้าใช้ exact exam resource proxy ต้องจับคู่กับ native denial ของ direct
  Supabase REST/public assets ด้วย proxy ลำพังไม่ปิด URL เดิม ไม่อ้างว่า app guard ล็อกทั้งบัญชี
  ไม่เปลี่ยน RLS/Storage เป็น account-wide lock โดยไม่มีการอนุมัติใหม่
- submit retry หลัง response สำเร็จหายยังอาจได้ “ส่งแล้ว” เป็น error ต้อง reconcile committed
  exact attempt ก่อนแสดง exit eligibility; `/exam/quit` HTTP handler ไม่ใช่ native authority

**Native Quit URL: ข้อจำกัดยืนยันจาก official source**

- Windows 3.10.2 commit `397f8e124387c54a9a770809003dd2e31946dcd5` ตรวจ matching Quit URL
  ก่อน URL filter/HTTP; เมื่อ `quitURLRestart=false` handler ขอ termination โดยไม่ตรวจ
  Quit Password (อาจถามยืนยัน yes/no) การซ่อนปุ่ม, deny filter หรือ protected web redirect
  ไป static Quit URL เดิมจึงไม่ป้องกัน direct early quit
  ([request handler](https://github.com/SafeExamBrowser/seb-win-refactoring/blob/397f8e124387c54a9a770809003dd2e31946dcd5/SafeExamBrowser.Browser/Handlers/RequestHandler.cs#L71),
  [native quit](https://github.com/SafeExamBrowser/seb-win-refactoring/blob/397f8e124387c54a9a770809003dd2e31946dcd5/SafeExamBrowser.Browser/BrowserWindow.cs#L591))
- macOS 3.7 commit `88b7f8df3c96781197efe400b8a2cbd818524736` และ Apple 3.7.1 commit
  `a1e3f786aac4aa2e827998dcf8ca139f2c5205a9` intercept ก่อน filter เช่นกัน ทั้งคู่มี nonempty
  guard จึงปิดกลไกนี้ได้ด้วย `quitURL=""`; ไม่ใช่ผลทดลอง native รอบใหม่
  ([3.7](https://github.com/SafeExamBrowser/seb-mac/blob/88b7f8df3c96781197efe400b8a2cbd818524736/Classes/BrowserComponents/SEBAbstractWebView.m#L730),
  [3.7.1](https://github.com/SafeExamBrowser/seb-mac/blob/a1e3f786aac4aa2e827998dcf8ca139f2c5205a9/Classes/BrowserComponents/SEBAbstractWebView.m#L737))

**ทางเลือกที่เสนอ ณ W1 — ต่อมาเจ้าของอนุมัติทางทดลองแรก**

- ทางทดลองที่แคบที่สุด: initial config ไม่มี Quit URL แต่คง teacher-owned emergency hash;
  เปิด secure reconfiguration เฉพาะ same-origin release-specific URL ที่ server ตรวจ exact
  user/attempt/revision/native context และ committed submit ก่อนส่ง terminal config
  terminal config ยังเป็น exam-purpose ชั่วคราวและคง teacher quit hash ไม่ downgrade secure mode
  นี่เปลี่ยน artifact/security contract ปัจจุบันที่ห้าม download/reconfigure และมี static Quit URL
- source ยืนยันว่ากลไกมีจริง แต่ไม่รับรอง cookie handoff, deny/replay, download failure,
  config restart และ passwordless quit บนอุปกรณ์จริง Windows มี session-start failure path
  ที่ shutdown จึงห้ามสมมติว่า HTTP 403/HTML/truncated/invalid config ทุกแบบจะคงล็อกสอบเสมอ
  ต้องพิสูจน์ negative เหล่านี้ใน W7; ไม่ข้าม gate ด้วย mock หรือรายงานว่าแก้ native แล้ว
  ([Windows reconfiguration](https://github.com/SafeExamBrowser/seb-win-refactoring/blob/397f8e124387c54a9a770809003dd2e31946dcd5/SafeExamBrowser.Client/Responsibilities/BrowserResponsibility.cs#L96),
  [failure path](https://github.com/SafeExamBrowser/seb-win-refactoring/blob/397f8e124387c54a9a770809003dd2e31946dcd5/SafeExamBrowser.Runtime/Responsibilities/SessionResponsibility.cs#L132),
  [Apple URL guard/cookies](https://github.com/SafeExamBrowser/seb-mac/blob/a1e3f786aac4aa2e827998dcf8ca139f2c5205a9/Classes/BrowserComponents/SEBBrowserController.m#L702))
- SEB Server มี remote quit instruction แต่ต้องเพิ่ม service/integration และผูก exact native
  connection กับ committed KorKru attempt ไม่ใช่แค่ตั้งค่า ต้องขอขอบเขต infrastructure,
  privacy และค่าใช้จ่ายก่อน ไม่สร้างบริการเพิ่มเอง
  ([official monitoring](https://seb-server.readthedocs.io/en/latest/monitoring.html))
- การให้ใช้รหัสครูหลังส่งทุกครั้งเป็นอีก requirement หนึ่ง ไม่ใช่ fallback ที่เลือกเองได้

**Negative-test matrix สำหรับงานถัดไป**

- Entry/auth: wrong account/roster/assignment; callback/open redirect/context switch;
  OAuth/Magic Link cookie return; absent/expired/tampered restriction marker
- Waiting/start: reload/Back/prefetch ไม่สร้าง attempt/ส่งโจทย์; future/closed windows;
  double click/concurrent start/lost response; snapshot failure ต้อง rollback ทั้ง attempt
- Verification: wrong CK/BEK/exact build/release/revision; session expiry/recheck ไม่ reset เวลา
- Other content: page/URL/RSC/prefetch/action ของงานอื่น รวม POST solution action บน URL
  ข้อสอบที่อนุญาต, Supabase REST และ known public solution asset ที่ native filter ต้องกัน
- Resume/write: reconnect/offline/reload/ออกฉุกเฉินแล้วกลับ ใช้ attempt/เวลาเดิม;
  autosave/upload/proctor/timeout และ normal browser/Android/Drawing Board regression
- Submit: failure/retry/lost success response; reconcile committed exact status; ไม่มี exit
  ก่อนสำเร็จและไม่สร้าง attempt ใหม่เพราะ retry
- Native exit: direct Quit URL ก่อนส่ง; early/expired/wrong account/replay completion download;
  denied/redirect/foreign/local/data/malformed/truncated config; teacher emergency password;
  post-submit quit/reentry/session teardown ทุก platform/exact build ที่จะประกาศ

**การตรวจรอบ W1**

- baseline targeted regression 5 files / 47 tests ผ่าน (`seb-native-version`, version core,
  release migration, exit และ physical evidence checker); ไม่ใช่ tests ของ waiting room ใหม่
- `npx tsc --noEmit` ไม่ผ่าน: TS2339 เดิม 4 diagnostics ใน create-classroom modal/form
  สองไฟล์ ไม่มี application diff รอบนี้ ไม่แก้งานห้องเรียนที่ไม่อยู่ในขอบเขต
- ไม่รัน full test/build/token lint/runtime/native suite เพราะยังไม่เปลี่ยน application;
  source audit ไม่แทน concurrency DB test หรือ physical negative test
- W2–W6 ยังไม่เริ่ม implementation/deploy, W7 ยังไม่เริ่ม; เก็บ r2/fixture/keys/evidence เดิม
  คำถามที่ต้องตอบก่อนต่อคืออนุมัติทดลอง native completion reconfiguration และ additive
  shared start RPC เฉพาะ Staging หรือเลือกแนวทางอื่น ไม่ต้อง login/ตั้งค่าอุปกรณ์ใหม่ตอนนี้

### W2 — Server state, start และเวลา

- ห้องรอ/ตรวจเครื่องไม่สร้าง submission, ไม่เริ่ม timer และไม่ส่งโจทย์/เฉลย
- การกดเริ่มเป็น explicit server mutation; ตรวจ user/roster/เวลาเปิดสอบ/release/session
  ซ้ำ แล้วสร้างหนึ่ง attempt แบบ atomic/idempotent ไม่อาศัย page render/GET/prefetch
- กดซ้ำพร้อมกันหรือ response หายต้องได้ attempt เดิม; reconnect/reload/ออกฉุกเฉินแล้ว
  กลับมาใช้ `started_at` ฝั่ง server เดิม ไม่เพิ่มเวลา ไม่สร้างรอบใหม่ ไม่ถือเป็นการส่ง

**ผ่านเมื่อ:** tests พิสูจน์ zero attempt/zero timer ก่อนปุ่ม และหนึ่ง attempt หลัง concurrent
start/retry พร้อม wrong user/assignment/revision, expired session และ exam window negatives

### W3 — Login และหน้ารอเฉพาะข้อสอบ

- entry ของไฟล์รักษา exact exam context ผ่าน login/callback/profile completion โดยไม่
  ส่งไป dashboard ก่อน ตรวจ return target ฝั่ง server ป้องกัน open redirect/เปลี่ยนข้อสอบ
- ทำ exam-only shell ไม่มีเมนู/โลโก้/แจ้งเตือน/ลิงก์ที่พาออกไปแอปทั่วไป
- ห้องรอมีชื่อข้อสอบ เวลาที่ได้รับ กติกา สถานะตรวจเครื่อง และปุ่มเริ่มที่บอกชัดว่าเวลาเริ่มทันที
  ถ้ายังไม่ถึงเวลา/ตรวจไม่ผ่าน/session หมดอายุ ให้แสดงเหตุผลและทางกู้คืนเฉพาะข้อสอบ
- ห้ามใช้ `/take` แบบปัจจุบันเป็นห้องรอ เพราะ page render เรียก `startSubmission` อยู่

**ผ่านเมื่อ:** local runtime/browser journeys ยืนยัน login กลับข้อสอบถูกชุด, ก่อนเริ่มไม่มี
question/answer-key payload และ reload/Back/prefetch ไม่เริ่มเวลา เว็บปกติยังทำงานเหมือนเดิม

### W4 — ป้องกันหน้าอื่น, recovery และทางออก

- บังคับขอบเขตทั้ง page/Server Actions/API/solution reads ไม่ใช่เพียงซ่อนเมนู; ตรวจ
  direct request, URL ของงานอื่น และ context หาย/หมดอายุแบบ fail closed
- รักษา autosave/offline queue/upload/proctor/timeout ของ attempt เดิมและข้อความกู้คืน
- ทางออกบนเว็บเกิดหลัง committed submit เท่านั้น; submit/network failure ต้องไม่แสดง
  ทางออกสำเร็จ และต้องไม่วนสร้าง attempt ใหม่เมื่อ retry
- ตรวจ native early-quit/direct-link, teacher-owned emergency password และ native
  passwordless quit หลัง submit แยกจาก web authorization ไม่ยก browser mock เป็น native pass

**ผ่านเมื่อ:** negatives ทุก boundary ผ่าน, timer/answers ไม่ reset ใน tests และประเด็น
native ที่ยังต้องพิสูจน์ถูกระบุชัด หาก guarantee ทำไม่ได้ให้รายงานก่อนลด requirement

### W5 — Automated regression และ integrated mock

- รัน targeted/full tests, TypeScript, token lint, production build และ Next runtime ตาม
  ไฟล์ที่แก้ รวม normal exam/exercise, Android monitored และ shared Drawing Board regression
- ทดสอบ login → waiting → explicit start → autosave/reconnect/resume/upload →
  submit failure/retry → submitted exit state บน synthetic fixture แยกจาก r2 เดิม
- เพิ่ม wrong account/roster, wrong CK/BEK/build/revision, expired/tampered context,
  URL/action ของงานอื่น, concurrent start และ lost response
- หากต้องทดสอบเว็บ deploy ให้ใช้ dedicated UAT ที่ได้รับอนุมัติ พร้อม source/alias/DB
  isolation attestation; ไม่ apply migration เหมารวมเพื่อแก้ ledger gap
- tests ที่จำลอง native API/registry เป็น machine evidence เท่านั้น การทดสอบ live ที่ต้อง
  registered final release ใหม่รอ W7 หลัง native enrollment ไม่ปลอม keys หรือข้าม prerequisite
  เพื่อรายงานว่า integrated native journey ผ่านก่อนเจ้าของได้ทำขั้นจำเป็น
- ผล composed server journey อยู่ใน `lib/seb-waiting-journey.test.ts`; แยกจากผล rendered
  actual-client QA ใน `scripts/seb-waiting-client-browser-qa.mjs` และ PostgreSQL scratch
  proof ใน `scripts/seb-waiting-postgres-concurrency.mjs` ซึ่งผ่านตามขอบเขตของแต่ละชุด
  ไม่เรียกรวมเป็น live canonical Auth/PostgREST/RLS/native pass

**ผ่านเมื่อ:** machine-testable checks ผ่านครบหรือมี pre-existing unrelated blocker ที่
รายงานตรง ๆ; ห้ามกล่าวว่า native/S6 เสร็จจาก mock และยังไม่ส่งภาระให้เจ้าของลองแก้ config

### W6 — เตรียม release ใหม่และชุดส่งต่อ native

**ผลปัจจุบัน:** fresh synthetic draft/current teacher revision และ private seed เตรียมแล้ว
ภายใต้คำอนุมัติ W6 TEST; native final/enrollment/activation ยังไม่เริ่ม Machine validation
และ candidate deployment/source/alias attestation ผ่านตามรายการด้านบน ไม่ให้สร้าง
fixture ซ้ำเพื่อแทน unknown outcome ไม่แก้ r2 หรือบันทึก credentials/private entity IDs

- หลัง route/policy นิ่งจึงทำ seed/materializer/validator ให้ Start URL เป็น entry ของ
  ข้อสอบและ allowlist เฉพาะ auth/ข้อสอบ/resources ที่จำเป็น ไม่อนุญาตทั้ง origin เหมารวม
- เตรียม fixture/revision/candidate ใหม่แยกจาก r2; เก็บ r2-final/release/หลักฐานเดิมไว้
  ไม่หมุน revision ที่มี attempt กำลังทำ และไม่ออก CK/BEK สมมติเป็นคีย์จริง
- การเปลี่ยน `.seb` ทำให้ต้องใช้ final bytes/native CK+BEK ชุดใหม่จาก exact builds;
  เตรียม checklist, private handoff และ enrollment dry-run ให้เจ้าของทำรอบเดียว
- ก่อน rollout ตรวจ exact source/deployment/alias, release byte digest/size และ migration
  parity; schema apply ต้องผ่านคำอนุมัติและรายงาน Git/Staging DB/Production DB แยกกัน

**ผ่านเมื่อ:** มีชุดส่งต่อครบและ source/policy ไม่เปลี่ยนระหว่างเก็บ native keys;
สถานะเป็น **รอ final native save/enrollment** ไม่ใช่พร้อมใช้จริง ยังไม่ลงทะเบียนคีย์ที่ไม่ได้เก็บ

**ผล 10 ตุลาคม 2026:** W6 software/preparation/deploy DONE ตาม scoped evidence ใน
`SEB_WAITING_ROOM_W6_EVIDENCE.md`; ไม่มีงาน native อัตโนมัติต่อ หยุดรออนุมัติ W7

### W7 — เจ้าของทำ native ขั้นจำเป็น แล้วปิด gate

- แจ้งเจ้าของเป็นชุดเดียวเมื่อพร้อม: ครูตั้งรหัสออกเฉพาะ revision ใหม่ผ่านเว็บ, final save
  ด้วย native tool ถ้าจำเป็น, เก็บ CK/BEK ทาง owner-only channel และยืนยัน exact builds
- เปิดไฟล์เดียวกันบน Windows → Mac → iPad → iPhone ทดสอบไม่มี Exam/Settings Password,
  login เข้าห้องรอ, ก่อนกดเวลาไม่เดิน/ไม่เห็นโจทย์, กดเริ่มครั้งเดียวและไปหน้าอื่นไม่ได้
- ทดสอบ offline/resume เวลาเดิม, upload, submit failure/success, wrong/emergency quit,
  native quit หลังส่ง, wrong/modified config และ normal-browser rejection
- ล็อก candidate ใหม่ก่อนรับ physical results; ไม่ยกหลักฐานของ r2 เดิมข้าม source/config
  และไม่ทดสอบหลาย candidate ปะปนกัน ต้องแก้ bug แล้ว reset suite ที่ได้รับผลกระทบตามจริง

**ผ่านเมื่อ:** physical gates ครบ platforms ที่จะประกาศรองรับ และรับรอง native restrictions
ตามหลักฐานจริง จึงกลับมาปิด S6; S7 เดิม/merge master/Production รอการอนุมัติแยก

### จุดหยุดและสถานะการเข้าถึง

- หยุดเฟสที่พบข้อมูล/เฉลยรั่ว, เวลาเริ่มก่อนกด, start ซ้ำ, early native quit ที่ไม่ผ่าน
  requirement, source/revision drift, การเปลี่ยน contract สำคัญ หรือ migration mismatch
  ทำได้เฉพาะงานอิสระที่ปลอดภัยต่อ ไม่เดินข้าม dependency/gate และไม่พักข้อผิดพลาดไว้ท้ายงาน
- 9 ตุลาคม: `gh api user` ผ่านและ Git fetch/upstream ตรงกัน Vercel API เดิมตอบ 403
  แต่ CLI ต่ออายุ session บัญชีเดิมได้ จากนั้น authenticated read ตรวจ exact dedicated
  project/source/alias/READY/login/Staging badge ผ่าน ไม่ต้องให้เจ้าของ login ใหม่ตอนนี้
  สิ่งนี้ไม่รับประกันว่าการเชื่อมต่อจะไม่หมดอายุภายหลัง หากต้องยืนยันใหม่จะแจ้งทันที
- รอบวางแผนเสนอและบันทึกแผนเท่านั้น ต่อมาเจ้าของอนุมัติ W1–W6 เฉพาะเว็บทดสอบ;
  W1 พบ native/shared-contract gate ด้านบน จึงหยุดก่อน W2 ไม่เปลี่ยน r2 candidate
- ผลรอบวางแผน: `git diff --check` ผ่าน, evidence regression 1 file / 8 tests ผ่าน และ
  candidate/schema gate เดิมผ่าน แต่ physical aggregate ยัง NOT READY ตาม cases ที่ pending;
  ไม่รัน full tests/TypeScript/lint/build ซ้ำ เพราะแก้เฉพาะเอกสาร ไม่ apply migration/deploy

## เฟส S6 — Physical platform gate

ทำซ้ำบน macOS, iPadOS, iOS และ Windows ด้วย production config revision และ build ที่จะประกาศจริง

**สถานะ: กำลังดำเนินการ** — เพิ่ม fixed-schema evidence แยกที่
`config/seb-physical-uat-evidence.json`, ตัวตรวจ `npm run check:seb-physical-uat`,
ตัวนำทีละขั้น `npm run next:seb-physical-uat` และ runbook
[`SEB_PHASE6_PHYSICAL_UAT.md`](./SEB_PHASE6_PHYSICAL_UAT.md) แล้ว สถานะทั้งหมดจงใจเป็น
`pending` จนกว่าจะล็อก assignment-specific artifact candidate และทดสอบอุปกรณ์จริง

S6 ห้ามนำ Windows-only release จาก S5 ไปใช้ข้าม platform เพราะ release immutable และยังไม่มี
BEK ของ macOS/iPadOS/iOS ต้องสร้าง synthetic assignment revision ใหม่ ใช้ artifact bytes เดียวกัน
ทุกระบบ เก็บ BEK ของ exact build ทั้งหมดผ่าน local secret channel **ก่อน** registration ครั้งเดียว
และห้าม re-save candidate ระหว่างเก็บ BEK

อัปเดต 8 ตุลาคม 2026: r1 ไม่ผ่าน Windows launch จาก URL-filter origin เก่า; materializer
แก้แล้วและรอบ r2 เก็บ native evidence ครบสี่ targets (สาม unique builds) จาก final bytes
ชุดเดียวแบบ passwordless พร้อม teacher-owned quit revision 2 ยืนยัน authenticated Vercel
metadata หลังล็อกอิน CLI ใหม่แล้ว ลงทะเบียน immutable release r2 และอ่าน file digest/size
และ native keys กลับมาตรวจตรงครบ จากนั้น publish ผ่าน UI ครูสังเคราะห์และตรวจ status ในฐาน
เป็น published Candidate `seb-s6-20261008-r2` ล็อก source/deployment/release ใหม่และ reset
ทั้ง 32 cases เป็น pending ห้ามนับ enrollment/การเก็บคีย์เป็น physical UAT ผ่าน
local/Staging migration history ตรงกัน 140 รายการถึง `20261006102054`; งาน late-submission
ใหม่บน master ยังไม่อยู่ Staging จึงไม่ merge/apply งานนั้นในรอบนี้ ไม่มี migration apply/repair,
deploy หรือ Production mutation Regression ของ integration commit เดิมผ่าน 209 files /
2,839 tests, TypeScript, token lint และ production build จุดทำต่อคือ Windows launch แล้ว
system check ตาม runbook S6 ด้านบน

ผล Windows รอบ r2 วันที่ 8 ตุลาคม: ภาพ system check ยืนยัน `failed` ที่ version parsing
ก่อนตรวจ CK/BEK; native Windows ใช้ `SEB_Windows_3.10.2.920` แต่ parser รองรับเฉพาะ
five-part format รอบก่อนแพตช์ หลังอนุมัติแก้ strict Windows grammar พร้อม regression แล้ว
deploy เฉพาะ dedicated UAT จาก frozen parent โดยไม่รวมงานอื่น: source `9390ab91d14a4a7649becc89b65e14a692ed7218`,
deployment `dpl_CDU2Yk9HWLGTj1C5YMNGwwguLFyD`, candidate `seb-s6-20261008-r2-winfix`
ตรวจ authenticated source/alias/READY/login badge และ immutable r2 release เดิมผ่าน
reset 32 cases เป็น pending ของ deployment ใหม่; ไม่แก้ final bytes ไม่เก็บ native keys ใหม่
ไม่หมุนรหัสออก ไม่ apply migration และไม่แตะ Production สำเนาที่ deploy ผ่าน 2,504 tests,
TypeScript/lint/build; main ผ่าน 2,864 tests และ TypeScript แต่ build ติด preexisting union
type errors ในฟอร์มห้องเรียนที่ไม่อยู่ scope ขั้นถัดไปกด **ลองตรวจใหม่** บน Windows
system check โดยยังไม่เริ่มข้อสอบ ล่าสุดภาพจากเจ้าของยืนยัน Windows system check ผ่าน
ทั้งสี่แถวแล้ว และเจ้าของยืนยัน Windows passwordless launch โดยตรง จึงผ่านสองเคสนี้
อีก 30 cases pending ขั้นถัดไปเริ่มเคส autosave/reconnect/upload/submit โดยเข้าโจทย์ก่อน
และตรวจทีละขั้น ไม่ต้องตั้งค่า/เก็บคีย์ใหม่ ดู runbook สำหรับ source lock

ผลขั้นเริ่มสอบ Windows ถัดมาถูกปฏิเสธที่ URL-bound CK/BEK hash verification ก่อนเห็นโจทย์
จึงบันทึกเคสสอบรวม failed (substeps ยังไม่เริ่ม) source/alias ยังตรง lock สงสัย Next SPA
navigation คง native Windows API hashes ของ document URL เดิม เพราะ official updateKeys
เป็น callback-only และฉีด hashes ใน OnContextCreated ขั้นวินิจฉัยคือปุ่ม **ขอรหัสตรวจสอบใหม่**
ซึ่ง full-navigate เพียงครั้งเดียว ไม่ต้องเปลี่ยนไฟล์/รหัส/คีย์ ยังไม่ได้แก้ application/deploy
และยังไม่ยืนยันสาเหตุจาก native request hashes ดู runbook สำหรับหลักฐานและข้อจำกัด

รายงานถัดมาว่า “ยืนยันสำเร็จ” สีเขียวชั่วครู่แล้ววนแดง ทำให้ตรวจพบ root bug เพิ่มเติม:
signed-session reader ยังใช้ five-part version grammar เก่า และ production primitive sign→read
คืน null สำหรับ native compact Windows แม้ action ยืนยันผ่านแล้ว รวม grammar เป็น
`lib/seb-version-core.mjs` และขยาย regressions ข้าม real verification/cookie/session/access/
attempt resume (external dependencies mocked) โดยรักษา HMAC/expiry/context/platform gate
สำเนา source `07209c7` เตรียมจาก frozen deployment parent โดยไม่รวมงานอื่น ผ่าน 2,536 tests,
TypeScript/lint/build; main ผ่าน 2,887 tests แต่ type gate ยังติดฟอร์มห้องเรียนเดิม
rollout dedicated UAT และ post-deploy attestation ผ่านแล้ว: deployment
`dpl_4DRgqUQV1W7SmJYRsT7w2d6Y4yhE`, candidate `seb-s6-20261008-r2-sessionfix`
ล็อก source/deployment กับ release commitment เดิมและ reset 32 cases pending โดยเก็บผลรอบเก่า
ใน runbook จุดทำต่อคือ Windows หน้า launch gate เดิมกด **ขอรหัสตรวจสอบใหม่** หลังแพตช์
อีกครั้งเพียงครั้งเดียวเพื่อ full navigation รับหน้าใหม่ แล้วแจ้งโจทย์/error โดยยังไม่ submit
ไม่เปลี่ยน final r2/release/keys/passwords/schema/Production และไม่ยกผลจำลองเป็น physical pass

**Agent ทำ:** เตรียม checklist ทีละขั้น, ตรวจผลที่ไม่เป็นความลับ, แก้บั๊ก, reset เฉพาะ suite ที่
ได้รับผลกระทบ และรัน regression ก่อนออก candidate ใหม่

**เจ้าของผลิตภัณฑ์มีส่วนร่วมโดยตรง:**

- เปิด native SEB และทำ system check
- ทำข้อสอบจำลองครบ autosave/reconnect/upload/submit/quit
- ทดสอบ wrong config, modified config, wrong quit password และ normal browser rejection
- แจ้งเฉพาะ OS/SEB version, case และ pass/fail ไม่ส่ง CK/BEK/password/token

**เกณฑ์ผ่าน:** `config/seb-platform-evidence.json` ผ่านทุก gate สำหรับ config/build เดียวกัน
ทั้งสี่ platform ที่ประกาศรองรับ

## เฟส S7 — ห้องสอบจำลองและ recovery drill

**Agent ทำ:** เตรียม fixture/checklist, ตรวจ server logs แบบไม่เก็บข้อมูลลับ, วิเคราะห์ failure,
แก้ไขและทดสอบซ้ำ รวม load/connection budget ตามขอบเขตที่ staging รองรับ

**เจ้าของผลิตภัณฑ์มีส่วนร่วมโดยตรง:** ใช้สองบัญชี/สองเครื่องและ Wi-Fi ห้องจริง ทดสอบเน็ตหลุด
กลับมา, pending sync, reload/resume, เวลาหมด, upload ล้มเหลว, Realtime fallback,
หลายหน้าต่าง, ครูรับทราบ event และ emergency exit โดยไม่ใช้ข้อมูลนักเรียนจริง

**เกณฑ์ผ่าน:** ไม่มีคำตอบหาย/ซ้ำ, เวลาไม่เพิ่ม, attempt ไม่ข้ามผู้ใช้, ห้องคุมสอบไม่กล่าวหา
จาก signal เดียว และ recovery ทำตาม runbook ได้จริง

## เฟส S8 — Lock, pilot และ release

**Agent ทำ**

- ล็อก source revision + Staging deployment + SEB config เป็น candidate ใหม่หลังโค้ดนิ่ง
- อัปเดตเฉพาะ Exam/SEB evidence ที่มีผลจริงและเก็บ cleanup เป็นขั้นสุดท้าย
- รัน test/typecheck/token lint/build และ release gates จาก commit เดียวกัน
- ตรวจ final diff, stage เฉพาะไฟล์ SEB/Exam, commit/push branch และรายงาน migration,
  Staging/Production, checks ที่รัน/ไม่ได้รัน และผลกระทบ Drawing Board
- เตรียม rollback/support checklist และข้อจำกัด platform ที่จะประกาศ

**เจ้าของผลิตภัณฑ์มีส่วนร่วม:** อนุมัติกลุ่ม pilot, production environment/config,
merge เข้า `master` และ deploy Production แยกกันอย่างชัดเจน จากนั้นร่วมทำ pilot ห้องเล็ก
ก่อนขยายการขาย

**เกณฑ์ผ่าน:** release gates ผ่าน, pilot ครบเส้นทาง, rollback ตรวจแล้ว และไม่มี blocker สำคัญ
ด้านสิทธิ์/ข้อมูล/การเข้าออก จึงค่อยประกาศว่า SEB v1 พร้อมใช้จริง

## ลำดับการทำงานและจุดที่ต้องหยุด

1. Agent ทำ S0–S1 ต่อได้โดยไม่ต้องรอ manual test
2. S2 ต้องให้เจ้าของผลิตภัณฑ์ช่วย native BEK/config policy
3. S3 Agent พัฒนาได้ แล้วให้เจ้าของลอง UX สั้น ๆ
4. S4 เป็น decision + native proof gate; ห้ามซ่อนข้อจำกัดหรือสร้าง service มีค่าใช้จ่ายเอง
5. S5 ทำหลังได้รับอนุมัติ deployment/candidate และมี Staging secrets ที่ฉีดอย่างปลอดภัย
6. S6–S7 ต้องทำร่วมกับเจ้าของผลิตภัณฑ์บนอุปกรณ์จริง
7. S8 ต้องได้รับคำสั่ง merge/deploy Production โดยตรง ห้ามอนุมานจากคำว่า “ทำต่อ”

แต่ละเฟสที่แก้ไฟล์ต้องจบด้วย final diff, checks ตาม `AGENTS.md`, commit ที่เป็นหน่วยเดียวและ
push ไป branch SEB ก่อนเริ่มเฟสถัดไป ห้ามแก้หรือยกสถานะ Drawing Board UAT ระหว่างทาง
