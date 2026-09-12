# N2 — พิสูจน์ SEB แบบไม่เพิ่ม SEB Server สำหรับสอบในห้องเรียน

อัปเดต 12 กันยายน 2026 · แผนหลัก [SEB_NO_SERVER_PLAN.md](SEB_NO_SERVER_PLAN.md)

**การช่วยทดสอบล่าสุด:** ผู้ใช้ขอคำแนะนำสั้น ๆ ทีละขั้น และรหัสทดลองจำง่าย อนุมัติสร้างชุดใหม่ด้วย `npm run seb:n2:prepare -- --simple-passwords`: A/A-modified ออกด้วย `1234`, B ออกด้วย `4321`, ตั้งค่าทั้งสองชุดด้วย `1111` ไม่มี opening password ตัวเลือกนี้ใช้เฉพาะ lab; คำสั่งปกติยังสุ่มรหัส เก็บชุดเก่าไว้และใช้ path ของชุดใหม่ในการเปิด probe Key/hash คำนวณใหม่ทั้งชุดและทะเบียน native เริ่มว่าง ต้องทดสอบใหม่ ห้ามนำ Key เก่ามาแทน อธิบายให้ผู้ใช้ทีละขั้น ไม่ส่งคู่มือทั้งชุดซ้ำ

ชุด Mac วันที่ 7 กันยายนอยู่ที่ `.local/seb-no-server-sypouv/` และชุด iPad/iPhone แบบ Wi-Fi วันที่ 10–12 กันยายนอยู่ที่ `.local/seb-no-server-eHAu0h/` บนเครื่องนี้เท่านั้น (ไฟล์ส่วนตัว Git ignore และไม่ย้ายข้ามเครื่องด้วย Git) ห้ามคัดลอกรหัสหรือ Key จากสองชุดนี้ไป production

## สถานะตรงตามจริง

**N2.1 native core ผ่านแล้วบน Mac, iPad และ iPhone; N2 ทั้งเฟสยังไม่ผ่าน** ชุดนี้ตรวจรูปแบบไฟล์ การคำนวณ Key และการเรียก Quit URL แบบแยกจากเว็บจริง ไม่ใช่หน้าคุมสอบใหม่ ไม่ใช่ระบบรหัสรายครูพร้อมขาย ไม่เชื่อม Supabase/Vercel และไม่ออก session สอบ

- Mac: วันที่ 7 กันยายน 2026 ผ่าน A/B ไม่มี opening password, CK+BEK, รหัสออกแยกกัน, ลิงก์ออก และ A-modified ถูกปฏิเสธ บน macOS 26.4 (25E246), SEB 3.7 build 1591F
- iPad: วันที่ 10 กันยายน 2026 ผ่านผลหลักเดียวกันบน SEB 3.6.2 ผ่าน private Wi-Fi origin และผู้ใช้ยืนยันว่าลิงก์ออกปลด session ได้
- iPhone: วันที่ 12 กันยายน 2026 ผ่าน A/B ไม่มี opening password, CK+BEK, รหัสไขว้ถูกปฏิเสธ, รหัสของตัวเองใช้ได้, ลิงก์ออกไม่ถามรหัส และ A-modified ถูกปฏิเสธ บน iOS 26.6.1, SEB 3.7.1
- Windows: pending ต้องมีเครื่องจริงและระบุ Windows/SEB build ก่อนลงทะเบียน BEK และทดสอบ ห้ามอนุมานผลจาก Mac/iPad/iPhone
- N2.2 ยังต้องทำหน้าทดลองส่งคำตอบ/อนุญาตออกเฉพาะราย/พักและอนุญาตกลับรอบเดิม/สัญญาณขาดการติดต่อ หลัง import/Key/recovery ชุดแรกผ่าน ไม่ใช่ฟีเจอร์ที่มีแล้วเพียงรอ native test
- automation ของ trusted BEK ยังไม่พิสูจน์ การเก็บ Key ด้วยมือใน lab ไม่ใช่การเลือกให้ครูทั่วประเทศทำงานด้วยมือ และไม่อนุมัติ CK-only

