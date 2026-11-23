# ดรอปดาวน์ประเภทงานและชื่อ “งานอัปโหลดไฟล์” — 23 พฤศจิกายน 2026

เจ้าของอนุมัติให้นำสองส่วนที่ตรวจ local แล้วขึ้นเว็บจริง: ดรอปดาวน์ในหน้า “งานที่มอบหมาย” และการเปลี่ยนชื่อที่แสดงทั่วเว็บเป็น “งานอัปโหลดไฟล์”

## ขอบเขต

- ใช้ shared Select ในหน้า “งานที่มอบหมาย” แทนแถบปุ่ม 5 ประเภท คงค่าการกรอง ไอคอน และการเลือกเดิม Trigger/รายการมีพื้นที่กดอย่างน้อย 44px รองรับคีย์บอร์ด Escape และคลิกนอกเพื่อปิด
- ตัวกรองในหน้าคะแนนคงรูปแบบเดิม เปลี่ยนเฉพาะชื่อประเภทที่แสดง
- เปลี่ยนชื่อในเมนู ตัวกรอง ป้ายประเภท หน้าสร้าง/แก้ไข รายละเอียดงาน หน้านักเรียน ชื่อหน้า และข้อความข้อผิดพลาด ไม่เปลี่ยน identifiers, URLs, schema, ข้อมูลที่บันทึก หรือกติกาการส่ง/ให้คะแนน
- ไม่เปลี่ยน auth/RLS/Storage และไม่มี migration

## Candidate และ primary

- Release branch `codex/assignment-filter-upload-label-release-20261123` ตั้งจาก Production `343a5a5a9349b4a117ffed7d10628577462b8a57` ซึ่งรวมงานกลุ่ม/Admin ล่าสุดแล้ว
- Primary `/Users/korkusonmasaen/Korkru/korkru` branch `codex/student-classroom-cards` เป็น shared dirty checkout จึงไม่ pull/reset/stash/stage งานค้าง ใช้เฉพาะ hunks ของงานนี้และเก็บ digest ของ modified tracked files ไว้เทียบหลังปล่อย
- Local ก่อนปล่อยผ่าน TypeScript, token lint, production build และ 4,947 tests ตรวจครบ 5 ตัวเลือก คีย์บอร์ด/Escape/focus และสลับเมนูที่ไม่ถูก popup บังในคลิกเดียว
- บนจอ 390px แถบตัวกรองลดจาก 81.6px เป็น 44px, toolbar จาก 168px เป็น 130.4px และไม่มี horizontal overflow ตรวจชื่อใหม่ในหน้าสร้างและมุมนักเรียนด้วย fixture
- Candidate ใช้ public environment จำลองในการ build ไม่คัดลอก Production credentials หรือข้อมูลจริง

## สถานะ

Candidate ผ่าน TypeScript, token lint, production build และ 354 suites / 4,948 tests แล้ว กำลังเตรียม Staging ก่อน Production การตรวจ hosted จะใช้ fixture เท่านั้น ไม่มีการสร้าง/แก้/ลบข้อมูล Production เพื่อทดสอบ
