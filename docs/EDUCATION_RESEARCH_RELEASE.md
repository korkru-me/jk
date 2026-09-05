# บันทึกการปล่อยวิจัยการศึกษา ระยะที่ 4

อัปเดตล่าสุด: 4 กันยายน 2569

## ขอบเขตการปล่อย

ระยะ 4 นำความสามารถวิจัยพัฒนาผู้เรียนแบบกลุ่มเดียววัดก่อน–หลังที่เสร็จในระยะ 2.1–2.5 และผ่าน technical/read-only UAT ระยะ 3.1 เข้า `master` เพื่อ deploy ผ่าน GitHub integration ของ Vercel

source release คือ branch `feat/education-research-uat` ที่ commit `bec127b` ซึ่งรวม UAT hardening commit `7669d60`, export commit `732d98a` และเอกสารระยะ 4 แล้วนำเข้า `master` ด้วย merge commit `f7448f9` โดยไม่มีการแก้ schema เพิ่มในระยะ 4

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

ผลตรวจจาก source ก่อน merge:

- Preview deployment ของ `7669d60`: สำเร็จ
- `npm test`: 65 test files, 729 tests ผ่าน
- `npx tsc --noEmit`: ผ่าน
- `npm run lint:tokens`: ผ่าน ไม่มีไฟล์ถดถอย
- `npm run build`: ผ่าน และมี route งานวิจัย/ส่งออกครบ
- `supabase migration list`: local/remote ตรงกันถึง `20260904133949`; ไม่มี `supabase db push` ในระยะนี้

## เกณฑ์หลัง deploy

- Vercel production deployment ของ `master` สำเร็จ
- หน้าแรกและเส้นทาง authentication ตอบสนองปกติ
- `/research` ป้องกันผู้ไม่ล็อกอิน และบัญชีครูที่ล็อกอินเห็นข้อมูลจริง/empty state โดยไม่เกิด console error
- ไม่มีการเขียน fixture ระหว่าง smoke test
- บันทึก commit, deployment URL, เวลา และผล smoke test ในเอกสารนี้

## บันทึก deployment

สถานะ: **deploy production สำเร็จ และ public/auth-guard smoke test ผ่าน**

- Merge commit: `f7448f95bd3c68c2f6c83a238553fb0576d58aea`
- Production deployment ID: `6266510692`
- Vercel deployment URL: `https://jk-200z4dw1k-korkru-mes-projects.vercel.app`
- Production alias ที่ตรวจ: `https://jk-three-beta.vercel.app`
- Vercel รายงานสำเร็จ: 4 กันยายน 2569 เวลา 21:31:55 น. (Asia/Bangkok)
- หน้า `/` ตอบสนองและแสดงหน้า KorKru โดยไม่มี console error/warning
- ผู้ไม่ล็อกอินเข้า `/research` ถูกส่งไป `/login` ถูกต้อง และหน้าเข้าสู่ระบบแสดงครบโดยไม่มี console error/warning
- ตรวจ auth guard ซ้ำทั้ง in-app browser และ Chrome ได้ผลตรงกัน
- ไม่ได้สร้าง แก้ หรือลบโครงการ นักเรียน คะแนน หรือ fixture ใดระหว่าง smoke test

ข้อจำกัดของ smoke test: browser ทั้งสองไม่มี production session ที่ล็อกอินอยู่ จึงยังไม่ได้ตรวจ `/research` หลังล็อกอินบน production ในรอบนี้ การตรวจ authenticated read-only เคยผ่านบน local ที่ต่อฐานข้อมูลจริงในระยะ 3.1 แล้ว แต่ไม่ถือเป็นหลักฐานแทน production session รายการนี้จึงรวมอยู่กับ UAT โครงการจริงระยะ 3.2

## งานที่ยังเหลือหลังปล่อย

- ทำ checklist ระยะ 3.2 ด้วยโครงการและคะแนนห้องจริงให้ครบ 6 ข้อใน `docs/EDUCATION_RESEARCH_UAT.md`
- ทำภาพร่างและขออนุมัติก่อนปรับข้อความหน้าตรวจสอบ wizard สำหรับกรณี manual/Excel
- งานวิจัยหลายกลุ่ม แบบทดลองอื่น และการเขียนรายงานทั้งฉบับยังอยู่นอกขอบเขตรุ่นนี้
