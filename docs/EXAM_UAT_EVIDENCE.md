# การบันทึกหลักฐาน Exam UAT แบบไม่เก็บข้อมูลลับ

อัปเดต: 20 กันยายน 2026

`config/exam-uat-evidence.json` ใช้จำว่า UAT ภายนอกส่วนใดผ่านแล้ว โดยจงใจใช้ schema ตายตัวและ **ไม่มีช่อง notes** เพื่อไม่ให้ชื่อเด็ก อีเมล คำตอบ ภาพหน้าจอ URL, token, CK/BEK หรือรหัสผ่านหลุดเข้า repository

## ชุดที่ต้องผ่าน

- `iphone-responsive` — หน้าข้อสอบบน iPhone จริง
- `ipad-responsive` — หน้าข้อสอบบน iPad จริง
- `mac-responsive` — หน้าข้อสอบบน Safari/Mac จริง
- `windows-responsive` — หน้าข้อสอบบน Windows จริง
- `authenticated-exam` — ครู/นักเรียนจำลองทำข้อสอบครบเส้นทางบน staging
- `recovery-proctor` — เน็ตหลุด/กลับ, resume, timer, Realtime fallback และหน้าคุมสอบ
- `qa-data-cleanup` — ลบบัญชี/attempt/answer/upload จำลองและตรวจว่าไม่ค้าง

## วิธีอัปเดตหลังทดสอบ

ให้แก้เฉพาะ 3 ค่าใน suite ที่ผ่านจริง:

```json
{
  "status": "passed",
  "testedAt": "2026-09-20T10:00:00.000Z",
  "testedVersion": "ios-26.6.1_safari_staging-build-123"
}
```

- `testedAt` ต้องเป็นเวลา ISO UTC จากวันที่ทดสอบจริง
- `testedVersion` ใช้เพียง OS/browser หรือชื่อ build ที่ไม่เป็นความลับ ไม่ใส่ URL, account, token หรือ key
- ถ้ายังไม่ได้ทดสอบให้คง `pending`, `testedAt: null` และ placeholder เดิมไว้
- ถ้าทดสอบแล้วไม่ผ่าน ใช้ `failed` พร้อม `testedAt`/`testedVersion` ของรอบที่พบปัญหา; หลังแก้ต้องทดสอบซ้ำก่อนเปลี่ยนเป็น `passed`
- ห้ามเพิ่ม field ใหม่ ตัวตรวจจะปฏิเสธทันที

หลังแก้ให้รัน:

```bash
npm run check:exam-uat
npm run check:exam-release
```

ผล native SEB เก็บแยกใน `config/seb-platform-evidence.json` และต้องอ้าง immutable revision/
build จาก `config/seb-release-registry.json` เพราะต้องผูกกับ production config/BEK gate
ส่วน manifest นี้ยืนยัน UX และ flow ภายนอกที่ SEB manifest ไม่ครอบคลุม
