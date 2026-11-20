# รูปข้อย่อยและปุ่มเฉลยถูก–ผิด — 20 พฤศจิกายน 2026

เจ้าของอนุมัติให้นำการแก้ในแชทนี้ขึ้นเว็บจริง โดยแยกจากงานอื่นที่ค้างใน primary checkout

## ขอบเขต

- ทุกข้อความย่อยของถูก–ผิดเพิ่มรูปประกอบได้ ข้อหลักเก็บรูปในช่องเดิม ข้อย่อยใช้ optional `extra_data.statements[].image_urls` โดยไม่มี migration
- ปุ่มเฉลยข้อหลักและข้อย่อยสูง 44px กว้างตามข้อความ มีสถานะและ focus สำหรับคีย์บอร์ด
- รูปติดกับข้อความย่อยในตัวอย่าง หน้าทำข้อสอบ คลังฝึก และหน้าตรวจครู Safe DTO เก็บรูปและตัด answer key เหมือนเดิม
- Word อ่านรูปในย่อหน้าข้อความย่อย หรือย่อหน้าที่มีแต่รูปต่อจากข้อความนั้น คู่มือและไฟล์ตัวอย่างพร้อม round-trip test รองรับแล้ว ไม่ใช้พิกัด floating เพื่อเดาความสัมพันธ์
- ไม่มี auth/RLS/Storage policy หรือ scoring change ใช้ตัวอัปโหลดเดิม

## Candidate และ primary

- Release branch `codex/true-false-images-release-20261120` ตั้งจาก Production `71bdee02eeec931be0728c85e706b10754c45eac`
- Primary `/Users/korkusonmasaen/Korkru/korkru` branch `codex/student-classroom-cards` เป็น shared dirty checkout จึงแยกเฉพาะ scope ไม่ reset/stash/stage งานอื่น
- Local ก่อนปล่อยผ่าน TypeScript, token lint, production build, 4,947 tests และ 226 targeted tests หลังแก้ parser รอบสุดท้าย
- Browser local ที่ 390px ปุ่มสูง 44px ทุกข้อ เพิ่มข้อย่อยแล้วมีช่องรูปครบ ไม่ล้นแนวนอน เก็บ URL ในร่างและแสดงรูปในตัวอย่างได้ Next.js MCP ไม่มี runtime/compilation error
- Candidate ใช้ค่า public จำลองสำหรับ local build ไม่มีการนำ Production credentials หรือข้อมูลจริงไปทดสอบ

## Candidate validation

ผ่าน TypeScript, token lint, production build ด้วยค่า public จำลอง และ full test suite ของ candidate โดยไม่มีการเรียกฐานข้อมูลจริง

## สถานะ

กำลังตรวจ candidate และเตรียม Staging ก่อน Production ไม่ได้เปลี่ยนข้อมูล Production เพื่อทดสอบ
