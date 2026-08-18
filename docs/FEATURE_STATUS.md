# Feature status

ตรวจจาก repository: 18 สิงหาคม 2026

## วิธีอ่านสถานะ

- **มีโค้ดรองรับ** — พบ route, UI, action และ/หรือ migration สำหรับเส้นทางจริง แต่ยังไม่เท่ากับ production-ready
- **บางส่วน** — มีการทำงานจริง แต่ยังมีช่องว่างหรือส่วนจำลองที่กระทบการใช้งานครบเส้นทาง
- **ต้นแบบ/ข้อมูลจำลอง** — UI มีไว้สาธิตหรือใช้ค่าคงที่ ไม่ใช่ข้อมูลธุรกิจจริง
- **วางแผน** — อยู่ในทิศทางผลิตภัณฑ์แต่ยังไม่ใช่งานระยะปัจจุบัน

ยังไม่มี automated test suite และการตรวจครั้งนี้ไม่ได้ยืนยันฐานข้อมูลที่ deploy จริง ทุกสถานะต้องผ่าน end-to-end และ authorization testing ก่อนเปลี่ยนเป็น “พร้อมใช้จริง”

## MVP core

### Authentication — บางส่วน

- มี email/password signup/login, Google OAuth, magic link และ forgot-password action
- มี session refresh และ protected layouts
- ยังไม่พบหน้า `/reset-password` แม้ action จะ redirect ไปเส้นทางนั้น
- authority ระหว่าง system admin, organization admin และ super admin ยังต้องสรุป

### คลังโจทย์ — มีโค้ดรองรับ

- มี create/edit/list/preview/delete, tags, categories, visibility และ sharing
- Application types รองรับ written/random numeric, MCQ, true/false, fill blank, ordering, matching, essay, file upload และ composite
- มี question sets, team sharing และ duplicate/remix-related UI
- สถิติการใช้งานโจทย์และประวัติเวอร์ชันบางส่วนยังเป็น mock data

### โจทย์สุ่มตัวเลข — มีโค้ดรองรับ

- มี variable ranges, step, constants, logic rules, Pythagorean groups, formulas และ answer parts
- สุ่มค่าตอนเริ่ม submission และเก็บ `random_values` ต่อ answer
- ต้องเพิ่ม automated tests สำหรับ evaluator, tolerance, chained references และ edge cases ก่อน production

### MCQ และตัวเลือกหลอก — มีโค้ดรองรับ

- มีโหมดตัวเลือกธรรมดาและโหมดคำนวณพร้อม distractor formulas
- มีตัวช่วยสร้างตัวลวงจากการสลับ operator/ปรับสูตร
- analytics คำอธิบายตัวลวงบางส่วนยังสร้างจากข้อความคงที่และ distribution สังเคราะห์

### ห้องเรียนรายวิชา — มีโค้ดรองรับ

- มี teacher/student views, class code join, roster, archive, trash, restore และ pin
- มีโพสต์ ความคิดเห็น และการแจ้งเตือน
- มี assignment tab และคะแนนระดับห้อง
- ต้องทดสอบการแยกข้อมูลข้าม organization และ lifecycle ลบถาวร

### ครูผู้สอนร่วม — มีโค้ดรองรับ

- มี invitation และ permission `admin/manage/view`
- Server actions และ migrations มีเส้นทางจัดการสิทธิ์
- ต้องทำ authority matrix และทดสอบทุก mutation ของ classroom/assignment

### งานและข้อสอบ — มีโค้ดรองรับ

- มี draft/published/closed, online/print และ exercise/exam
- เชื่อมหลายห้องผ่าน `assignment_classrooms`
- มีเวลาเปิดปิด จำกัดเวลา access code attempts score strategy passing threshold และ score overrides
- ครูเลือกการแสดงผลลัพธ์ได้ทั้งทันที หลังพ้นกำหนด หรือไม่แสดงแก่นักเรียน และแก้ไขนโยบายนี้ภายหลังได้
- มีหน้า create/edit/detail/take/results/analytics/print/export
- ต้องทดสอบ flow ครูและนักเรียนแบบครบเส้นทาง รวม expiry/retry/concurrent save

### การส่งคำตอบและตรวจคะแนน — มีโค้ดรองรับ

- สร้าง attempt, ตรึง random/answer/order, autosave และบังคับเวลาฝั่ง server
- Attempt และ answer snapshot รับ `org_id` จาก assignment โดยตรง จึงรองรับนักเรียนที่เข้าห้องแต่ไม่ได้เป็น `organization_members`
- มี auto-grading หลาย question types, manual score edit, feedback และ work images/files
- หลังส่งคำตอบจะโหลดหน้าสรุปจากสถานะล่าสุดของ server และอยู่ที่หน้าสรุปจนกว่านักเรียนจะเลือกกลับหรือเริ่มทำใหม่เอง
- ต้องเพิ่ม regression tests สำหรับทุก question type และการ rescale/attempt strategy
- ต้องยืนยันคำจำกัดความของ `submitted` เทียบกับ `graded` สำหรับคำตอบ manual

