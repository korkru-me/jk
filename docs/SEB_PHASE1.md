# SEB รายข้อสอบสำหรับ SaaS — เฟส 1: ชุดทดลองรูปแบบไฟล์และ Config Key

อัปเดต 5 กันยายน 2026

สถานะ: **ส่วนโค้ดทดลองและ automated tests พร้อม; ยังไม่ผ่าน native SEB บน Mac/iPad/Windows จึงยังไม่จบการพิสูจน์ความเข้ากันได้ของเฟส 1**

เอกสารนี้เป็นงานใหม่สำหรับรหัสออกที่แยกครู/ข้อสอบ ไม่ใช่ “เฟส 1–7 ระบบสอบปลอดภัย” เดิมใน [SEB_SETUP.md](SEB_SETUP.md) และไม่เปลี่ยนพฤติกรรมเว็บจริง

## ขอบเขตที่ทำแล้ว

- เพิ่มเครื่องมือ offline ใน `scripts/seb-phase1/` สร้างไฟล์ทดลอง A/B ที่มีรหัสออกต่างกัน โดยค่าตั้งค่าอื่นเหมือนกันทุกตัว เพื่อแยกผลของการเปลี่ยนรหัสออกให้ชัดเจน
- เพิ่ม A-modified ที่เปลี่ยน Start URL ของ A แล้วเข้ารหัสใหม่อย่างถูกต้อง ใช้แยก “ไฟล์ถูกแก้ policy จึง CK ไม่ตรง” ออกจาก “ไฟล์เสีย/HMAC ไม่ผ่าน”
- สร้าง CK จากชุดค่าที่เครื่องมือสร้างเอง ไม่อ่านหรือถอดรหัสไฟล์ production ไม่รับรหัสจริงจากผู้ใช้ ไม่อ่าน `.env` ไม่เชื่อม Vercel/Supabase
- มีคำสั่งเทียบ CK ที่คัดลอกจากเครื่องจริงแบบ manual; ผล MATCH เป็นเพียงการเทียบข้อความ ไม่ใช่การยืนยันแอปหรือสิทธิ์เข้าสอบ
- ไฟล์และ manifest ถูกสร้างในโฟลเดอร์ใหม่ทุกครั้งใต้ `.local/seb-phase1-*` ซึ่ง git ignore แล้ว บน POSIX โฟลเดอร์เป็น `0700` และไฟล์เป็น `0600`; manifest มีเฉพาะ **รหัสสุ่มสำหรับ lab** และ CK ของ lab แต่ยังต้องเก็บเป็นส่วนตัว
- ไม่เพิ่มหน้าครู/นักเรียน, route, database, migration หรือ SEB Server และไม่เปลี่ยน gate CK **และ** BEK เดิม

ไฟล์ทดลองเป็น **format fixture ไม่ใช่ production lockdown template**: ผ่อนคลายข้อจำกัดบางส่วนเพื่อแก้ไข/กู้คืนบน desktop, เปิดการตั้งค่า และใช้ `https://example.invalid/korkru-seb-phase1` ซึ่งไม่มีเว็บจริงโดยตั้งใจ ห้ามแจกให้นักเรียน ห้ามอัปโหลดแทน `/exam/korkru-production-v1.seb`

## ผลตรวจที่ทำได้จริง

- `npm run seb:phase1:test`: 24 tests ผ่าน ครอบคลุม vectors การเข้ารหัสจากแหล่งอิสระ, serialization, ขอบเขตขนาด/ชนิดข้อมูล, wrong password, ciphertext tamper, A/B/modified CK mismatch, การสร้างไฟล์ส่วนตัว และการปฏิเสธข้อความแชร์ไฟล์ที่ไม่ใช่ CK
- `npm test`: 753 tests / 67 test files ผ่าน รวม regression ของระบบเดิม (มี Node deprecation warning จาก test runner แต่ไม่ทำให้ทดสอบล้มเหลว)
- Apple `plutil` อ่าน XML ที่สร้างได้ รวม UTF-8, XML escaping และ binary data — ยืนยันความถูกต้องของ plist **ไม่ได้ยืนยันว่า native SEB จะคำนวณ CK ตรง**
- สร้างไฟล์จริงครบ A/B/A-modified และตรวจว่า private manifest ถูก git ignore
- Production verifier `lib/seb.ts` ยังปฏิเสธกรณีไม่มี BEK/BEK ผิด แม้ CK ถูกต้อง; BEK ที่ unit test ใช้เป็นค่าจำลอง ไม่ใช่ key ที่อ่านจาก SEB จริง
- ยังไม่ได้ทดสอบ native import/decrypt, CK จาก native app, รหัสออก A/B, JavaScript API proof แบบ end-to-end หรือเส้นทาง login → สอบ → ส่ง → ออกบนอุปกรณ์จริง
- พบ SEB 3.7 ติดตั้งบน Mac แต่เครื่องมือตรวจ UI เปิดแอปแล้วเชื่อมต่อไม่สำเร็จ ผู้ใช้ปิดแอปแล้ว ไม่มีผล native test ที่ยืนยันได้ **ต้องแจ้งผู้ใช้ก่อนเปิด SEB อีกครั้ง**

