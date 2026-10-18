# เผยแพร่หน้าตรวจคะแนน — 18 ตุลาคม 2026

เจ้าของอนุมัติให้ apply ฐานข้อมูลจริงและขึ้นเว็บจริงในแชทนี้ หลังพัฒนาโลคอลเสร็จ ไม่รวมไฟล์ PDF preview/patch และ tsconfig ที่ค้างก่อนเริ่มงาน

## โค้ดและขอบเขต

เริ่ม release จาก `origin/master` ที่ `1b85c28` เพื่อรักษางาน auth และคลังโจทย์ที่เผยแพร่ใหม่กว่าโลคอลเดิม นำเฉพาะ 7 คอมมิต `5994884`, `32988ea`, `96d28d4`, `0b6cfc2`, `2287268`, `b0cf849`, `2a9efb2` มารวม ไม่ย้ายประวัติ SEB โลคอลที่ยังไม่ได้ปล่อย ไม่ force push และไม่ใช้โฟลเดอร์เก่าทับ master

## แผนฐานข้อมูลที่ตรวจแล้ว

ลำดับเฉพาะงานนี้: `20261018005611` → `20261018040444` → `20261018133739` ทั้งสามยังไม่ apply ขณะตรวจ ใช้ transaction เดียว กำหนด lock/statement timeout และล็อก submissions ก่อน submission_answers ให้ตรงกับ finalizer เดิม ไม่รัน db push/repair ย้อน migration เก่าที่ค้าง

ปรับเฉพาะ migration `040444` ที่ยังไม่ apply เพิ่ม private `grading_rollout_backups` ก่อน backfill เก็บเฉพาะคะแนน/สถานะ/รุ่น ไม่เก็บคำตอบ เฉลย รูป หรือข้อมูลชื่อผู้เรียน เปิด RLS ถอนสิทธิ์ browser และให้ service role อ่านได้เท่านั้น ปฏิเสธข้อมูลคะแนนผิดช่วง/ข้อส่งไฟล์ใน streak/คะแนนที่ผูกงานวิจัยซึ่งต้องแยกแผน และ UPDATE header เฉพาะค่าที่เปลี่ยน

ตรวจ Production แบบ aggregate: คำตอบ 5,161 แถว, คำตอบในรอบกำลังทำ 3,916 แถว, finished headers 115, เครดิตไฟล์อัตโนมัติที่จะกลับไปรอครูตรวจ 3 แถวใน 3 รอบ, affected streak 0, mapped research finished headers 0 ไม่ปิดหรือลบ active attempts และไม่สร้างข้อมูลทดสอบใน Production

SQL tests ใช้ guard/finalizer/trigger จาก baseline จริงติดตั้งก่อน migration ผ่าน 57 เคส และ release ที่รวม master ผ่าน 309 ไฟล์/4,099 tests แล้ว ต้องผ่าน Staging และตรวจ deployment ก่อนบันทึกว่าเผยแพร่สำเร็จ

## สถานะการดำเนินการ

ยังไม่ apply หรือ deploy ณ คอมมิตเตรียมนี้ ขั้นถัดไปคือใช้ Staging เดิมและ environment เดิมโดยไม่คัดลอกคีย์ไปไฟล์ใหม่ ทดสอบด้วยบัญชีสังเคราะห์ของ run นี้และล้างเฉพาะของตน จากนั้น apply Production เฉพาะสามไฟล์ที่ commit แล้ว บันทึก ledger เฉพาะ SQL ที่สำเร็จ ตรวจ catalog แบบอ่านอย่างเดียว และเผยแพร่ผ่าน master/Vercel
