# งานกลุ่มและปุ่มส่งงาน — โลคอล 23 พฤศจิกายน 2026

## ขอบเขต

เจ้าของขอแก้เฉพาะโลคอล: เอาทางลัดงานกลุ่ม/เดี่ยวออก ลดขนาดปุ่มเลือกชนิดงาน เอาเครื่องหมายถูกออก ใช้ม่วงอ่อนเมื่อเลือก รวมปุ่มคะแนน เพิ่มงานกลุ่มกับจำนวนสมาชิกในงานอัปโหลดไฟล์ ค่าเริ่มต้นงานเดี่ยว ไม่ merge/deploy ไม่แตะ migration SEB 12 รายการ

## การทำงาน

- แบบฝึกหัดและงานไฟล์ใช้ SubmissionModeFields ร่วมกัน แสดงขั้นต่ำ–สูงสุดเฉพาะ group นับรวมผู้ส่ง ปุ่ม compact มีพื้นที่กดขยายโดยไม่เพิ่มความสูงแถว
- Server ตรวจ mode/range ก่อนสร้าง private prompt แล้วส่ง group fields ผ่าน exercise เดิม หลังเผยแพร่ล็อกรูปแบบ/จำนวนคนทั้ง UI และ server
- ตัวแทนเลือกเพื่อนตอนส่งผ่าน group finalizer เดิม ซึ่งตรวจสมาชิก ห้องเรียน ขอบเขตจำนวนและกลุ่มซ้ำ แล้วสร้าง receipts คะแนนร่วมกัน สมาชิกอ่าน canonical answer ที่ตรวจสิทธิ์แล้วและคะแนนจาก receipt ตนเอง ครูใช้ระบบ grading เดิม
- งานกลุ่มยังถอนส่งไม่ได้ ป้องกันการเปิด receipt คนเดียวจนสถานะทั้งกลุ่มแยกกัน หน้าเว็บแจ้งให้ติดต่อครู งานเดี่ยวคงเงื่อนไขถอนส่งเดิม
- รวม prerequisite ของงานไฟล์จาก local ก่อนหน้า: text/link/files parser ที่อ่าน array เดิมได้, ตัวเลือก PDF/รูปแยกกัน, save/finalize validation, review rendering และตรวจสิทธิ์ลบไฟล์เดิม ไม่รวม waiting-page, Auth, SEB หรืองานอื่นที่ค้างใน primary

## ผลตรวจในเครื่อง

- Chrome บน localhost:3000: เริ่ม solo, เลือก group แสดง 3–5, ไม่มี SVG check, สีปุ่ม group/คะแนนที่เลือกนิ่งแล้วเป็น primary/10 เท่ากัน ความสูง 33.6px ที่ root font ของแอปตามสเกล sm
- หน้ารวมงานจำลองไม่มีทางลัดเก่า แต่จัดการกลุ่มงานและมอบหมายงานใหม่ยังอยู่
- งานไฟล์จำลอง: สร้าง group 3–5 ส่งข้อความ+ลิงก์+PDF; คนไม่ครบส่งไม่ได้ เลือกครบ 5 รวมผู้ส่งแล้วเพื่อนที่เหลือ disabled ส่งกลุ่ม 3 คน แล้วครูจำลองให้ 8/10 สมาชิกจำลองที่เปิดดูผลเห็นคำตอบและคะแนนเดียวกัน ไม่มีปุ่มถอนส่ง
- จอ 390px ทั้งสองหน้าสร้างไม่ล้นแนวนอน; งานเผยแพร่แล้วจำลองล็อกตัวเลือกชนิดงาน
- React inspection ยืนยัน groupWork, groupMembers 3 คน, shared response และสถานะ graded ใน FileAssignmentStudent
- Next Turbopack compilation issues=[], runtime configErrors=[]/sessionErrors=[]
- TypeScript, token lint และ production build แยก .next-group-file-ui-build ผ่าน ใช้ค่าทดสอบสำหรับ build ไม่อ่าน hosted keys และไม่รบกวน dev cache ชุดเต็มผ่าน 354 suites / 4,981 tests ชุดเจาะจงก่อนเพิ่ม boundary cases ผ่าน 8 suites / 76 tests

Browser ใช้ข้อมูลจำลองและ callbacks ในหน่วยความจำ ไม่ใช่การทดสอบบัญชีจริง Auth, Supabase Storage หรือ trigger คะแนนบน Staging/Production รอบใหม่ SQL contract tests รันฐานข้อมูลในเครื่อง ต้องทดสอบ hosted แยกก่อนปล่อยจริง ไม่มี migration ใหม่ เปลี่ยน หรือรันในรอบนี้

## ส่งต่อ

Branch codex/group-file-ui-local-20261123 แยกจาก origin/master 83a358b เพื่อเก็บเฉพาะงานนี้กับ dependencies ที่ต้องใช้ Push branch เพื่อส่งต่อข้ามเครื่อง โดยปิด Vercel Git deployment เฉพาะชื่อ branch นี้ใน vercel.json เพื่อไม่สร้าง Preview ไม่ merge เข้า master/staging หรือ deploy ตามคำสั่ง local-only Primary localhost:3000 ยังมีงานอื่นค้างอยู่ ห้าม stage ทั้งโฟลเดอร์

หน้าดูตัวอย่าง: /exam-screen-lab/assignment-creation?type=exercise และ /exam-screen-lab/file-assignments หน้าใช้งาน local จริง: /assignments/new?type=exercise และ /assignments/files/new ตามสิทธิ์บัญชีเดิม
