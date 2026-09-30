# SEB Phase S6 — Physical platform UAT

อัปเดต: 30 กันยายน 2026 · **กำลังดำเนินการ — candidate r1 ไม่ผ่าน Windows launch และต้องออก revision/candidate ใหม่ก่อนทดสอบต่อ**

เฟสนี้พิสูจน์ assignment-specific `.seb` artifact เดียวกันบน Windows, macOS,
iPadOS และ iPhone/iOS จริง หลัง authenticated Staging mock ของ S5 ผ่านแล้ว
ผลจากไฟล์กลางรุ่นเก่า, native lab, browser จำลอง หรือคนละ artifact ห้ามนำมารวมกัน

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

## Candidate ปัจจุบัน

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

### Synthetic fixture รอบปัจจุบัน

- สร้างบัญชีครู/นักเรียน, personal workspace, ห้องเรียน, สมาชิกห้อง และโจทย์สังเคราะห์
  ผ่าน UAT UI จริงแล้ว; credential และ resource ID อยู่ใน local owner-only state นอก Git เท่านั้น
- สร้างข้อสอบออนไลน์แบบ `seb_required` แล้ว โดยช่องรหัสผ่านเข้าทำว่าง,
  teacher-owned Quit/Unlock Password ผ่าน policy 20–64 ตัว และ revision ปัจจุบันเป็น revision 1
- Final Save บน Windows สร้าง artifact เดียวแบบ read-only แล้ว; operator ตรวจ policy และเก็บ CK/BEK
  จาก Windows, macOS, iPadOS และ iOS exact build ผ่าน owner-only channel โดยไม่ส่งค่าเข้า Git/แชต
- ลงทะเบียน immutable release บน Supabase Staging สำเร็จและเผยแพร่ข้อสอบผ่าน UI ครูจริงแล้ว;
  ฐานยังเก็บ Quit/Unlock Password เฉพาะ SHA-256 และยังไม่มี attempt ก่อนเริ่ม physical UAT

## ช่องว่างที่ต้องปิดก่อนทดสอบอุปกรณ์

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
คำสั่งที่สองบอกงานถัดไปเพียงหนึ่งข้อ Evidence ปัจจุบันล็อก source/deployment/release เดียวกันแล้ว
และ `NOT READY` เหลือเฉพาะ OS metadata กับผลเครื่องจริงที่ยังจงใจเป็น `pending`

หลัง physical evidence ผ่านครบ Agent จึงอัปเดต aggregate
`config/seb-platform-evidence.json`, รัน regression + `check:seb-platforms` และปิด S6
โดย **ยังไม่เริ่ม S7** จนเจ้าของผลิตภัณฑ์สั่งต่อ
