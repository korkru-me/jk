# ดรอปดาวน์ประเภทงานและชื่อ “งานอัปโหลดไฟล์” — 23 พฤศจิกายน 2026

เจ้าของอนุมัติให้นำสองส่วนที่ตรวจ local แล้วขึ้นเว็บจริง: ดรอปดาวน์ในหน้า “งานที่มอบหมาย” และการเปลี่ยนชื่อที่แสดงทั่วเว็บเป็น “งานอัปโหลดไฟล์”

## ขอบเขต

- ใช้ shared Select ในหน้า “งานที่มอบหมาย” แทนแถบปุ่ม 5 ประเภท คงค่าการกรอง ไอคอน และการเลือกเดิม Trigger/รายการมีพื้นที่กดอย่างน้อย 44px รองรับคีย์บอร์ด Escape และคลิกนอกเพื่อปิด
- ตัวกรองในหน้าคะแนนคงรูปแบบเดิม เปลี่ยนเฉพาะชื่อประเภทที่แสดง
- เปลี่ยนชื่อในเมนู ตัวกรอง ป้ายประเภท หน้าสร้าง/แก้ไข รายละเอียดงาน หน้านักเรียน ชื่อหน้า และข้อความข้อผิดพลาด ไม่เปลี่ยน identifiers, URLs, schema, ข้อมูลที่บันทึก หรือกติกาการส่ง/ให้คะแนน
- ไม่เปลี่ยน auth/RLS/Storage และไม่มี migration

## Candidate และ primary

- Release branch `codex/assignment-filter-upload-label-release-20261123` ตั้งจาก Production `343a5a5a9349b4a117ffed7d10628577462b8a57` ซึ่งรวมงานกลุ่ม/Admin ล่าสุดแล้ว
- Primary `/Users/korkusonmasaen/Korkru/korkru` branch `codex/student-classroom-cards` เป็น shared dirty checkout จึงไม่ pull/reset/stash/stage งานค้าง ใช้เฉพาะ hunks ของงานนี้และเก็บ digest ของ modified tracked files ไว้เทียบหลังปล่อย
- Local ก่อนปล่อยผ่าน TypeScript, token lint, production build และ 4,947 tests ตรวจครบ 5 ตัวเลือก คีย์บอร์ด/Escape/focus และสลับเมนูที่ไม่ถูก popup บังในคลิกเดียว
- บนจอ 390px แถบตัวกรองลดจาก 81.6px เป็น 44px, toolbar จาก 168px เป็น 130.4px และไม่มี horizontal overflow ตรวจชื่อใหม่ในหน้าสร้างและมุมนักเรียนด้วย fixture
- Candidate ใช้ public environment จำลองในการ build ไม่คัดลอก Production credentials หรือข้อมูลจริง

## สถานะ

Candidate ผ่าน TypeScript, token lint, production build และ 354 suites / 4,948 tests แล้ว

- Staging PR [#156](https://github.com/korkru-me/jk/pull/156) merge `5d6302f3563693ec7eae515c99eb4b20f83bdcf3`; Vercel `dpl_2hGdt96rMwA1REuNALeVWinh5ymf` READY และ canonical `staging.korkru.com` ใช้งานได้ผ่าน Vercel SSO ปกติใน Chrome เดิม ไม่เปลี่ยน protection หรือใช้ bypass token
- ยืนยันป้าย STAGING ตรวจ fixture ครบทั้ง 5 ค่า exercise/exam/practice/file/all ได้ 3/1/2/0/6 งาน Trigger สูง 44px ตรวจชื่อใหม่ในตัวเลือก เมนู ชื่อหน้า หน้าสร้างครู และมุมนักเรียนแล้ว ไม่มี Auth/Storage/database writes
- Production PR [#157](https://github.com/korkru-me/jk/pull/157) merge `83a358b00357e8215ca8a9f123fbfb759e611b15` หลัง Staging ผ่าน Vercel `dpl_9H17zVaLC9rzJqcHn91nFrQUNC1W` READY แล้ว
- Primary ใช้ source dropdown/consumer ตรงกับ release ทั้งไฟล์ และมีชื่อใหม่ครบทุก application path ของ scope รักษาความสามารถข้อความ/ลิงก์ของงานไฟล์ซึ่งเป็นงาน local อื่นไว้ ทำให้ `lib/file-assignment.ts` และ helper text ของ form ต่างจาก release โดยเจตนา ไม่ blanket-copy ทับทั้งไฟล์
- ก่อน release ตรวจ digest ของ modified tracked files 211 ไฟล์ใน primary แล้วไม่มีไฟล์เปลี่ยนจากการเตรียมชุดปล่อย ไม่มี migration และไม่มีการสร้าง/แก้/ลบข้อมูล Production เพื่อทดสอบ

## ผลหลัง Production READY

- เปิดห้องเรียนจริงที่ `www.korkru.com` ใน Chrome เดิมแบบอ่านอย่างเดียว พบดรอปดาวน์ครบ 5 ค่า มี “งานอัปโหลดไฟล์” และ trigger สูงประมาณ 44px เปิดหน้าสร้างงานจริงใหม่ยืนยันทั้ง document title และ h1 เป็น “มอบหมายงานอัปโหลดไฟล์” ไม่แตะร่างเดิม ไม่บันทึกหรืออัปโหลดข้อมูลใด
- Primary process PID 33781 ให้บริการ `/Users/korkusonmasaen/Korkru/korkru` ที่ `127.0.0.1:3000` ตรวจ rendered fixture หลัง deploy แล้ว: desktop 1200px มีครบ 5 ค่า, mobile 390px scrollWidth 390px, trigger 44px และ Space/End/Enter เลือก “งานอัปโหลดไฟล์” แล้วปิดเมนูได้
- Primary ผ่าน TypeScript, token lint และ targeted file-assignment tests 38 tests; Next.js MCP compilation issues, config errors และ session errors เป็นว่าง รูปหลักฐาน local อยู่ `/private/tmp/korkru-work-filter-released-primary-desktop.png` และ `/private/tmp/korkru-work-filter-released-primary-mobile.png`
- เก็บงานอื่นใน primary และ environment เดิมทั้งหมด ไม่มี migration หรือ blocker ค้าง การทดสอบนี้ไม่ใช่การทดสอบ Auth/Storage/upload จริง เพราะชุดนี้เปลี่ยนเฉพาะตัวกรองกับถ้อยคำ
- ผลหลังปล่อย push เป็น docs-only handoff บน release branch ไม่เปลี่ยน application source ของ Production commit `83a358b00357e8215ca8a9f123fbfb759e611b15`
