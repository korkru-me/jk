# ห้องสอบ SEB — ส่งต่องาน W6 ไป W7

อัปเดต 9 ตุลาคม 2026 · profile `waiting-room-completion-experimental-v1`

## สถานะและจุดหยุด

**W7: NOT RUN / native proof: `pending_w7`.** เอกสารนี้เป็น runbook สำหรับ operator ในรอบที่เจ้าของอนุมัติเริ่ม W7 ภายหลัง ไม่ใช่คำสั่งให้เริ่มตอนนี้ และไม่ใช่ผลผ่านจากอุปกรณ์จริง

งาน operator W6 ตรวจในเครื่องด้วยข้อมูลสังเคราะห์: 3 suites / 100 tests ผ่าน รวม strict parser, fixed-pilot predicate, private-file guard, mocked Storage/RPC, immutable bytes และ output reconciliation; Node syntax checks ผ่าน ไม่มี live environment, DB, Storage, native SEB หรือไฟล์ r2 ถูกใช้ในการตรวจนี้ การทดสอบ PGlite ที่มี connection เดียวไม่ใช่หลักฐานการแข่งขันของ PostgreSQL หลาย transaction อิสระ

ยังไม่มี seed, native final, evidence, terminal artifact หรือ release ใหม่ที่สร้างจาก runbook นี้ ชื่อไฟล์/path/ค่าที่อยู่ในวงเล็บมุมด้านล่างเป็น **placeholder สำหรับ operator-run เท่านั้น** ห้ามเติมคีย์เดา ห้ามถือว่าคำสั่ง dry-run หรือ tests ผ่านแทน native pass และห้ามยกผล/คีย์/evidence/deployment ของ r2 มาใช้กับ profile ใหม่นี้

หยุดที่ W6: ไม่เปิด Configuration Tool, ไม่สร้าง/บันทึกไฟล์ native, ไม่ enroll/upload/register, ไม่แก้ cloud environment และไม่ขอให้เจ้าของเริ่มทดสอบอุปกรณ์ในรอบส่งต่อนี้

## เงื่อนไขก่อนเปิดรอบ W7

- เจ้าของเลือกและอนุมัติ **ข้อสอบสังเคราะห์ใหม่** ของครู/นักเรียน/ห้องเรียนสังเคราะห์บน dedicated SEB UAT เท่านั้น ไม่ใช้ข้อมูลจริงหรือ artifact เก่า ข้อสอบเริ่มต้นเป็น online exam แบบ fixed ปกติ มีโจทย์ที่ตรวจอัตโนมัติและโจทย์เขียน/แนบวิธีทำสำหรับทดสอบ Drawing Board; ยังไม่ใช้ streak pilot จนผ่าน atomic streak-verdict/summary check ที่ได้รับอนุมัติเฉพาะทางนั้น ข้อนี้จำกัด pilot ไม่ได้เปลี่ยน contract ของ max attempts หรือ wrong-only retry ทั่วระบบ
- ตอน prepare/enroll ต้องเป็น **draft**, `seb_required`, ไม่มี active attempt, มี current teacher-owned revision ที่ org/owner ตรงกับ assignment และยังไม่มี release ของ revision นั้น ครูเลือก Quit/Unlock Password ใหม่ผ่านเว็บที่ผูก exact revision; ไม่ใช้รหัสกลางหรือรหัสเดิมจาก r2 และไม่ rotate ระหว่างมี attempt
- Operator apply บังคับ pilot ด้วย `SELECT id` ที่จำกัด assignment และ predicate `type=exam`, `mode=online`, `secure_browser_mode=seb_required`, `completion_rule=fixed`, `access_code IS NULL` โดยไม่อ่านค่ารหัส/โจทย์ หากไม่ตรงให้หยุดด้วย `SEB_WAITING_OPERATOR_ASSIGNMENT_UNSUPPORTED`; streak candidate หรือข้อสอบมี code จึงไม่ไปถึงการสร้างไฟล์/enroll W7 ปลด pilot guard ต้องเป็นงานที่เจ้าของอนุมัติแยกหลัง atomic check ไม่ใช่ flag ที่ operator ข้ามได้ เว็บปกติยังใช้ contract เดิม ห้ามแก้ไฟล์ SEB ให้ถามรหัสแทน
- ล็อก exact source commit/deployment/alias ของ candidate ใหม่ พร้อม DB migration parity และ atomic-start authorization check ที่เกี่ยวข้องก่อน pilot; หากมี gap ให้หยุด ไม่ apply/repair/reset DB เป็นทางลัด ตรวจ badge `STAGING · ระบบทดสอบ` ในทุก manual journey ผลของ candidate เก่าไม่ยกมารวม
- เตรียมวิธี fault injection/negative request ด้วย fixture สังเคราะห์ที่อนุมัติไว้ล่วงหน้า ห้ามเปิด developer console, address bar, downloads หรือ filter wildcard เพิ่มในไฟล์จริงเพื่อให้ทดสอบสะดวก หากสร้าง negative บนอุปกรณ์นั้นอย่างปลอดภัยไม่ได้ ให้บันทึก blocked ไม่ใช่ passed

