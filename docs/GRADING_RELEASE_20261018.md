# เผยแพร่หน้าตรวจคะแนน — 18 ตุลาคม 2026

เจ้าของอนุมัติให้ apply ฐานข้อมูลจริงและขึ้นเว็บจริงในแชทนี้ หลังพัฒนาโลคอลเสร็จ ไม่รวมไฟล์ PDF preview/patch และ tsconfig ที่ค้างก่อนเริ่มงาน

## โค้ดและขอบเขต

เริ่ม release จาก `origin/master` ที่ `1b85c28` เพื่อรักษางาน auth และคลังโจทย์ที่เผยแพร่ใหม่กว่าโลคอลเดิม นำเฉพาะ 7 คอมมิต `5994884`, `32988ea`, `96d28d4`, `0b6cfc2`, `2287268`, `b0cf849`, `2a9efb2` มารวม ไม่ย้ายประวัติ SEB โลคอลที่ยังไม่ได้ปล่อย ไม่ force push และไม่ใช้โฟลเดอร์เก่าทับ master

เจ้าของกำลังพัฒนารหัสผ่าน สมัครสมาชิก และอีเมลในอีกแชท ห้ามแก้ source/config ส่วนเหล่านี้ ตรวจ byte-for-byte 47 ไฟล์เทียบ master เดิมและ Staging merge แล้วตรงกันทั้งหมด มีเพียง topbar เรียกตัวเตือนคะแนนที่ยังไม่บันทึกก่อนเรียก logout เดิม ไม่แก้ logout action หรือ auth logic

## แผนฐานข้อมูลที่ตรวจแล้ว

ลำดับเฉพาะงานนี้: `20261018005611` → `20261018040444` → `20261018133739` ทั้งสามยังไม่ apply ขณะตรวจ ใช้ transaction เดียว กำหนด lock/statement timeout และล็อก submissions ก่อน submission_answers ให้ตรงกับ finalizer เดิม ไม่รัน db push/repair ย้อน migration เก่าที่ค้าง

ปรับเฉพาะ migration `040444` ที่ยังไม่ apply เพิ่ม private `grading_rollout_backups` ก่อน backfill เก็บเฉพาะคะแนน/สถานะ/รุ่น ไม่เก็บคำตอบ เฉลย รูป หรือข้อมูลชื่อผู้เรียน เปิด RLS ถอนสิทธิ์ browser และให้ service role อ่านได้เท่านั้น ปฏิเสธข้อมูลคะแนนผิดช่วง/ข้อส่งไฟล์ใน streak/คะแนนที่ผูกงานวิจัยซึ่งต้องแยกแผน และ UPDATE header เฉพาะค่าที่เปลี่ยน

ตรวจ Production แบบ aggregate: คำตอบ 5,161 แถว, คำตอบในรอบกำลังทำ 3,916 แถว, finished headers 115, เครดิตไฟล์อัตโนมัติที่จะกลับไปรอครูตรวจ 3 แถวใน 3 รอบ, affected streak 0, mapped research finished headers 0 ไม่ปิดหรือลบ active attempts และไม่สร้างข้อมูลทดสอบใน Production

SQL tests ใช้ guard/finalizer/trigger จาก baseline จริงติดตั้งก่อน migration ผ่าน 57 เคส และ release ที่รวม master ผ่าน 309 ไฟล์/4,099 tests แล้ว ต้องผ่าน Staging และตรวจ deployment ก่อนบันทึกว่าเผยแพร่สำเร็จ

## สถานะการดำเนินการ

Staging ใช้ทั้งสาม SQL สำเร็จใน transaction เดียวและบันทึก ledger ตรงแล้ว ฟังก์ชัน 16 ตัวตรงกับ SQL ที่ commit, ตาราง private 8 ตารางเปิด RLS/ไม่มีสิทธิ์ browser, snapshot อ่านได้เฉพาะ service role มี 3 finished headers และไม่มีเนื้อหาคำตอบ

Staging branch `6ccd858` / Vercel `dpl_9qsJFePjXjktCazFKHJkEtBQaFm1` READY และ alias `staging.korkru.com` ตรงกัน ทดสอบ `scripts/verify-grading-staging.mjs` ผ่านด้วยครูจำลอง 2 / นักเรียนจำลอง 2: private draft ไม่เปลี่ยนคะแนน/notification, ครูอื่นอ่านร่างไม่ได้, stale revision/invalid batch rollback, browser/student/outsider ถูกปฏิเสธ, publish แบบ atomic แจ้งคนละครั้ง, retry ไม่ซ้ำ, แก้เฉพาะวิธีทำเป็น 0 ไม่เปลี่ยนส่วนคำตอบที่ยังรอตรวจ, ข้อความแจ้ง generic ทั้งงานซ่อน/แสดงคะแนน ใช้ข้อมูลสังเคราะห์และอ่าน environment เดิมในหน่วยความจำ ไม่คัดลอก project keys ไปไฟล์ใหม่ ไม่ทดสอบ signup/recovery/ส่งอีเมล

Runner รองรับ service JWT เดิมและ opaque `sb_secret_` โดยบังคับ project URL/anon JWT ของ Staging และผ่าน read-only schema/RPC ก่อนสร้างข้อมูล มี 19 offline fence checks ผ่าน รุ่นแรกพบ fixture essay ส่ง null ในช่อง NOT NULL แก้เป็นค่าว่างและล้าง fixture รอบที่ล้มเหลวครบแล้ว

release ผ่าน TypeScript, lint:tokens และ production build แยก `.next-grading-release-build` ด้วย placeholder keys (ไม่มี network/data QA ใน build) คืน tsconfig ที่ Next สร้างชั่วคราวแล้ว กำลังทดสอบ UI จริงด้วย fixture ชั่วคราวก่อน Production apply/deploy