## ส่วนปรับแผนอยู่เฟสไหน

- N2: พิสูจน์พฤติกรรมเข้า–ออกและสัญญาณที่เครื่องจริงส่งได้ โดยผู้ใช้เปิด SEB เอง
- N3: ออกแบบข้อมูล permission/revision/attempt เพื่อพักรอบเดิมโดยไม่หยุด deadline
- N5: ต่อหน้าคุมสอบเดิม เพิ่ม timeout/reconnect alerts และแยกส่งแล้ว/อนุญาตออก/ขาดการติดต่อ/กลับมา
- N6: บังคับสิทธิ์อนุญาตออกและกลับเข้าที่ server พร้อมการบันทึกคำตอบและเวลาเดิม
- N7: ตรวจรับในห้องเรียน ครูตรวจเครื่องจริงเมื่อมีสัญญาณ ไม่กล่าวหาว่าโกงจากการขาดการติดต่ออย่างเดียว

## เครื่องมือที่เพิ่ม

`scripts/seb-no-server/` แยกจาก `scripts/seb-phase2/` ซึ่งเป็น SEB Server lab เก่า:

- `format.mjs`: รูปแบบ `gzip(plnd + gzip(XML plist))` ไม่มี opening password ไม่ใช่ encrypted file ใช้ serializer/CK subset เดิมโดยไม่เปลี่ยน encoder `pswd` เดิม
- `kit.mjs` / `prepare.mjs`: สร้าง A/B ที่ต่างเฉพาะ quit-password hash และ A-modified ที่แก้ `allowPrint` เป็น valid XML; ปกติสุ่มรหัสใหม่ต่อชุด ตัวเลือก `--simple-passwords` ใช้รหัสสาธิตตามที่ผู้ใช้ขอ เขียนในไดเรกทอรีใหม่ทุกครั้ง ไม่ทับไฟล์เดิม
- `probe-server.mjs` / `probe.mjs`: HTTP เฉพาะ `127.0.0.1:4175` หรือ private IPv4 ของ Mac ที่ port 4175, exact host/origin checks, challenge URL อายุ 5 นาที ใช้ครั้งเดียว ไม่เกิน 64 ค้าง, body ไม่เกิน 1 KiB ไม่เปิดอ่านไฟล์ผ่าน HTTP ไม่โหลด `.env` ไม่เก็บ raw hashes และตอบ `admissionGranted:false` เสมอ
- Probe ตรวจ CK และ BEK แยกกัน: ไม่มี native BEK ที่ลงทะเบียนจะขึ้น `BEK_PENDING` ไม่แปลง hash ที่ browser ส่งเป็น trusted enrollment แม้มี API ก็ไม่ถือว่าผ่าน เมื่อทั้งคู่ตรงจึงเสนอ **ลิงก์ทดลองออก** ไม่ใช่การยืนยันว่าครูอนุญาต/ส่งงานสำเร็จ
- Apple callback ใช้ named global function ตาม native bridge ไม่ใช้ anonymous callback

ชุดนี้ตั้งใจผ่อนคลาย desktop restrictions เพื่อกู้คืนง่าย **ไม่ใช่ template ล็อกเครื่องจริง** และไม่รับรอง iPad Assessment Mode จากผล Mac ห้ามนำไปแทน `public/exam/korkru-production-v1.seb` หรือเพิ่ม CK/BEK ของ lab เข้า production environment

สำหรับอุปกรณ์อีกเครื่องใน Wi-Fi เดียวกัน ให้สร้างชุดใหม่ด้วย `npm run seb:n2:prepare -- --simple-passwords --lan-host <private-ipv4-ของ-Mac>` รองรับเฉพาะ `10.x.x.x`, `172.16–31.x.x` หรือ `192.168.x.x` ที่ port 4175 ไม่รับ public IP, hostname, HTTPS หรือ port อื่น ชุดนี้เป็น HTTP lab ในวง LAN เท่านั้น ไม่ใช่วิธี deploy production