## ขอบเขต environment และข้อมูลลับ

คำสั่งใหม่ใช้ dedicated origin `https://korkru-seb-uat.vercel.app` และ Staging Supabase `https://dyuxkrzeveknqgtuzpbh.supabase.co` เท่านั้น ต้องผ่าน guard เดิมเรื่อง isolation/credentials และมีค่าต่อไปนี้ตรงตัว:

- `KORKRU_DEPLOYMENT_ENV=staging`, `EXAM_QA_ENVIRONMENT=staging`
- `SEB_UAT_ISOLATED_PROJECT=true`, `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL=korkru-seb-uat.vercel.app`
- `SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS=true`, `SEB_EXAM_WAITING_ENABLED=true`
- `VERCEL_ENV` ต้องผ่าน Staging deployment guard: Preview หรือ dedicated UAT production-hosted project ที่ allowlist ไว้ ไม่ใช่ Production KorKru

`--env-file` เป็นไฟล์ private ของ operator; หากไม่ระบุใช้ `.env.qa.local` ตาม command และ process environment ที่ inject จะ override ค่าไฟล์ ห้ามพิมพ์/dump env, service key, CK, BEK, teacher password หรือ admin password ลง console/chat/Git/screenshot

ใช้ private working directory ใหม่นอก Git จำกัดเจ้าของคนเดียว (POSIX directory 0700/files 0600 หรือ owner-only ACL บน Windows) ตรวจ ACL เองบน Windows เพราะ POSIX permission guard ไม่พิสูจน์ NTFS ACL ห้ามส่ง private env/evidence/admin file ให้นักเรียน ไฟล์ config มี password hash แต่ต้องไม่มี plaintext password หรือ Exam/Settings file-entry password

Administrator Password ถูกสุ่มใหม่อย่างแข็งแรงต่อ seed: random 24 bytes เป็น plaintext 32 ตัวอักษรแล้ว hash; ไม่สืบทอด admin hash จาก template/r2 และไม่เท่ากับ teacher exit hash ค่า plaintext ไม่แสดงบนเว็บหรือ console และไม่เก็บใน DB `--admin-password-output` เขียนเฉพาะ private file แบบ `wx`/0600 เมื่อ operator ต้องใช้ใน native tool; ถ้าไม่ระบุจะไม่เก็บ plaintext ไว้ให้เรียกคืน นักเรียนต้องเข้า initial file ได้โดย **ไม่ถามรหัสก่อนเว็บ** การใช้ admin credential ในงานตั้งค่าของ operator ไม่ใช่รหัสเข้าสอบของนักเรียน

## คำสั่งใหม่ — ใช้โดย operator หลังอนุมัติ W7 เท่านั้น

ไม่ใช้ `prepare-assignment-seb-artifact.mjs` / `enroll-assignment-seb-artifact.mjs` กับ profile ใหม่นี้ Legacy inspector ตั้งใจไม่ยอมรับ waiting/reconfiguration policy และ command เดิมไม่ถูกเปลี่ยน

ทุกตัวอย่างต่อไปนี้ **ยังไม่รัน** และ literal placeholder ไม่ใช่ค่าที่ใช้งานได้ ตัวอย่างเป็น Node CLI สำหรับ operator ไม่ใช่คำสั่งให้นักเรียนรันบนเครื่องสอบ Output ต้องเป็น path ใหม่ ไม่ชน template/final/env/evidence หรือ output อื่น ไม่ overwrite ไฟล์เดิม

