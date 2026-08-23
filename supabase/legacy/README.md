# Legacy SQL ที่ไม่ใช่ migration

ไฟล์ในโฟลเดอร์นี้ถูกรันด้วยมือผ่าน Supabase SQL Editor ก่อนที่โปรเจกต์จะใช้
`supabase migration` และ **ถูก apply ไปแล้วบนฐานข้อมูลจริง** เก็บไว้เป็น
หลักฐานว่าตารางชุดแรกเกิดขึ้นมาอย่างไรเท่านั้น ไม่ใช่ไฟล์ที่ CLI จะรัน

- `sprint5_exam_system.sql` — สร้าง `assignments`, `submissions`,
  `submission_answers` ครั้งแรก ตอนนี้ทั้งสามตารางมีอยู่จริงใน production
  แล้ว (ตรวจแล้ว) เดิมไฟล์นี้วางอยู่ใน `supabase/migrations/` แต่ชื่อไม่ตรง
  รูปแบบ `<timestamp>_name.sql` CLI จึงข้ามและเตือนทุกครั้งที่รันคำสั่ง
  migration และถ้าเอาไปรันซ้ำจริงก็จะพัง เพราะเขียน
  `CREATE TYPE IF NOT EXISTS` ซึ่งไม่ใช่ syntax ที่ PostgreSQL รองรับ

อย่าย้ายไฟล์ในนี้กลับเข้า `supabase/migrations/`
