# Staging operator — assignment-specific SEB artifact

คู่มือนี้เป็นขั้นตอนชั่วคราวสำหรับ internal operator เพื่อผูกไฟล์ `.seb` จริงกับ
ข้อสอบหนึ่งรายการและ quit-password revision หนึ่ง revision บน **isolated
Staging เท่านั้น** จนกว่าจะมี native build pipeline ที่เชื่อถือได้ ห้ามใช้กับ
Production และห้ามถือว่า automated test แทนการทดสอบบน Windows จริง

เครื่องมือแบ่งเป็นสองคำสั่งและเป็น dry-run โดยค่าเริ่มต้น ทั้งสองคำสั่งตรวจว่า
เป้าหมายคือ `https://staging.korkru.com`, Supabase เป็น Staging project ที่แยก
จาก Production และเปิด `SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS=true` ก่อนทำงาน
คำสั่งที่เปลี่ยนไฟล์หรือ Staging ต้องมี `--apply` ชัดเจน
เครื่องมือยังผูกกับ Supabase Staging project ที่ allowlist ไว้ใน repository;
เพียงตั้ง URL เปรียบเทียบคนละค่าไม่สามารถเปลี่ยนเป้าหมายไป Production ได้

## เงื่อนไขก่อนเริ่ม

- Phase 4 migration และ application version เดียวกันต้องอยู่บน isolated Staging
  ก่อน; คู่มือนี้ไม่ deploy และไม่ apply migration ให้เอง
- ใช้เฉพาะข้อสอบ online ชนิด exam ที่เป็น `draft`, บังคับ SEB, มี current
  quit-password revision ตรงกับเลขที่ระบุ และไม่มี attempt ที่กำลังทำ
- template ต้องเป็น plaintext test artifact ที่เปิดได้โดยไม่ถามรหัสก่อนเข้า,
  มี Administrator Password ที่แข็งแรง, Start URL เป็น
  `https://staging.korkru.com/assignments` และ Quit URL เป็น
  `https://staging.korkru.com/exam/quit`; รองรับทั้ง plist XML ตรง, gzip XML
  จาก native Windows และ container มาตรฐาน `gzip(plnd + gzip(XML))` แบบ
  passwordless โดยจะคงรูปแบบ container เดิมไว้
- เก็บ Staging credentials ใน `.env.qa.local` ที่ไม่ commit ห้ามใส่ secret,
  CK หรือ BEK ใน command line, chat, screenshot, log หรือ source control และบน
  POSIX ต้องจำกัด permission ของไฟล์ environment เป็น owner-only เช่น `chmod 600`

## 1. เตรียม seed สำหรับ revision ปัจจุบัน

ตรวจแบบ read-only ก่อน:

```sh
npm run seb:artifact:prepare -- \
  --assignment <assignment-uuid> \
  --revision <revision> \
  --template <plaintext-template.seb> \
  --output <assignment-rN-seed.seb>
```

เมื่อผลเป็น `ready` จึงรันคำสั่งเดิมพร้อม `--apply` คำสั่งจะอ่านเฉพาะ revision
ปัจจุบันจาก Staging, สร้างไฟล์ใหม่แบบห้าม overwrite และสิทธิ์ไฟล์ `0600`, ใส่
quit-password hash ของ revision นั้น, สุ่ม salt ใหม่, เปิด
`sendBrowserExamKey` และล้าง BEK เก่าจาก template เครื่องมือนี้ **ไม่คำนวณหรือ
ประดิษฐ์ CK/BEK**

## 2. Final save ด้วย native Windows SEB

ใช้ Safe Exam Browser for Windows **3.10.2 (x64), build 920** เท่านั้น

1. เปิด seed ด้วย SEB Configuration Tool และยืนยันว่า Config File ใช้สำหรับ
   `starting an exam`; Settings Password/Confirm Settings Password ต้องว่าง
2. อย่าเปลี่ยน Start URL, Quit URL, Quit/Unlock Password, Administrator
   Password, salt หรือ assignment settings ที่ seed ผูกไว้
3. ยืนยันว่า `Use Browser Exam Key and Configuration Key` เปิดอยู่
4. บันทึก final artifact หนึ่งครั้ง หลังบันทึกเสร็จแล้วจึงคัดลอก CK และ Windows
   BEK เป็นขั้นตอนสุดท้าย
5. หลังคัดลอก key แล้วห้ามแก้หรือบันทึก `.seb` ซ้ำ หากไฟล์เปลี่ยน ให้เริ่ม final
   save และคัดลอก key ใหม่

เก็บ evidence เป็นไฟล์ JSON local ที่สิทธิ์ `0600` และไม่ commit:

```json
{
  "schemaVersion": 1,
  "assignmentId": "<assignment-uuid>",
  "revision": 1,
  "configKey": "<64-hex CK copied from native SEB after final save>",
  "browserExamKeys": [
    {
      "platform": "windows",
      "versionString": "3.10.2",
      "buildNumber": "920",
      "key": "<64-hex BEK copied from native SEB after final save>"
    }
  ]
}
```

## 3. ตรวจและลงทะเบียน

dry-run ตรวจไฟล์ในเครื่องเท่านั้น ไม่อ่าน stdin, ไม่เรียก network และไม่เปลี่ยน
Storage/database:

```sh
npm run seb:artifact:enroll -- \
  --assignment <assignment-uuid> \
  --revision <revision> \
  --artifact <final-native-windows.seb>
```

เมื่อ dry-run ผ่าน จึงส่ง evidence ผ่าน stdin และเพิ่ม `--apply`:

```sh
npm run seb:artifact:enroll -- \
  --assignment <assignment-uuid> \
  --revision <revision> \
  --artifact <final-native-windows.seb> \
  --apply < <local-evidence.json>
```

คำสั่งตรวจ exact current revision/quit hash, `sendBrowserExamKey`, Windows
version/build และ canonical URLs ก่อน upload ด้วย path แบบ content-addressed
ที่ห้าม overwrite จากนั้น download กลับมาตรวจ byte length/SHA-256 และเรียก
service-role-only registration RPC ซึ่งตรวจ assignment, tenant, revision และ
active attempt ซ้ำแบบ atomic ผลลัพธ์แสดงเฉพาะ metadata ปลอดภัย ไม่แสดง CK/BEK
หรือ quit hash และคำสั่งไม่ publish ข้อสอบ

หาก upload สำเร็จแต่ registration ล้มเหลว ห้าม overwrite หรือลบ object แบบ
อัตโนมัติ ให้แก้สาเหตุแล้วรันคำสั่งเดิมอีกครั้ง ระบบจะ reuse ได้เฉพาะ object ที่
ดาวน์โหลดแล้วตรงกัน byte-for-byte เท่านั้น

## Release gate ที่ยังต้องทำด้วยคน

หลัง enroll สำเร็จ ให้ตรวจ teacher UI ว่า revision เดียวกันขึ้น
**พร้อมเผยแพร่**, ทำ physical UAT ด้วย synthetic account บน isolated Staging
และยืนยันว่าเปิดข้อสอบโดยไม่ถาม entry password, ระบบตรวจ CK/BEK ได้ และ Quit
Link หลังส่งข้อสอบปิด SEB ได้ตามนโยบาย จากนั้นครูจึง publish ด้วย flow ปกติ