### Prepare dry-run — ไม่มี network/context/credential generation/output write

```sh
node scripts/prepare-waiting-seb-artifact.mjs \
  --assignment '<NEW_SYNTHETIC_ASSIGNMENT_UUID>' \
  --revision '<CURRENT_TEACHER_REVISION_INTEGER>' \
  --template '<PRIVATE_WORK_DIR>/approved-fresh-template.xml' \
  --output '<PRIVATE_WORK_DIR>/waiting-seed.seb' \
  --admin-password-output '<PRIVATE_WORK_DIR>/admin-password.txt' \
  --env-file '<PRIVATE_OPERATOR_ENV_FILE>'
```

Dry-run ตรวจ local arguments/environment/template เท่านั้น รายงาน `contextVerified:false`; ไม่รับรอง draft/current owner/current hash/no release เพราะยังไม่ได้อ่าน DB หากต้องรองรับ Google OAuth ให้เพิ่ม **flags ชุดเดียวกันในทั้ง prepare และ enroll**:

```sh
--auth-origin 'https://dyuxkrzeveknqgtuzpbh.supabase.co' \
--auth-origin 'https://accounts.google.com'
```

เป็น finite exact origins ไม่ใช่ `*.google.com`/site-wide wildcard Profile อนุญาตเฉพาะ auth paths ที่กำหนดและ same-origin callback; ไม่เปิด Supabase REST/Storage, dashboard, งานอื่นหรือ arbitrary provider content การ redirect/provider/cookie return จริงยังต้องพิสูจน์ใน W7 หากใช้ password login อย่างเดียว ไม่ต้องเพิ่ม auth-origin flags

### Prepare apply — อ่าน scoped DB context และเขียน private seed/optional admin file

หลัง operator ยืนยัน target และ owner/revision ให้ใช้คำสั่ง prepare เดิมแล้วเพิ่ม `--apply` เท่านั้น Apply จะ recheck current tenant/teacher revision/no active attempt/no release และ passwordless assignment ก่อนสุ่ม credential; ไม่ upload หรือ register release Seed ใหม่มี canonical Start URL `/exam/<assignment>/r/<revision>/entry`, `quitURL=""`, completion reconfiguration URL แบบ extensionless exact scope และ finite content filter; ไม่สร้าง CK/BEK

### Enroll dry-run — local checksum/profile เท่านั้น

```sh
node scripts/enroll-waiting-seb-artifact.mjs \
  --assignment '<NEW_SYNTHETIC_ASSIGNMENT_UUID>' \
  --revision '<CURRENT_TEACHER_REVISION_INTEGER>' \
  --artifact '<PRIVATE_WORK_DIR>/waiting-native-final.seb' \
  --native-final-sha256 '<SHA256_OF_ACTUAL_FROZEN_NATIVE_FINAL_BYTES>' \
  --manifest-output '<PRIVATE_WORK_DIR>/waiting-release-manifest.json' \
  --terminal-output '<PRIVATE_WORK_DIR>/waiting-terminal.seb' \
  --evidence-file '<PRIVATE_WORK_DIR>/native-evidence.json' \
  --env-file '<PRIVATE_OPERATOR_ENV_FILE>'
```

Dry-run ไม่อ่าน native evidence, ไม่เรียก DB/Storage/RPC และไม่เขียนไฟล์ รายงาน `contextVerified:false`, `nativeEvidenceVerified:false`, `nativeProof:pending_w7` Checksum เป็น byte guard ไม่ใช่หลักฐานว่า CK/BEK ตรงไฟล์จากอุปกรณ์จริง

### Enroll apply — operator mutation หลังมี native-final evidence ครบเท่านั้น

เพิ่ม `--apply` ในคำสั่ง enroll เดิมพร้อม auth-origin flags ที่ตรงกับ seed หากไม่ใช้ `--evidence-file` command จะรับ evidence จาก noninteractive stdin ที่ bounded 24,000 bytes; ห้ามส่ง raw evidence ผ่าน argv/console/chat ไม่ต้องใช้ `--multiplatform`: command ใหม่นี้บังคับ schema 2 ครบสี่ targets เสมอ