### โฮมรูม — มีโค้ดรองรับ แต่ข้อมูลอ่อนไหวต้องตรวจเพิ่ม

- มี classroom type `homeroom`
- รวม assignment/submission จาก subject classrooms ของนักเรียนใน roster
- มี calendar, compliance, student view, weekly digest, student notes และ student profile fields
- ต้องทดสอบว่า health/family/guardian/address/notes ไม่รั่วถึงครูหรือสมาชิกที่ไม่เกี่ยวข้อง

## Supporting features

### Organization/team management — บางส่วน

- มี organizations, members, invites, team code, roles และ subscription tier field
- helper บางส่วนยังตั้งสมมติฐานเรื่อง organization หลัก/แรกของผู้ใช้
- ต้องสรุปโมเดล personal workspace, team และ school ให้เป็นหนึ่งเดียว

### Admin และ super admin — บางส่วน

- มีหน้า admin สำหรับ users, questions, categories และ formula presets
- มีหน้า super-admin หลายส่วน
- หน้า super-admin ปัจจุบันตรวจ `users.role === admin` ขณะที่ migration มี `super_admins` แยกต่างหาก ต้องแก้แบบจำลองสิทธิ์ก่อน production

### Notifications และ classroom stream — มีโค้ดรองรับ

- มี notifications, posts, comments, pin และ weekly homeroom digest
- ต้องตรวจ delivery/cron จริงและ privacy ของข้อความ notification

### Export, PDF และ OMR — บางส่วน/ต้นแบบ

- มี routes และ UI สำหรับ print/export/PDF/OMR
- PDF preview มี fallback เป็น `MOCK_QUESTIONS`
- ต้องยืนยันการสร้างไฟล์จริง การสุ่มชุดต่อคน ความถูกต้องของ answer key และ browser/print compatibility

### Analytics — บางส่วน/ต้นแบบ

- มีหน้าและ components สำหรับ score, item analysis และ charts
- distractor chart บางส่วนสร้าง realistic distribution และคำอธิบายจากค่าคงที่
- ห้ามใช้ตัวเลขเหล่านี้ประกอบการตัดสินใจจริงจนเปลี่ยนเป็นข้อมูล submission จริงทั้งหมด

### Billing และ pricing — ต้นแบบ/ข้อมูลจำลอง

- Billing settings ใช้ mock plan, invoices, usage และ cancellation toast
- Pricing page มีราคา โควตา trial, Enterprise, SLA, SSO และ compliance claims ที่ยังไม่ใช่ข้อสรุปผลิตภัณฑ์
- มีเพียง `subscription_tier` ใน organization; ยังไม่พบ payment provider หรือ entitlement enforcement กลาง

### Profile history — ต้นแบบ

- UI ประวัติการใช้งานใช้ `MOCK_HISTORY`

### Question stats/version history — ต้นแบบ

- การใช้งาน สถิติ และ version history ใน card/preview ใช้ mock-generated values

### Classroom audit log — ต้นแบบ

- ใช้ `MOCK_EVENTS`

### Parent portal — ต้นแบบ

- observer codes เป็น mock data

### Learning paths — ต้นแบบ

- assignments และเงื่อนไขตัวอย่างเป็น mock data

### Landing page — Demo

- metadata และ badge ระบุ Demo
- hero ปัจจุบันล็อกคำว่า “ก่อการเรียนรู้ โดยครู” และยังไม่ใช้แนวคิดคำกลางแบบสลับ
- `InteractiveDemo` มีอยู่ใน components แต่หน้าแรกปัจจุบัน render เฉพาะ navbar และ hero

## Future

- แบบสำรวจนักเรียน — วางแผน; `survey_role` ตอนสมัครไม่ใช่ระบบแบบสำรวจนักเรียนตามวิสัยทัศน์
- งานวิจัยการศึกษา — วางแผน
- ระบบสมาชิก/ชำระเงินจริง — วางแผนหลัง MVP core

## งานคุณภาพที่ขาดอยู่

- Automated unit/integration/end-to-end tests
- `lint` script
- Generated database types หรือขั้นตอนตรวจ schema drift ที่ชัดเจน
- Production-ready feature flags สำหรับซ่อน prototype UI
- การตรวจ claims ด้าน PDPA, encryption, ISO, SLA และ pricing โดยเจ้าของธุรกิจ/กฎหมาย
