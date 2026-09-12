# แผนตรวจหน้าข้อสอบจริงตามขนาดจอ

อัปเดต: 12 กันยายน 2026 · **เฟส 1 ผ่านและพร้อม commit**

เอกสารนี้เป็นแผนตรวจหน้าข้อสอบ KorKru บน iPhone, iPad และ Mac ก่อนกลับไปทดสอบ SEB บน Windows ตามลำดับที่ผู้ใช้เลือก ไม่ได้เปลี่ยน Windows ให้เป็น “ผ่าน” และไม่ได้ใช้ผลจาก Apple อนุมานแทน Windows

## กติกาความปลอดภัย

เครื่องพัฒนาปัจจุบันเชื่อมกับ Supabase project ที่เอกสารโครงการระบุว่าเป็น production และยังไม่มี staging แยก จึงห้ามสร้างบัญชี ห้องเรียน ข้อสอบ คำตอบ การส่งงาน หรือไฟล์ QA ในฐานนี้

เฟส 1 ใช้ `/exam-screen-lab` ซึ่งมีคุณสมบัติดังนี้:

- เปิดได้เฉพาะ development; production ตอบ 404
- ใช้ `ExamClient` ตัวเดียวกับหน้าทำข้อสอบจริง แต่เปิด `previewMode`
- ข้อมูลทุกชิ้นเป็นข้อมูลสมมติในหน่วยความจำ; proxy ข้าม Supabase session refresh สำหรับ route นี้ใน development
- คำตอบ รูปวิธีทำ กระดาษทด และไฟล์แนบไม่ถูกส่งขึ้น server; preview ไม่เขียน answer backup ลง localStorage
- สร้าง submission id ใหม่ทุกครั้งที่เปิดหน้า เพื่อลดการปะปนกับ local backup จากรอบก่อน
- ไม่เปิด proctor, fullscreen, clipboard blocking, timer หรือ SEB gate เพราะเฟสนี้ตรวจเฉพาะหน้าจอและการแตะ/พิมพ์

เมื่อมี Supabase และ Vercel staging แยกแล้ว จึงค่อยสร้างบัญชี QA และทำเฟสที่ต้องพิสูจน์ autosave/upload/submit จริง ห้ามนำข้อมูลนักเรียนจริงมาเป็น fixture

## วิธีเปิดห้องทดลอง

- หนึ่งข้อต่อหน้า: `http://<ที่อยู่เครื่องพัฒนา>:<port>/exam-screen-lab`
- สามข้อต่อหน้า: `http://<ที่อยู่เครื่องพัฒนา>:<port>/exam-screen-lab?perPage=3`

ชุดจำลองมี 11 กรณี ครบ question type ที่บันทึกได้ทั้ง 9 ชนิด และเพิ่มกรณีสัมผัสที่ต่างกันอีก 2 กรณี:

- ตัวเลขหลายข้อย่อยและรูปวิธีทำบังคับ
- ปรนัยพร้อมรูปประกอบ
- ถูก–ผิดแบบตัดสินทีละข้อความ และแบบเลือกข้อความที่ไม่ถูกต้อง
- เติมคำแบบพิมพ์และรายการเลือก
- จับคู่แบบวางลงช่อง และแบบลากเส้น
- เรียงลำดับ
- โจทย์ผสม
- เรียงความยาวภาษาไทย
- แนบรูปหรือ PDF
- เครื่องคิดเลข กระดาษทด แฟ้มย่อย หนึ่งข้อ/หน้า และสามข้อ/หน้า

## แผน 8 เฟส

ทุกเฟสต้องจบด้วยผลตรวจตามขอบเขต, อัปเดตเอกสาร และ commit แยกก่อนเริ่มเฟสถัดไป

### เฟส 1 — ฐานทดสอบปลอดภัย

สถานะ: **ผ่าน**

Agent ทำทั้งหมด: เพิ่มหน้าทดลอง development-only, ข้อมูลจำลอง, invariant tests, production 404 guard และบันทึก baseline ผู้ใช้ไม่ต้องกรอกข้อมูลหรือรหัสใด ๆ

ผ่านเมื่อ build/type/test/token lint ผ่าน, หน้า development เปิดได้, production เปิดไม่ได้ และไม่มี env/migration/ข้อมูลจริงเปลี่ยน

ผลตรวจรอบปิดเฟส:

- `npm test`: 85 files / 1,071 tests ผ่าน รวม fixture/access/persistence tests ใหม่ 8 ข้อ
- `npx tsc --noEmit`: ผ่าน
- `npm run lint:tokens`: ผ่าน ไม่มี design-token debt เพิ่ม
- `npm run build`: ผ่าน สร้าง static pages 61 หน้า
- development smoke: `/exam-screen-lab` และ `?perPage=3` ตอบ 200 และแสดง `ExamClient` จริง
- production smoke: `/exam-screen-lab` ตอบ 404
- `/assignments/[id]/take` client bundle ยังคงประมาณ 0.235 MiB gzip (803,752 bytes raw / 245,981 bytes gzip)
- ไม่มี migration, env, Supabase row, Storage object หรือ deployment เปลี่ยน