## ก่อนทดสอบ — ทำบน Mac ก่อนเพียงเครื่องเดียว

1. บันทึกงานในโปรแกรมอื่น ปิดงานสำคัญ และเตรียมอุปกรณ์อีกเครื่อง/กระดาษสำหรับอ่านรหัสออก
2. สร้างชุดด้วย `npm run seb:n2:prepare` ในโฟลเดอร์โปรเจกต์ `korkru` คำสั่งนี้ไม่เปิด SEB
3. ในโฟลเดอร์ที่คำสั่งแจ้ง อ่าน `READ-ME-FIRST.txt` และเปิด `private-manifest.json` ด้วยตัวแก้ไขข้อความ **ไม่ใช่เปิดไฟล์ .seb ตอนนี้** จด `quitPassword` และ `adminPassword` ของ A/B ไว้นอกเครื่อง ไม่ส่งรหัส/Key ในแชต
4. เปิด Terminal แยก รัน `npm run seb:n2:probe -- <โฟลเดอร์ชุดทดลอง> a` แทนข้อความในวงเล็บด้วย path จริง ดูว่าขึ้นว่าพร้อมและคาดหวังไฟล์ a
5. เปิด URL ที่ probe แจ้งใน Safari ก่อน ต้องเห็น “ทดลองไฟล์ SEB — ชุดที่คาดหวัง: a” กดตรวจ Key แล้วไม่ผ่านใน Safari เป็นผลที่ถูกต้อง จากนั้นยังไม่ปิด Terminal ของ probe
6. ผู้ใช้ดับเบิลคลิก **LAB-N2-a.seb** ด้วยตัวเอง ไม่เปิดไอคอน SEB เปล่า ๆ และไม่ใช้ไฟล์ production ยืนยันข้อความเปิดใน SEB ของระบบได้ แต่ถ้าถาม **รหัสเปิดไฟล์** ให้หยุดและรายงาน ไม่ใส่รหัสเดา
7. เมื่อเข้าหน้าทดลอง กด “ตรวจ Key ของชุดทดลอง” ผลแรกควรเป็น “CK ตรงแล้ว แต่ยังไม่มี BEK…” ถ้าไม่ตรง ให้บอกเฉพาะข้อความ รุ่น SEB/OS และชื่อไฟล์ ห้ามแก้/บันทึก config ซ้ำเพื่อให้ผ่าน
8. ทดสอบการออกปกติของ SEB ก่อน: ในไฟล์ A ลองรหัสออกของ B ต้องถูกปฏิเสธ แล้วรหัส A ต้องออกได้ หากไม่สำเร็จหยุดก่อนเปลี่ยนไฟล์หรือทดสอบทางอื่น ไม่จงใจทำให้ SEB ค้าง
9. รอบ B หยุด probe เดิมด้วย Ctrl+C หลังออกจาก SEB แล้ว เปิด probe คาดหวัง `b` และเปิด LAB-N2-b.seb ยืนยันไม่ถาม opening password, CK ตรง, รหัส A ถูกปฏิเสธ และรหัส B ออกได้

ทางกู้คืน: ใช้ปุ่มออก/เมนูออกของ SEB และ quitPassword ของไฟล์นั้นที่จดไว้; adminPassword ใช้เข้าตั้งค่า ไม่ใช่รหัสออก ถ้า native ไม่ตอบสนองให้หยุดการทดลอง แจ้งอาการ และใช้แนวทางกู้คืนของ OS ไม่สัญญาว่ารหัสแก้ native freeze ได้ทุกกรณี

## เก็บ BEK โดยผู้ทดสอบที่เชื่อถือได้ — ไม่ใช้ Key เว็บจริง