Apply rechecks scoped context/passwordless assignment, exact file checksum, initial policy และ teacher exit hash แล้ว freeze initial bytes ก่อน async work สร้าง terminal bytes แบบ deterministic จาก initial โดยคง teacher/admin hash และไม่ enroll terminal เป็น exam-key entry ทั้งสอง phase อยู่ใน private `assignment-seb-configs` bucket โดย canonical path `assignments/<assignment>/r<revision>/<sha256>.seb`, `upsert:false`

Manifest และ optional terminal output ถูก reserve `wx`/0600 **ก่อน** Storage/RPC; existing user files ไม่ถูก truncate ทั้ง initial/terminal download กลับมาตรวจ actual size/SHA-256 ก่อนใช้ shared verifier และ existing service RPC `register_assignment_seb_config_release` ซึ่งตรวจ initial bytes อีกครั้ง หลัง response ตรง scope/ref/key count จึงเขียน manifest ที่มี release ID, profile/origin/auth origins และ byte references เท่านั้น ไม่มี CK/BEK/password

`SEB_EXAM_WAITING_RELEASES` รับ JSON array จาก private manifest; operator ต้องจัดการ manifest/env/deployment ด้วยสิทธิ์ที่ได้รับอนุมัติแยกต่างหาก Command ไม่เปลี่ยน cloud env, deploy หรือ publish assignment อัตโนมัติ Manifest selection ไม่ใช่ student/attempt authority และต้องตรง immutable registered initial release จึงใช้งานได้

ถ้า output reserve/close ล้มเหลวก่อน cloud อาจเหลือ empty private manifest placeholder หรือ private terminal bytes ที่ command สร้างเอง ถ้า upload ล้มเหลวก่อน RPC อาจมี immutable object บางส่วนแต่ยังไม่มี registered release ตรวจให้แน่ชัดก่อนจัดการ ไม่ลบไฟล์ผู้ใช้ หากพบ `SEB_WAITING_OPERATOR_RECONCILIATION_REQUIRED` หลัง registration attempt ให้หยุด: อาจ register แล้วแต่เขียน manifest/ปิด handle ไม่สำเร็จ รายงานมีเพียง expected release ID/digest/path และ `registrationOutcome:unknown|registered` ให้ operator อ่าน scoped registry และ stored bytes กลับมาตรวจภายใต้สิทธิ์ที่อนุมัติก่อนกู้ manifest **ห้ามรันซ้ำเพื่อ register blindly, overwrite object, rotate revision หรือแก้ DB โดยเดา** existing-release guard จะปฏิเสธการ enroll ซ้ำ

## Windows operator/device steps — W7 NOT RUN

ทุกข้อด้านล่างเป็นลำดับสำหรับรอบอนาคต ยังไม่ใช่งานที่เจ้าของต้องทำตอนอ่านเอกสารนี้ ชื่อเมนู/ปุ่มของ native tool ต้องยืนยันจาก build ที่ใช้จริง ไม่เดาจากอุปกรณ์อื่น

