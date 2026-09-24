# แผนปิดงาน Safe Exam Browser หลัง Drawing Board

อัปเดต: 23 กันยายน 2026

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
- Staging revision ถัดไปต้องตั้ง native Quit URL เป็น `/exam/quit`; หน้าผลการส่งแสดงลิงก์นี้เฉพาะ attempt ของ
  นักเรียนที่ถูกตรวจ SEB แล้ว ลิงก์เป็นเพียงทางออกหลัง submit ไม่ใช่ authorization boundary และ
  ยังต้องผ่าน native test ว่าปิดโดยไม่ถามรหัสจริง

**เจ้าของผลิตภัณฑ์มีส่วนร่วม:**

- ทดสอบ native exit/resume บน Mac/iPad/iPhone/Windows ตามเคสที่ Agent เตรียม
- ยืนยัน UX การตั้ง/ยืนยัน/รีเซ็ตรหัสของครู รวมถึงข้อความว่ารหัสเดิมเรียกดูย้อนหลังไม่ได้
- หากต้องมี service เพิ่ม ค่าใช้จ่าย หรือ production migration ต้องอนุมัติแยกก่อน

**เกณฑ์ผ่าน:** มีขอบเขตที่พิสูจน์ได้จริงและข้อความผลิตภัณฑ์ตรงกับ assurance ที่ได้ หาก managed
exit ยังไม่ผ่าน ให้ปิด capability นั้นและไม่ใช้เป็นเงื่อนไขขวางการเปิด v1

## เฟส S5 — Staging integration และ mock exam อัตโนมัติ

**สถานะ: composite/preflight/reservation/cleanup รอบปัจจุบัน deploy/apply เฉพาะ isolated Staging แล้ว;
ยังไม่ผ่าน live mock** —
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
ที่อัปโหลดสำเร็จแต่ response หายโดยไม่สร้าง path ซ้ำ ชุด S5 ผ่าน 18 files / 522 tests, ทั้งโครงการผ่าน
157 files / 2,253 tests และ TypeScript/syntax/runtime checks ผ่าน

ยังไม่อนุญาต live mock จนกว่าจะมี concrete private ticket/selector provider ที่ทำ marker และตรวจความสัมพันธ์
ของรายการจริงแบบ step-specific และต่อ operation runtime เข้ากับ live runner โดยไม่เปิด Page, credential หรือ
service-role client ออกจาก private closure นอกจากนี้ยังขาด
native/expiry capabilities, final `.seb` + CK/BEK จาก Windows,
automation bypass แบบ server-only และ authenticated durable evidence จาก source/deployment/config เดียวกัน
จึงยังเป็น **NOT READY**, ห้ามเริ่ม S6 และ Production ไม่เปลี่ยน

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

## เฟส S6 — Physical platform gate

ทำซ้ำบน macOS, iPadOS, iOS และ Windows ด้วย production config revision และ build ที่จะประกาศจริง

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