ขั้นนี้ทำ **หลัง N2.1 ขั้นแรกได้ผล** และสามารถให้ agent ช่วยชี้หน้าต่างทีละจุดได้:

1. เปิดไฟล์ lab สุดท้ายบน native build ที่กำลังทดสอบ อ่าน Browser Exam Key จาก Exam/Exam Session โดยไม่ save config ซ้ำ ค่าจาก JavaScript `security.browserExamKey` เป็น request hash ไม่ใช่ raw BEK ที่ต้องลงทะเบียน
2. บันทึกเฉพาะใน `native-keys.private.json` ของชุดนั้น (ไฟล์ส่วนตัว ไม่ใช่ Vercel/ตัวแปรเว็บจริง) แต่ละ `entries` มี `caseId`, `fileSha256` จาก manifest ของไฟล์เดียวกัน, `platform` (`macOS`, `iOS`, `Windows`), `build` ที่อ่านจากเครื่องจริง และ `browserExamKey` 64 hex ตัวพิมพ์เล็ก ห้ามใส่ค่า placeholder แล้วถือว่าเก็บสำเร็จ
3. ไฟล์ registry ต้องยังเป็น owner-only: บน Mac ใช้ `chmod 600 <path-to-native-keys.private.json>` หาก editor ทำ permissions กว้างขึ้น Probe ไม่ยอมอ่านไฟล์ที่เปิดให้ผู้อื่นอ่าน/เขียนได้
4. หยุด/เริ่ม probe ใหม่เพื่ออ่านทะเบียนใหม่ แล้วเปิดไฟล์เดิม กดตรวจ: ต้องได้ `MATCHED_BOTH` จาก native ไม่ใช่สคริปต์สมมติ จึงลองลิงก์ออกได้
5. ทดสอบลบ BEK ชั่วคราวจาก **ทะเบียน lab สำเนา/ชุดทดลองเท่านั้น**, BEK ผิด, B เมื่อคาดหวัง A และ A-modified เมื่อคาดหวัง A: ต้องไม่ผ่านครบและไม่เสนอปุ่มทดลองออก

บน iPad SEB 3.6.2 ขั้นตอนอ่าน raw BEK ที่พิสูจน์แล้วคือ Settings → Exam Session → Share Keys → เปิด `Share Browser Exam Key`, ปิด `Share Config Key`, เลือก `Only Keys (Don't Modify Config)` แล้วกดย้อนกลับถึงหน้าหลัก Settings และกดปุ่ม Share ทันที ค่า `Only Keys` เป็นตัวเลือกชั่วคราวและอาจไม่คงอยู่หลังปิด/เปิด Settings ใหม่ ห้ามกด Apply เพราะจะเริ่ม session ตาม config อีกครั้ง ตัวสร้าง lab ตั้ง `sendBrowserExamKey=true` เพื่อให้ flow นี้ใช้ได้ และคง `browserWindowWebView=3` สำหรับ modern JavaScript API; การตั้งนี้ไม่ใช่การติดตั้งหรือใช้งาน SEB Server

การเทียบครบไม่ได้แปลว่ามี approved enrollment อัตโนมัติหรือ identity ของนักเรียน ผู้ทดสอบต้องยืนยันที่มาของ BEK เอง รอบนี้ไม่มีการลงทะเบียนอัตโนมัติจาก client และไม่ออก auth cookie/session ของ KorKru

## ข้อจำกัดลิงก์ออกที่การทดสอบต้องไม่ปิดบัง

Quit URL อยู่ในไฟล์ก่อนปุ่มแสดง `plnd` อ่านค่านั้นได้ Native อาจจับ URL ก่อน HTTP จึงไม่มี callback นี้ที่ยืนยันว่าแอปปิด และ endpoint/ปุ่มที่ซ่อนอยู่ไม่ใช่ native authorization ลิงก์ที่เสนอใน probe มีไว้ทดสอบฟังก์ชันออกโดยตั้งใจ **ไม่ใช่ปุ่มส่งข้อสอบหรือคำสั่งอนุญาตของครู** บน iPad ภายหลังต้องสังเกตการปลด exam session/assessment lockdown ไม่จำเป็นว่าตัวแอปปิดกลับ Home