1. เจ้าของเลือก synthetic draft exam/current teacher revision และยืนยันไม่มี `access_code`, release หรือ active attempt ตาม preflight Operator บันทึก exact candidate lock ใหม่ใน evidence ที่อนุมัติ โดยไม่อ่าน/บันทึกซ้ำ r2
2. Operator จัด private env/template/output locations และรัน prepare dry-run จากนั้นทำ prepare `--apply` เมื่ออนุมัติการอ่าน context/เขียนไฟล์แล้ว ตรวจว่าไม่มีคีย์ native ถูกสร้างหรือแสดง และ admin plaintext อยู่เฉพาะ private operator file หากเลือกเก็บ
3. บน Windows ใช้ native SEB/Configuration Tool **3.10.2 build 920** ที่ตรวจ version/build จากเครื่องจริง เปิดเฉพาะ seed ใหม่ Operator ใช้ fresh admin credential เฉพาะเมื่อ native settings tool จำเป็นต้องถาม ห้ามให้นักเรียนใช้ credential นี้
4. ตรวจ student-entry contract: config เป็น exam-purpose, ไม่มี file-entry password, Start URL เป็น canonical entry ของ assignment/revision นี้, initial Quit URL ว่าง, completion URL exact extensionless, finite filters, developer console/address bar/back-forward/downloads ปิดตาม profile Teacher quit hash ต้องตรง current revision อย่าแทนที่ด้วย global password
5. ทำ Final Save **ครั้งเดียวไปชื่อ private ใหม่** ไม่ทับ seed และไม่แตะ r2 ตรวจรูปแบบ passwordless container ที่ inspector รับได้ หาก native export กลายเป็น password-encrypted file หรือ policy เปลี่ยน ให้หยุดก่อน enroll
6. Freeze final bytes, เก็บ actual SHA-256/size และจัด permission owner-only/readonly ตาม OS จากนี้ห้ามแก้หรือ resave Final ขณะเก็บ CK/BEK หรือใช้บนอุปกรณ์อื่น ถ้า byte digest เปลี่ยนต้องหยุดและเริ่ม controlled candidate/evidence ใหม่ ไม่ใช้คีย์เดิม
7. รับ **Config Key จาก native final จริง** และ Windows BEK ของ exact 3.10.2/920 ผ่าน native tool เก็บ privately ไม่คำนวณ/เดา/ยืมจาก r2 ไม่บันทึกค่าลงภาพหรือ Git ถ้ามีการแสดง native key ให้นำภาพที่เผยค่าคีย์ออกจาก handoff
8. ให้ operator ของ macOS, iPadOS และ iPhone/iOS โหลด **final bytes เดียวกันแบบไม่ resave** เก็บ exact version/build และ BEK จาก native runtime ของแต่ละ target ต้องยืนยัน CK ตรง final เดียวกัน อย่าใช้ version/build จาก release tag หรือ key ของอุปกรณ์อื่นแทนการเก็บจริง
9. ประกอบ private `native-evidence.json` ด้วย strict schema 2: top level มีเฉพาะ `schemaVersion`, `assignmentId`, `revision`, `configKey`, `browserExamKeyBuilds`; แต่ละ build มีเฉพาะ `target`, `platform`, `versionString`, `buildNumber`, `key` และครบ `windows/windows`, `macos/macos`, `ipados/ios`, `ios/ios` อย่างละหนึ่ง Windows ต้องเป็น 3.10.2/920; Apple metadata ต้องมาจากเครื่องจริงทุกเครื่อง ถ้า iPad/iPhone มี runtime identity เดียวกัน BEK ต้องตรงกันจึง deduplicate ได้ ไม่บังคับให้เหมือนกันเมื่อ build ต่างกัน
10. Operator ตรวจ digest ของ final ซ้ำ รัน enroll dry-run แล้วจึง `--apply` เมื่อครบ native evidence และได้รับอนุมัติ upload/register ตรวจ nonsecret release/initial/terminal refs กับ scoped registry/Storage การได้ `enrolled` ยังไม่ใช่ native exit/filter/auth pass
11. หลัง operator ตั้ง manifest/env และ publish/deploy candidate ที่อนุมัติแล้ว ให้เปิด **initial final ใหม่** ใน Windows ใน student context ไม่มี prompt ก่อนเว็บ Login/profile/OAuth ต้องกลับ exact exam waiting room ไม่ผ่าน dashboard ตรวจ badge/version/system-check ทั้ง CK+BEK ผ่าน server โดยไม่แสดงคีย์
12. ก่อนกดเริ่ม ทดสอบ reload/Back/prefetch และรอ: server ต้องยังไม่มี attempt/timer และไม่ส่งโจทย์/เฉลย จากนั้นกดเริ่มครั้งเดียว ตรวจ server receipt/`started_at` เดิม และทำ start/recovery/answer/upload/submit/exit negatives ด้านล่างทีละ case หากมีข้อผิดพลาดให้เก็บ evidence ปัจจุบันและหยุด ไม่แก้ native file ระหว่างรอบ

ทำ flow และ failure matrix ซ้ำบน **ทั้งสี่ targets/exact builds** ที่จะประกาศใช้งาน Apple cookie handoff, native reconfiguration และ passwordless quit ยังไม่มีหลักฐานใหม่ใน runbook นี้

## Initial → committed completion → terminal

Initial phase มี `quitURL=""`; native Quit URL ที่เดาได้จึงไม่ควรเป็นทางออกก่อนส่ง แต่ teacher-owned emergency quit/unlock ยังต้องใช้ได้ตาม exact revision เริ่ม/บันทึก/ส่งต้องตรวจ authenticated user/context/roster/release/native CK+BEK/session และ server receipt ตาม operation ไม่ใช้การซ่อนปุ่มเป็น authority