### เฟส 2 — iPhone

สถานะ: รอ

Agent เปิด local URL และบอกทีละขั้น ผู้ใช้ช่วยถือ iPhone ทดสอบแนวตั้ง/แนวนอน คีย์บอร์ดภาษาไทย ช่องคณิตศาสตร์ แตะจับคู่ เรียงลำดับ เครื่องคิดเลข กระดาษทด รูป และไฟล์ โดยใช้ข้อมูลสมมติเท่านั้น

### เฟส 3 — iPad

สถานะ: รอ

ผู้ใช้ช่วยทดสอบแนวตั้ง/แนวนอน split keyboard หรือคีย์บอร์ดปกติ Apple Pencil/touch และการเปลี่ยนหนึ่งข้อเป็นสามข้อต่อหน้า Agent บันทึกเฉพาะอาการและผล ไม่เก็บภาพที่มีข้อมูลจริง

### เฟส 4 — Mac

สถานะ: รอ

ผู้ใช้ช่วยตรวจหน้าต่างเล็ก/ใหญ่ keyboard navigation, scroll, drag, file picker, focus mode และ modal Agent แก้เฉพาะปัญหาที่ทำซ้ำได้แล้ว rerun regression

### เฟส 5 — เส้นทางนักเรียนจริงใน browser ปกติ

สถานะ: ถูกกั้นจนมี staging แยก

ใช้บัญชีและข้อมูล QA ใน staging เท่านั้น ตรวจ login, start, autosave, reload/resume, upload, submit, result และผลที่ครูเห็น การทำ browser ก่อนช่วยแยกปัญหา KorKru ออกจากปัญหา native SEB

### เฟส 6 — เส้นทางเดิมใน SEB

สถานะ: รอเฟส 5 และ staging

ผู้ใช้ช่วยเปิดไฟล์ staging `.seb` ที่ตรงกับ build ของ Mac/iPad/iPhone แล้วทำ happy path เดิม ตรวจ CK+BEK, submit commit และ quit link โดยไม่ส่ง Key หรือรหัสในแชต/เอกสาร

### เฟส 7 — การกู้คืนและห้องคุมสอบ

สถานะ: รอ

ใช้ attempt จำลองแยกกันทดสอบ Wi‑Fi หลุด/กลับมา, pending sync, reload/resume, ไฟล์ล้มเหลว, งานบังคับรูป, timer clone, teacher presence และข้อความเตือน ครูตรวจเครื่องจริงได้ตามบริบทสอบในห้อง ห้ามจงใจทำให้เครื่องค้างหรือบังคับปิด

### เฟส 8 — regression และปิดหลักฐาน

สถานะ: รอ

Agent รันชุดตรวจทั้งหมด, ตรวจสิทธิ์/ข้อมูลค้าง, สรุปผลแยกอุปกรณ์และ build, ระบุสิ่งที่ยังไม่ผ่าน และอัปเดตเอกสาร release ผู้ใช้ช่วยยืนยันเฉพาะผลบนอุปกรณ์จริง

หลังเฟส 8 ให้กลับไป **ทดสอบ Windows N2.1** เมื่อมีเครื่องจริง Windows ยังเป็น pending release gate จนกว่าจะเก็บผล native ของรุ่นที่จะประกาศรองรับ

## หลักฐานที่เก็บได้

เก็บเฉพาะวันที่, รุ่นอุปกรณ์/OS/SEB/browser, ขนาดหรือแนวจอ, กรณีที่ทดสอบ, ผ่าน/ไม่ผ่าน และอาการที่ไม่มีข้อมูลส่วนบุคคล ห้าม commit credential, password, CK/BEK, token, request hash, ข้อมูลนักเรียน คำตอบจริง รูปลายมือจริง หรือไฟล์ข้อสอบจริง

## ความเสี่ยงที่แยกจากเฟสหน้าจอ

- ยังไม่มี staging จึงยังพิสูจน์ autosave/upload/submit/RLS จริงไม่ได้
- ยังไม่มี browser E2E framework; physical-device UAT ยังจำเป็น
- dependency audit วันที่ 12 กันยายน 2026 รายงานช่องโหว่ 57 รายการ รวม Next.js ระดับ critical และ TipTap ระดับ high ต้องแก้เป็นงาน dependency แยกอย่างควบคุมก่อน production ห้ามใช้ automatic/forced fix เพราะอาจทำระบบเดิมพัง
- `npm run check:seb-readiness` ใน local คาดว่าจะไม่ผ่านเพราะจงใจไม่เก็บ production secret และ canonical HTTPS config ไว้ในเครื่อง ผลนี้ไม่ใช่ความล้มเหลวของห้องทดลองหน้าจอ