คำว่า “ขาดการติดต่อ” ต้องแยกจาก “ยืนยันว่าออกจาก SEB” และไม่บอกว่าเด็กไปเว็บไหนหรือโกง เพียงเพราะ heartbeat หาย

## หลักฐานและเกณฑ์ผ่านที่ต้องเก็บ

บันทึกเฉพาะวันที่, fixture id/file SHA-256, OS, SEB version/build, ผลผ่าน/ไม่ผ่าน/ยังไม่ทดสอบ และอาการ ห้าม commit รหัส, raw CK/BEK/request hash, token, ข้อมูลนักเรียน หรือคำตอบจริง

- [x] Mac: A/B เปิดโดยไม่ถาม opening password; CK+BEK ตรง; รหัสไขว้ถูกปฏิเสธ; รหัสของตัวเองและลิงก์ทดลองออกใช้ได้
- [x] iPad: A/B เปิดโดยไม่ถาม opening password; CK+BEK ตรง; รหัสไขว้ถูกปฏิเสธ; รหัสของตัวเองและลิงก์ทดลองออกใช้ได้
- [x] iPhone: A/B เปิดโดยไม่ถาม opening password; CK+BEK ตรง; รหัสไขว้ถูกปฏิเสธ; รหัสของตัวเองและลิงก์ทดลองออกใช้ได้
- [x] BEK ที่ยังไม่ลงทะเบียนถูกปฏิเสธ และ A-modified ถูกปฏิเสธเมื่อคาดหวัง A บน Mac/iPad/iPhone
- [ ] wrong raw BEK และ swapped A/B proof matrix ครบทุกกรณีบน native ทุกแพลตฟอร์ม
- [ ] Windows: มีผู้ทดสอบ/รุ่นจริง + native tests ครบ
- [ ] Device-UX ของหน้าข้อสอบจริง: ผู้ใช้เปลี่ยนลำดับวันที่ 12 กันยายน 2026 ให้เริ่ม iPhone/iPad/Mac ก่อน Windows โดยใช้ [แผน 8 เฟส](EXAM_SCREEN_QA.md); การเปลี่ยนลำดับนี้ไม่ทำให้ Windows ผ่าน
- [ ] N2.2: submit commit สำเร็จก่อนเสนอออก; save ล้มเหลวไม่รายงานสำเร็จ
- [ ] N2.2: grant เฉพาะคน/รอบ; D1 คงคำตอบและ deadline เดิม กลับมาได้เมื่อครูอนุญาต
- [ ] N2.2: visibility, normal close, lost heartbeat และ disconnect/reconnect โดยครูตรวจเครื่องได้
- [ ] ข้อยุติ BEK automation/ขอบเขตผลิตภัณฑ์ ก่อน N3–N8 ของบริการจริง

ช่องที่ติ๊กมาจากผู้ใช้ทดสอบอุปกรณ์จริง ไม่ใช่ผล unit test แทน native ส่วน N2.2, Windows, proof matrix ที่เหลือ, device-UX test ที่เริ่มทำก่อน Windows และ BEK automation ยัง pending จึงยังไม่ประกาศ N2 หรือ production พร้อม

หลักฐานไฟล์ที่ไม่เป็นความลับ: Mac A `f635f891…b8bad`, B `a18cde0e…19bef`; iPad/iPhone A `1c436295…b60c`, B `764643b2…aac86`, A-modified `0453e374…e9ab` (SHA-256 ย่อ; raw CK/BEK และรหัสไม่อยู่ใน Git)

## ตรวจอัตโนมัติ