หลัง submit commit จริงเท่านั้น หน้า canonical `/submitted` มีทางไป exact `/completion` เพื่อรับ terminal config Frozen terminal ยังคง exam-purpose, คง teacher/admin hash, เริ่มที่ `/submitted`, มี exact `/quit`, ปิดการ reconfigure/download ต่อ และจำกัดหน้า/asset ของ terminal ไม่ใช่ config ที่ปลด security ทั่วไป Completion ตรวจ authenticated exact context/current release/roster และ latest committed receipt ที่บันทึก mode `seb`/revision ตรงเดิม ไม่ต้องอาศัย initial verification cookie หลัง terminal เปลี่ยนคีย์ Server ลบ cookie นั้นและตรวจ committed receipt ใหม่ทุก GET; completion-ready cookie เป็น presentation hint ไม่ใช่ exit authority Retry ของ committed completion ใน context ที่ยังถูกต้องไม่ใช่การเปิด attempt ใหม่ แต่ expired context/wrong scope ต้องถูกปฏิเสธ

การส่ง HTTP denial เป็น text ที่ extensionless URL, byte inspector ผ่าน, filter regex ตรง หรือปุ่มถูกซ่อนไม่พิสูจน์ว่า native จะคงล็อกเมื่อ reconfiguration ล้มเหลว โดยเฉพาะ Windows มี native failure path ที่อาจ shutdown ต้องพิสูจน์จริงก่อนอ้างว่าห้ามออกก่อนส่งได้ หากก่อน committed submit เกิด native close/unlock/ordinary-browser escape แม้ HTTP ถูกปฏิเสธ ให้บันทึก **failed และหยุด promotion** ไม่แก้ requirement เงียบ ๆ

## Native failure/negative matrix — ทุก case pending

สำหรับทุก target บันทึก exact candidate/revision/artifact digest/native build, ขั้นที่ทำ, expected/observed behavior, เวลา/แหล่งเวลาที่ใช้ และผล `passed|failed|blocked|pending` พร้อมภาพ/ข้อความที่ไม่มีข้อมูลลับ ห้ามรวม pass จากคนละ source/deployment/artifact หรือใช้ machine test แทน observed native result