ไม่มี TypeScript หรือ runtime ของเว็บเปลี่ยน จึงไม่ได้รัน TypeScript check, production build หรือ UI lint ในงานนี้ ไม่มี migration และไม่ได้ deploy

## รันบนเครื่องนักพัฒนา

ต้องมี Node.js 20+ และติดตั้ง dependencies ของ repo แล้ว รันจากโฟลเดอร์ `korkru`:

```sh
npm run seb:phase1:test
npm run seb:phase1:generate
```

คำสั่งที่สองจะแสดงเฉพาะที่อยู่โฟลเดอร์ใหม่ ไม่แสดงรหัส และ **ไม่เปิดแอป** ภายในมี:

- `READ-ME-FIRST.txt`: คำเตือนก่อนเปิดไฟล์
- `LAB-ONLY-a.seb`, `LAB-ONLY-b.seb`, `LAB-ONLY-a-modified.seb`
- `private-manifest.json`: รหัสเปิดไฟล์ (`openingPassword`), รหัสแก้ตั้งค่า (`adminPassword`), รหัสออก (`quitPassword`), CK ที่คาดหวัง และ SHA-256 ของแต่ละไฟล์ ทั้งสามรหัสทำหน้าที่ต่างกัน

A/B ใช้รหัสเปิดไฟล์และรหัสตั้งค่าชุดเดียวกันเฉพาะใน lab เพื่อให้ config ต่างกัน **เฉพาะ hashedQuitPassword**; production ต้องออกแบบ ownership/rotation แยกต่อครูและข้อสอบอีกครั้ง ไม่ใช้รหัสใน lab เป็นค่าเริ่มต้น

เมื่อได้ **Config Key 64 ตัว** จากไฟล์ทดลองบน native SEB แล้ว สามารถเทียบกับ A โดยแทนชื่อโฟลเดอร์จริง:

```sh
npm run seb:phase1:compare -- .local/seb-phase1-REPLACE-ME a
```

วาง CK เมื่อมี prompt ไม่ใส่ใน command line หรือ git; prompt นี้รับเฉพาะ key ของ lab และข้อความที่พิมพ์อาจมองเห็นใน terminal อย่าวาง key production ผลที่คาดหวังคือ CK ของ A → MATCH; CK ของ B/A-modified เมื่อนำไปเทียบกับ A → MISMATCH

`SEB Config File for starting an exam` เป็นข้อความแชร์ไฟล์ ไม่ใช่ CK ส่วน Browser Exam Key ก็ไม่ใช่ Config Key อย่านำมาเทียบแทนกัน

## Native test ที่ยังต้องทำร่วมกับผู้ใช้

1. นัดเวลาที่ไม่อยู่ระหว่างสอบ บันทึกงานอื่น และเก็บรหัสออกของ lab ไว้นอกอุปกรณ์ก่อน ยังไม่ดับเบิลคลิกไฟล์โดยไม่เตรียมทางออก โดยเฉพาะ iPad ที่อาจเข้า assessment mode
2. เริ่ม Mac จากหน้าตั้งค่า SEB: **Configuration → Open Settings…** เลือก `LAB-ONLY-a.seb` ใส่ `openingPassword` เมื่อถูกถาม ถ้ายังเข้าหน้าตั้งค่าไม่ได้ ให้หยุดจัดการการเปิด preferences ให้เรียบร้อยก่อน ไม่ต้อง Apply เพื่อเทียบ CK
3. ไป **Exam → Config Key** เทียบกับ A ใน manifest หรือคำสั่ง compare **ห้าม Save/Save As ซ้ำ** เพราะ native SEB อาจเพิ่ม defaults ทำให้ไฟล์/CK เปลี่ยน
4. เปิด B และ A-modified ด้วยวิธีเดียวกัน เทียบกับ CK ของตัวเองว่าตรง และเทียบกับ A ว่าไม่ตรง ทดลองรหัสเปิดไฟล์ที่ผิดว่าถูกปฏิเสธ
5. แยกทดสอบการเริ่ม session และรหัสออก: A ต้องยอมรับรหัส A และปฏิเสธรหัส B; B ต้องทำกลับกัน หน้า `example.invalid` โหลดไม่ได้เป็นพฤติกรรมที่ตั้งใจไว้ **ไม่ใช่การทดสอบเว็บ KorKru**
6. ทำซ้ำกับไฟล์ต้นฉบับเดิมบน iPad และ Windows ใน build ที่จะรองรับ บันทึก OS/SEB version/build และผล ไม่อนุมานจาก Mac ว่าอีก OS ผ่านแล้ว บน iPad เมนูอาจใช้ **Exam Session → Share Keys**; ต้องเลือก CK และ Only Keys โดยไม่แก้ config หาก clipboard ถูกแยก/ล้างหลังออก ให้หยุดหาวิธีเก็บเฉพาะ key ของ lab ก่อน ไม่ปิดความปลอดภัยของ config production เพื่อแก้ปัญหานี้
7. เก็บผลในหัวข้อนี้หรือเอกสารผลทดสอบที่ตามมา โดยบันทึกเพียง case/platform/version/pass/fail ไม่ commit รหัส, CK, BEK หรือ raw request hash