`npm run seb:n2:test` ทดสอบ envelope, XML, CK changes, private immutable artifacts, registry binding, exact URL/expiry/replay/origin/size, callback timeout และ production verifier regression ที่ BEK ว่างต้องปฏิเสธ บาง tests เปิด loopback HTTP ชั่วคราว จึงต้องมีสิทธิ์ listen ในเครื่อง

ผลตรวจเดิมวันที่ 6 กันยายน 2026:

- `npm test`: **1,040 tests / 80 files ผ่าน** รวม N2 ใหม่ 35 tests / 3 files; HTTP ใช้ loopback สังเคราะห์ ไม่ใช่ native SEB
- `npm run lint:tokens`: ผ่าน ไม่มีไฟล์ที่เพิ่ม design-token debt (probe เป็น plain diagnostic HTML นอก application UI)
- `npm run seb:n2:prepare`: สร้างชุดส่วนตัวใหม่สำเร็จ ไม่เปิดแอป; unwrap ไฟล์ A แล้วตรวจด้วย `plutil -lint -` ของ macOS ผ่าน
- Independent read-only review พบ high-bit prefix decoding จึงแก้ให้เทียบ bytes `plnd` ตรงตัวและเพิ่ม negative test แล้ว
- `git diff --check` ผ่าน และยืนยัน private bundle ถูก Git ignore ไม่ commit `.seb`, manifest, passwords หรือ native keys
- ไม่รัน TypeScript/build เพราะไม่มีการเปลี่ยน TypeScript/application runtime/dependencies; ไม่ตรวจ live migration ledger หรือ apply schema เพราะไม่แตะฐาน ไม่ตั้ง keyring/env/deploy ไม่รัน native หรือ browser-device UAT

ผลตรวจวันที่ 10 กันยายน 2026 หลังเพิ่ม private-Wi-Fi origin และ iPad Share Keys compatibility:

- `npm run seb:phase1:test`: **24 tests / 2 files ผ่าน**
- `npm run seb:n2:test`: **37 tests / 3 files ผ่าน** รวมขอบเขต RFC1918/fixed port และ LAN kit แยก fingerprint
- ชุด iPad/ทะเบียน BEK ยังคง permission แบบ owner-only และ `.local/` ถูก Git ignore
- ไม่รัน full suite/build/TypeScript/lint เพราะไม่เปลี่ยน application runtime, TypeScript หรือ UI; ไม่มี migration, env หรือ deploy

**จุดหยุดถัดไป:** ทำ [device-UX test ของหน้าข้อสอบตามแผน 8 เฟส](EXAM_SCREEN_QA.md) บน iPhone/iPad/Mac ก่อนตามที่ผู้ใช้เลือก แล้วกลับมาทดสอบ Windows N2.1 เมื่อมีเครื่องจริง และทำ N2.2 สำหรับ submit/grant/resume/presence ต่อ ผล Mac+iPad+iPhone ไม่ได้ทำให้ Windows, automation หรือ N2 ทั้งเฟสผ่าน

## แหล่งอ้างอิง

- [SEB file format](https://safeexambrowser.org/developer/seb-file-format.html)
- [SEB Config Key และ JavaScript API](https://safeexambrowser.org/developer/seb-config-key.html)
- [SEB 3.7.1 for iOS release notes](https://safeexambrowser.org/ios/ios_release_notes_en.html)
- [Apple plnd reader](https://github.com/SafeExamBrowser/seb-mac/blob/b56ae815a30f35cc26cc78a5c2597c9bdcfb1a53/Classes/ConfigFiles/SEBConfigFileManager.m#L167)
- [Windows binary parser](https://github.com/SafeExamBrowser/seb-win-refactoring/blob/20ca462306636421fe53a804cc8f55941f9d21b6/SafeExamBrowser.Configuration/DataFormats/BinaryParser.cs#L78)
- [Apple callback bridge](https://github.com/SafeExamBrowser/seb-mac/blob/b56ae815a30f35cc26cc78a5c2597c9bdcfb1a53/Classes/BrowserComponents/SEBAbstractModernWebView.swift#L73)