- **Entry/dirty device:** clean launch ไม่ถามรหัส; อุปกรณ์ที่เคยใช้ข้อสอบอื่น/บัญชีครู/บัญชีนักเรียนอื่น/cookies เก่าไม่ข้าม context หรือโชว์งานเก่า; wrong account, roster removal, revision/release mismatch และ marker absent/expired/tampered ต้องไม่เปิดข้อสอบหรือกลับไปแอปทั่วไป
- **Login/return:** password login, first-profile completion, approved OAuth/Magic Link กลับ exact waiting room; callback nonce/return target/open redirect/context switch/replay ถูกปฏิเสธ; finite provider allowlist ไม่เปิด browsing ของ provider หรือ REST/Storage
- **Before start:** waiting/system-check/reload/Back/RSC/prefetch ไม่สร้าง attempt/timer/hidden question payload; future/closed windows, no valid verification และ coded assignment ไม่เริ่มสอบหรือเพิ่ม entry-password prompt
- **Start/idempotency:** double click, overlapping start และ lost response retry ให้ ID/answer snapshots/`started_at` เดิม; signed predecessor replay ไม่เปิด successor ใหม่; snapshot failure rollback ทั้ง header/answers ตรวจ actual server receipt แบบ read-only ไม่แก้ข้อมูลเพื่อให้ผลผ่าน
- **Verification/expiry:** wrong CK, BEK, exact version/build, assignment/revision/release และ expired session ไม่สร้าง/เขียน attempt; recheck/reload ไม่ reset เวลา; timer/deadline boundary/individual extension และ forced finalization ต้องอ่านสถานะจริงก่อนอนุญาตทางออก
- **Other solution/content:** direct page/known URL ของงานอื่น, RSC/prefetch, known synthetic solution asset, global dashboard/notifications/menu, Supabase REST/Storage และ unknown/teacher solution operation บน canonical JSON endpoint ถูกปฏิเสธ; `Next-Action` POST บน URL ที่อนุญาตไม่ dispatch Server Action ทดสอบด้วย synthetic URL ที่รู้จริงและ approved harness ไม่เดา UUID/ใช้ข้อมูลจริง
- **Resource/upload:** exact-owned question/choice/part/inline images, PDF, work-photo และ Drawing Board preview/scene โหลดผ่าน canonical proxy; arbitrary/foreign/other-answer URL, redirect tunnel, expired/wrong receipt, wrong CSRF/MIME/bytes/size และ replay ผิด slot ถูกปฏิเสธ ไม่มี fallback ไป browser Supabase SDK
- **Recovery/regression:** online autosave, offline queue/reconnect, reload/resume, lost upload response/retry, proctor heartbeat, timeout และ Drawing Board local draft/attach/edit/reopen/preview ต้องยังใช้งานได้ตามเดิมโดยไม่เพิ่มเวลา Teacher emergency quit แล้วกลับ initial context ไม่ถือว่าส่งงาน และไม่สร้าง attempt ใหม่เอง เว็บปกติ/approved Android ต้องไม่ถูกเปลี่ยนเป็น waiting-only/global account lock
- **Submit:** refused/failed submit ไม่มี exit; retry/lost success response reconcile exact committed receipt ไม่เปิดรอบใหม่หรือแสดงสถานะสำเร็จจาก client flag ล้าง local draft หลังรับรอง commit ตาม flow เดิม ไม่ใช้การออกฉุกเฉินแทน submit
- **Early/native exit:** ก่อนส่งเรียก `/quit`, direct `/completion`, expired/wrong-user/wrong-assignment completion, query/path aliases และ reused context/hints ต้องไม่เปิด passwordless native exit ไม่มี prompt รหัสเข้าสอบ ครูยังใช้ emergency password ของ revision ได้; wrong teacher password ไม่ปลดล็อก
- **Reconfiguration failure:** ทดสอบ HTTP denied/text/HTML, redirect ทั้ง same/foreign origin, missing/offline/timeout, truncated bytes, wrong digest, malformed/invalid config, unrelated config และ local/file/data URL ตาม approved fault fixtures ตรวจทั้ง server denial และ native state จริง ต้องไม่ assume ว่า native error ทำให้ล็อกคงอยู่
- **Committed terminal/quit:** completion download/retry/replay, actual cookie handoff/config restart และ terminal confirmation/quit ปิด SEB ได้โดยไม่ถาม password หลัง commit เท่านั้น Terminal ไม่พาไปเว็บทั่วไป/เฉลยหรือเปิด attempt ต่อโดย old verification; stale-cookie/Back/reentry/old final reuse ต้องตรวจ quota/context ใหม่และไม่แปลง failed recovery เป็น pass

ถ้า native automatic completion/quit ใช้ไม่ได้ ให้บันทึก failed/blocked ตามจริงและใช้ teacher-owned emergency recovery เฉพาะที่อนุมัติ ไม่ประกาศว่า automatic exit ผ่านจากการกรอกรหัสครู ไม่เพิ่ม shared password, global allowlist หรือ downgrade terminal security เพื่อทำให้ผลผ่าน

## ปิดรอบหลักฐาน

W7 ผ่านได้เมื่อ observed cases ที่กำหนดครบทุก target/build/candidate รวม negatives และไม่มี prompt ก่อนเว็บ/exit bypass ก่อน commit ผู้ตรวจระบุช่องว่างตามจริงและเจ้าของอนุมัติผล ไม่มีการอนุมาน pass จาก parser/checkbox/system-check screenshot เพียงส่วนเดียว

อ้างอิงแผนและหลักฐานเดิมได้ที่ [SEB_COMPLETION_PLAN.md](./SEB_COMPLETION_PLAN.md) และ [SEB_PHASE6_PHYSICAL_UAT.md](./SEB_PHASE6_PHYSICAL_UAT.md) แต่ runbook นี้ไม่แก้สถานะของสองเอกสารนั้นและไม่ย้ายผล r2 มาเป็น evidence ใหม่ ตอนส่งต่องานนี้ยัง **หยุดก่อน W7**; ไม่มี native generation/enrollment/cloud mutation หรือคำขอให้เจ้าของทำขั้นถัดไปเกิดขึ้น