ก่อนถือว่า compatibility ผ่าน ต้องเห็น CK จาก native SEB ตรงกับค่าที่สร้างสำหรับ A/B และรหัสออกแยกกันจริงทุกแพลตฟอร์มที่ประกาศรองรับ หากไม่ตรง ให้แก้ serializer/template จากหลักฐาน native ก่อนเดินต่อ ไม่กรอกผลให้ผ่านเอง

## ข้อค้นพบและการตัดสินใจก่อนต่อเข้าระบบจริง

**สร้างรหัสออกคนละข้อสอบได้ แต่ไม่ได้หมายความว่าเปลี่ยนแค่ช่อง password แล้วใช้ BEK เดิมต่อได้**

CK คำนวณบน server ได้และผูกกับ config; BEK ผูกกับ config และ SEB build ด้วย การย้าย BEK จาก Vercel ลง database อย่างเดียวจึงยังทิ้งภาระเก็บ BEK ใหม่ต่อ config/build เอาไว้ ตาม [SEB integration specification](https://safeexambrowser.org/developer/seb-integration.html)

ข้อเสนอสำหรับการสำรวจถัดไป: พิสูจน์การเชื่อม **SEB Server + App Signature Key (ASK) + server-driven BEK** เพื่อรักษาการตรวจตัวแอปโดยไม่ให้ครู copy BEK ใหม่ทุกข้อสอบ ฟีเจอร์เหล่านี้เป็นส่วนของ server sessions ไม่ใช่ raw key อีกช่องที่อ่านจาก JavaScript API เดิมแล้วใช้แทนได้ทันที ดู [SEB Windows 3.5 release](https://github.com/SafeExamBrowser/seb-win-refactoring/releases/tag/v3.5.0), [iOS release notes](https://safeexambrowser.org/ios/ios_release_notes_en.html) และ [macOS release notes](https://safeexambrowser.org/macosx/mac_release_notes_en.html)

นี่เป็น **แนวทางเสนอ ไม่ใช่ integration ที่ทำแล้วหรือรับรองแล้ว** ต้องตกลงขอบเขตการรัน SEB Server, tenant isolation, trusted-build/ASK policy, การจับคู่ KorKru assignment/session และการปฏิเสธเมื่อ server/integrity check ใช้ไม่ได้ก่อน implement ไม่ให้ครูรับรอง unknown ASK เองอย่างอิสระและไม่อนุมัติ build จากจำนวนเครื่องที่ส่งค่าเหมือนกันเพียงอย่างเดียว

หากไม่เลือก SEB Server ทางเลือกยังต้องคง BEK ต่อ config/build พร้อมภาระ enrollment หรือยอมรับ CK-only ที่ให้ assurance ต่ำกว่าอย่างชัดเจน **เฟสนี้ไม่เปลี่ยนไปใช้ CK-only**, ไม่สร้าง BEK ปลอมจาก CK และไม่เปลี่ยนเอกสาร security ให้ลดข้อกำหนดโดยอัตโนมัติ

เรื่อง “ส่งแล้วออกได้/ครูอนุญาตให้ออกกลางคัน” ยังไม่ได้ทำในเฟสนี้: Quit URL ถูกตรวจโดยตัว SEB เอง การซ่อนปุ่มหรือวางเงื่อนไขที่ HTTP handler ของ Quit URL คงที่ไม่ได้เป็นหลักฐานว่ากันการออกก่อนส่งได้ ต้องออกแบบการอนุญาตราย session และทดสอบ native behavior รวมกรณีส่งไม่สำเร็จ, URL หลุด/ถูกเรียกก่อนเวลา, ข้ามครู/ข้อสอบ และ reconnect ก่อนรับรอง ดู [คู่มือ Quit Link](https://safeexambrowser.org/macosx/mac_usermanual_en.html#link-to-quit-seb-after-exam)

ก่อนเพิ่มหน้าครูตั้งรหัสในเฟสถัดไปยังต้องกำหนด version ของ config: รหัสใหม่ในเว็บไม่เปลี่ยนไฟล์ที่แจกไปแล้วหรือ session ที่กำลังเปิดอยู่ทันที ห้ามอ้างว่า rotation ยกเลิกรหัสเก่ากลางสอบได้จนกว่าจะมี protocol รองรับและพิสูจน์จริง

## รายละเอียด format และแหล่งอ้างอิง

- รองรับเฉพาะ `sebConfigPurpose = 0` (starting exam), envelope `gzip(pswd + RNCryptor-v3(gzip(plist)))` ใช้รหัสเปิดไฟล์ดิบ ไม่ใช่การ hash รหัสแบบ `pwcc` สำหรับ configuring clients
- RNCryptor v3: header `03 01`, salts 8+8 bytes, IV 16 bytes, PBKDF2-HMAC-SHA1 10,000 rounds, AES-256-CBC และ HMAC-SHA256 ของ header+ciphertext; ตรวจ HMAC ก่อน decrypt ใช้ Node crypto ไม่เขียน primitive เอง
- อ้างอิง code SEB Mac **3.7**, commit `88b7f8df3c96781197efe400b8a2cbd818524736`: [SEBConfigFileManager.m](https://github.com/SafeExamBrowser/seb-mac/blob/88b7f8df3c96781197efe400b8a2cbd818524736/Classes/ConfigFiles/SEBConfigFileManager.m), [RNCryptor.m](https://github.com/SafeExamBrowser/seb-mac/blob/88b7f8df3c96781197efe400b8a2cbd818524736/Classes/Cryptography/RNCryptor.m), [SEBCryptor.m](https://github.com/SafeExamBrowser/seb-mac/blob/88b7f8df3c96781197efe400b8a2cbd818524736/Classes/Cryptography/SEBCryptor.m)
- [SEB file format page](https://safeexambrowser.org/developer/seb-file-format.html) มีรายละเอียด encryption รุ่นเก่า จึงตรึง v3 ตาม source รุ่นที่ตรวจ ไม่ใช้ version/options เก่าแบบตรงตัว
- Test known-answer vectors มาจาก [RNCryptor-Spec v3](https://github.com/RNCryptor/RNCryptor-Spec/blob/7aa27298df4d66476e06efeeeeecc6228df6cfbd/vectors/v3/password) ไม่ได้สร้าง expected ciphertext ด้วย implementation ที่กำลังทดสอบ
- [CK specification](https://safeexambrowser.org/developer/seb-config-key.html): สร้าง SEB-JSON แบบเรียงชื่อ key case-insensitive ทุกชั้น ไม่ escape strings แบบ JSON ปกติ, ไม่รวม `originatorVersion`/empty dictionaries, binary เป็น base64 แล้ว SHA-256; request hash ผูก URL ที่ไม่มี fragment กับ CK
- Serializer ของ lab **ไม่ใช่ตัวแปลง config ใดก็ได้**: รับ ASCII setting names, strings ที่ XML รองรับ, bool, safe integer, Buffer, dictionaries และ arrays แบบจำกัด; ปฏิเสธ floats/date/null/cycles/accessors/case-colliding names/nested arrays และเกิน 1 MiB/16 levels/10,000 nodes ใช้เฉพาะค่าที่ lab สร้างเอง ยังต้องมี cross-platform vectors เพิ่มก่อนรับ config ภายนอก
- รหัส lab เป็น printable ASCII เท่านั้นเพื่อตัดปัญหาความยาว UTF-8 ของ password derivation ใน native implementation บางรุ่น นี่ไม่ใช่ข้อสรุปว่ารหัสครูในผลิตภัณฑ์ต้องจำกัด ASCII ตลอดไป ต้องตรวจ normalization/compatibility เพิ่มก่อนออกแบบ UX จริง

## ขอบเขตที่ห้ามข้ามในงานถัดไป

อย่า merge prototype เข้าทาง download/auth ของ production โดยตรง อย่าแก้ไฟล์ production, `SEB_CONFIG_KEY`, `SEB_BROWSER_EXAM_KEYS` หรือ session secret เพื่อทำให้ lab ผ่าน ไม่มี migration ที่ต้อง apply สำหรับเฟสนี้ งานถัดไปเริ่มจาก native test ที่ยังค้างและการเลือก integrity integration ข้างต้นก่อน
