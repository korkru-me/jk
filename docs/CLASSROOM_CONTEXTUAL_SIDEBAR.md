# Contextual sidebar ของหน้าห้องเรียน

อัปเดตล่าสุด: 28 กันยายน 2026

## เป้าหมาย

เปลี่ยนแถบซ้ายหลักให้สลับตามบริบทของพื้นที่ห้องเรียน โดยยังมีทางออกไปส่วนหลักของ KorKru ชัดเจน ลดความแน่นของแถบแท็บแนวนอน และรักษาพฤติกรรม สิทธิ์ และข้อมูลจริงของหน้าห้องเรียนเดิม

ภาพ mockup ที่อนุมัติเป็นทิศทางด้าน layout ไม่ใช่ข้อกำหนดให้เพิ่ม analytics ใหม่ การ์ดสถิติตัวอย่างในภาพจะไม่ถูกนำกลับมา เพราะหน้าภาพรวมปัจจุบันตั้งใจใช้ข้อมูลจริงและเคยตัดการ์ดตัวเลขที่ซ้ำกับรายการงานออกแล้ว

## ขอบเขตระยะแรก

- ใช้ทุก route ใต้ `/classrooms` เป็นพื้นที่ทดลองก่อน
- `/classrooms`, `/classrooms/new`, `/classrooms/archived` และ `/classrooms/trash` แทนเมนูหลักด้วยเมนูจัดการห้องเรียน
- `/classrooms/[id]` แทนเมนูจัดการห้องเรียนด้วยชื่อและฟังก์ชันของห้องนั้นในแถบซ้ายหลักอันเดิม ไม่สร้าง sidebar ชั้นที่สองในเนื้อหา
- ไม่เปลี่ยน schema, RLS, server action, scoring หรือข้อมูลห้องเรียน
- ไม่ขยาย contextual sidebar ไปหน้าจัดการโจทย์หรือวิจัยการศึกษาจนกว่าหน้าห้องเรียนจะผ่าน QA
- รักษาเมนูที่มองเห็นตาม `classroom_type` และ `canManage` เหมือนเดิม
- รักษาหน้านักเรียนเดิมไว้จนกว่าจะออกแบบ contextual navigation ของนักเรียนโดยเฉพาะ

## สถานะเฟส

- [x] เฟส 0 — อัปเดตฐานและตรวจ baseline
- [x] เฟส 1 — แยก navigation contract โดยไม่เปลี่ยนหน้าตา
- [x] เฟส 2 — ตรวจ route และพื้นที่ของแถบซ้ายหลัก
- [x] เฟส 3 — Contextual sidebar แทนที่เมนูเดิมและย้ายเมนูออกจากแถบแนวนอน
- [x] เฟส 4 — Responsive สำหรับ mobile/tablet/desktop
- [x] เฟส 5 — URL state, browser back/forward และ deep link
- [x] เฟส 6 — polish, accessibility และ destructive-action placement
- [x] เฟส 7 — regression QA ฝั่ง local และเตรียมรายการตัดสินใจก่อนขยายไปส่วนอื่น

## ผลตรวจอัตโนมัติหลังเฟส 7

- `npx tsc --noEmit` ผ่าน
- `npm run lint:tokens` ผ่าน โดยไม่มีไฟล์ที่มี token debt เพิ่ม
- `npm test` ผ่าน 186 test files รวม 2,569 tests
- `npm run build` ผ่าน และสร้าง route `/classrooms/[id]` สำเร็จ
- Next.js dev runtime `compile_route` และ `get_compilation_issues` ไม่พบปัญหา
- ไม่มี migration หรือการเปลี่ยน schema/RLS/server action

## Browser QA หลัง merge

ทดสอบด้วยข้อมูลสังเคราะห์บน renderer จริงโดยไม่แตะฐานข้อมูล ที่ 320×568, 390×844, 768×1024, 1024×768 และ 1280×800 ครบ subject/homeroom, owner/manage/view, light/dark, drawer, keyboard focus, deep link และ Back/Forward

พบบักและแก้แล้ว 5 รายการ:

- สิทธิ์ `view` เปิดภาพรวมแล้วว่าง และยังเห็นลิงก์สร้างชุดข้อสอบ
- แบนเนอร์บีบชื่อ/รายละเอียดเป็นคอลัมน์แคบมากบนมือถือ
- grid ภายใน drawer ล้นความกว้าง ทำให้ badge และปุ่มอยู่ใต้ overlay
- trigger ของ drawer ไม่ประกาศ `aria-expanded`
- deep link ที่ไม่รู้จักหรือไม่มีสิทธิ์ fallback เป็นภาพรวม แต่ URL ยังอ้าง panel เดิม

หลังแก้ไม่พบ horizontal overflow, console/runtime error หรือ axe WCAG A/AA violation; รายการ `incomplete` ของ axe เหลือเฉพาะสีบนพื้น gradient ที่เครื่องมือคำนวณเองไม่ได้

## การแก้ความคลาดเคลื่อนหลังตรวจบนหน้าจริง

รอบแรกตีความ “เปลี่ยนแถบซ้าย” เป็นการย่อเมนูหลักเหลือ global rail แล้วเพิ่ม contextual sidebar อีกชั้นในเนื้อหา และจำกัดการเปลี่ยนไว้เฉพาะ `/classrooms/[id]` ทำให้หน้ารวม `/classrooms` ยังเหมือนเดิม ซึ่งไม่ตรงกับเจตนาของเจ้าของผลิตภัณฑ์

รอบแก้ไขจึงใช้ contextual slot ใน app shell เพื่อให้หน้าในพื้นที่ห้องเรียนแทนเนื้อหาของแถบซ้ายหลักโดยตรง เมนู hamburger บนมือถือใช้ slot เดียวกัน ไม่มี drawer หรือ sidebar ซ้ำในเนื้อหา และมี “เมนูหลัก” กับ “ห้องเรียนทั้งหมด” เป็นทางออกชัดเจน ส่วนมุมมองนักเรียนยังคง navigation เดิมตามขอบเขตระยะแรก

ผลตรวจรอบแก้ไข: `npx tsc --noEmit`, design-token lint, 186 test files / 2,578 tests, production build และ Next.js runtime compilation ผ่านทั้งหมด ส่วน authenticated browser click-through ยังรอผู้ใช้เข้าสู่ระบบใน browser session ทดสอบ

## งานที่ต้องให้เจ้าของผลิตภัณฑ์ตรวจภายหลัง

- ยืนยันความรู้สึกของความกว้าง contextual sidebar ที่แทนแถบหลักบนจอจริง
- ทดสอบซ้ำด้วยบัญชีเจ้าของห้อง ผู้ช่วยสอน `admin`/`manage`/`view` และนักเรียนจริง (รอบ local ใช้ข้อมูลสังเคราะห์แล้ว)
- ทดสอบ touch และเมนู hamburger บน iPad/iPhone จริง
- ยืนยันว่าการเน้น “เชิญเข้าร่วม” แบบ action แต่ยังเปิดเป็นหน้าภายในห้องเรียนตรงกับความคาดหวัง
- ยืนยันตำแหน่ง “ย้ายไปถังขยะ” ในพื้นที่อันตรายของหน้าตั้งค่า (ระบบปัจจุบันยังกู้คืนได้ จึงไม่ใช้คำว่า “ลบถาวร”)

รายการเหล่านี้ไม่ขวางการสร้างและ QA อัตโนมัติใน local แต่ต้องผ่านก่อนปล่อยใช้งานจริง
