# Staging สำหรับทดสอบเส้นทางสอบจริง

อัปเดต: 20 กันยายน 2026

เส้นทาง login → เริ่มสอบ → autosave → reload/resume → upload → submit → ผลฝั่งครู เขียนข้อมูลจริง จึงห้ามทดสอบกับ Supabase production ปัจจุบัน เฟส 5 เตรียม guard แบบ read-only ไว้แล้ว แต่ยังไม่สร้างบัญชีหรือข้อมูลใด ๆ

## สิ่งที่ต้องมีภายหลัง

1. Supabase project สำหรับ staging แยกจาก production พร้อม migrations ชุดเดียวกัน
2. Vercel Preview/โครงการ staging ที่ใช้โดเมน HTTPS แยกจาก production
3. บัญชี QA ครูหนึ่งบัญชีและนักเรียนหนึ่งบัญชีที่ไม่มีข้อมูลบุคคลจริง
4. ห้อง/ข้อสอบ fixture แยก มีข้อความ คำตอบ รูป และ PDF สมมติเท่านั้น
5. ค่า SEB ของ staging แยกจาก production และไฟล์ `.seb` ชี้ canonical staging URL

คัดลอก `.env.qa.example` เป็น `.env.qa.local` แล้วใส่ค่าของ staging จาก secret manager จากนั้นรัน:

```bash
npm run check:exam-staging
```

คำสั่งนี้อ่าน `.env.qa.local` เท่านั้น ไม่อ่าน `.env.local`, ไม่เรียก network/ฐานข้อมูล, ไม่แสดง URL/key ที่ตั้งไว้ และจะบล็อกเมื่อพบ production deployment, staging/production site ซ้ำกัน หรือใช้ Supabase project เดียวกัน

การผ่าน preflight ยังไม่พิสูจน์ว่า migrations, RLS, Storage, Realtime, SMTP หรือ route ทำงาน ต้องตรวจ network/data ต่อเมื่อ staging แยกพร้อมแล้วเท่านั้น

