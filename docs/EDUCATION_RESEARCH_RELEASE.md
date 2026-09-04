# บันทึกการปล่อยวิจัยการศึกษา ระยะที่ 4

อัปเดตล่าสุด: 4 กันยายน 2569

## ขอบเขตการปล่อย

ระยะ 4 นำความสามารถวิจัยพัฒนาผู้เรียนแบบกลุ่มเดียววัดก่อน–หลังที่เสร็จในระยะ 2.1–2.5 และผ่าน technical/read-only UAT ระยะ 3.1 เข้า `master` เพื่อ deploy ผ่าน GitHub integration ของ Vercel

source release คือ branch `feat/education-research-uat` ที่ commit `7669d60` ซึ่งต่อยอดจาก export commit `732d98a` และ `master` เดิม `520bb7a` โดยไม่มีการแก้ schema เพิ่มในระยะ 4

## การตัดสินใจของระยะ 4

1. เปิดเป็น **รุ่นทดลองควบคุม** ไม่ประกาศว่า UAT ห้องจริงผ่าน เพราะระยะ 3.2 ยังไม่มีโครงการจริงให้ตรวจหลายบทบาท
2. ไม่สร้างโครงการ คะแนน หรือนักเรียนสมมติใน production เพื่อให้หน้าจอจริงแสดงเฉพาะข้อมูลจริง
3. ใช้ห้องคุมสอบสดจาก assignment ของรอบก่อน/หลัง ไม่สร้างระบบ realtime ซ้ำในโมดูลวิจัย
4. ไม่แก้ข้อความหน้าตรวจสอบ wizard ในระยะนี้ เพราะเป็นงาน UI ที่ต้องมีภาพร่างอนุมัติก่อน
5. ปล่อย schema ที่ใช้งานอยู่ตาม migration history เดิม ไม่มี `supabase db push` ในระยะ 4
6. ถ้าต้องย้อนรุ่น ให้สร้าง revert commit บน `master` และปล่อยผ่านเส้นทางปกติ ห้าม reset, force push หรือแก้ migration ที่ apply แล้ว

## เกณฑ์ก่อน merge

- Preview deployment ของ `7669d60` สำเร็จ
- `npm test`, `npx tsc --noEmit`, `npm run lint:tokens` และ `npm run build` ผ่านจาก source เดียวกับที่จะ merge
- local/remote migration history ตรงกัน และไม่มี migration ค้าง
- คู่มือครูอยู่ใน `docs/EDUCATION_RESEARCH_USER_GUIDE.md`

## เกณฑ์หลัง deploy

- Vercel production deployment ของ `master` สำเร็จ
- หน้าแรกและเส้นทาง authentication ตอบสนองปกติ
- `/research` ป้องกันผู้ไม่ล็อกอิน และบัญชีครูที่ล็อกอินเห็นข้อมูลจริง/empty state โดยไม่เกิด console error
- ไม่มีการเขียน fixture ระหว่าง smoke test
- บันทึก commit, deployment URL, เวลา และผล smoke test ในเอกสารนี้

## บันทึก deployment

สถานะ: รอ merge และ production smoke test

## งานที่ยังเหลือหลังปล่อย

- ทำ checklist ระยะ 3.2 ด้วยโครงการและคะแนนห้องจริงให้ครบ 6 ข้อใน `docs/EDUCATION_RESEARCH_UAT.md`
- ทำภาพร่างและขออนุมัติก่อนปรับข้อความหน้าตรวจสอบ wizard สำหรับกรณี manual/Excel
- งานวิจัยหลายกลุ่ม แบบทดลองอื่น และการเขียนรายงานทั้งฉบับยังอยู่นอกขอบเขตรุ่นนี้
