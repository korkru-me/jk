# ตัวบอกขั้นตอน Exam UAT ถัดไป

อัปเดต: 20 กันยายน 2026

รันคำสั่งนี้เมื่อจะกลับมาทดสอบ:

```bash
npm run next:exam-uat
```

ระบบจะอ่านเฉพาะ `.env.qa.local`, `config/exam-uat-evidence.json` และ `config/seb-platform-evidence.json` แบบ read-only แล้วบอก **งานถัดไปหนึ่งข้อ** โดยไม่พิมพ์ URL, credential, key หรือค่ารุ่นที่บันทึกไว้

ลำดับที่ใช้:

1. ซ่อม manifest ถ้ารูปแบบผิด
2. สร้าง staging แยกและผ่าน isolation guard
3. iPhone → iPad → Mac → Windows responsive UAT
4. authenticated exam บน staging
5. recovery/proctor drill
6. SEB production-config gate: macOS → iPadOS → iOS → Windows
7. ล้างข้อมูล QA เป็นขั้นตอนสุดท้าย
8. รัน release gate และ regression/build จาก release candidate เดียวกัน

ถ้าทดสอบแล้วพบปัญหา ให้ตั้ง suite เป็น `failed` พร้อมวัน/รุ่นที่ไม่เป็นความลับ แก้โค้ดและทดสอบ suite เดิมซ้ำก่อนเดินต่อ ตัวบอกขั้นตอนจะไม่ข้าม suite ที่ยังไม่เป็น `passed`

ตัวตรวจบังคับด้วยว่า `qa-data-cleanup` ต้องผ่านหลัง suite อื่นทั้งหมดและเวลา cleanup ต้องไม่เก่ากว่าการทดสอบล่าสุด จึงไม่สามารถติ๊กล้างข้อมูลล่วงหน้าแล้วใช้ผลเดิมปิด release ได้
