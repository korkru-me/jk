# แผนตรวจหน้าข้อสอบจริงตามขนาดจอ

อัปเดต: 20 กันยายน 2026 · **เฟส 3 ผ่านในขอบเขต agent-only · physical-device UAT รอรวมหลังเฟส 8**

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

ชุดจำลองมี 16 กรณี ครบ question type ที่บันทึกได้ทั้ง 11 ชนิด และแยกกรณีสัมผัส/โหมดตอบที่ต่างกันออกมาตรวจจริง:

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

สถานะ: **ผ่านในขอบเขต agent-only**; เลื่อน physical-device UAT ไปรวมหลังเฟส 8 ตามคำสั่งเจ้าของผลิตภัณฑ์ จึงยังไม่ถือว่า iPhone จริงผ่าน release gate

Agent เปิด local URL และบอกทีละขั้น ผู้ใช้ช่วยถือ iPhone ทดสอบแนวตั้ง/แนวนอน คีย์บอร์ดภาษาไทย ช่องคณิตศาสตร์ แตะจับคู่ เรียงลำดับ เครื่องคิดเลข กระดาษทด รูป และไฟล์ โดยใช้ข้อมูลสมมติเท่านั้น

ก่อนเริ่มแก้ UI ได้อัปเกรด Next.js จาก 16.2.4 เป็น 16.3.5 และติดตั้ง `agent-browser` 0.38.1 เพื่อให้ตรวจ runtime สองทางได้ตามกติกาโครงการ: `/_next/mcp` รายงาน `get_compilation_issues` ว่าง, route `/exam-screen-lab` อยู่ใน route map, หน้าเปิดด้วย Chrome จริงโดยไม่มี config/session error และ production build กับ 1,302 tests ผ่านทั้งหมด งานนี้ไม่เปลี่ยนฐานข้อมูล, environment หรือ production deployment

ผลตรวจ agent-only รอบปิดเฟส:

- จำลอง 320×568, 390×844 และ 844×390 พิกเซล ทั้งหนึ่งข้อและสามข้อต่อหน้า; fixture ทั้ง 16 กรณีไม่มี document overflow หรือ control หลุดซ้าย/ขวา
- แตะจับคู่แบบช่องและแบบโยงเส้น, เลื่อนลำดับด้วยปุ่ม, เติมคำภาษาไทย + native select, แป้นคณิตศาสตร์, เครื่องคิดเลข, กระดาษทด, เติมคำในรูปแบบเต็มจอ และแนบไฟล์แบบ local-only ได้
- แก้โหมดโฟกัสบนจอแคบที่เคยบังคับแผงนำทาง desktop จนข้อสอบแคบและปุ่มออกหลุดจอ: มือถือซ่อนแผงข้าง ปุ่มหัวจอเป็น touch target 44px ขึ้นไป และ desktop ยังคงแผงนำทางเดิม
- แก้โจทย์ `essay` ที่เคยตกไปใช้ช่องตัวเลข ให้เป็น textarea หลายบรรทัดพร้อมชื่อสำหรับ screen reader และตัวนับอักษร; พิมพ์ภาษาไทยได้และไม่ล้นจอ
- แก้ ARIA ของช่องคณิตศาสตร์, เพิ่ม main landmark ใน lab และปรับข้อความสถานะ/คำเตือนที่ contrast ต่ำ; axe WCAG 2 A/AA เหลือ 0 violations (ลายน้ำโปร่งใสเป็นรายการที่เครื่องมือวัด contrast ไม่ได้และถูก `aria-hidden` อยู่แล้ว)
- Next MCP หลังแก้รายงาน compilation/session issues ว่าง; `npm test` 95 files / 1,302 tests, TypeScript, token lint และ production build (63 static pages) ผ่าน

สิ่งที่จงใจรอ physical-device UAT หลังเฟส 8: WebKit จริง, safe-area/notch, คีย์บอร์ดไทยของ iOS, กล้อง/Files picker จริง, long-press/ลากด้วยนิ้ว และการหมุนเครื่องระหว่างมีคีย์บอร์ดเปิด

### เฟส 3 — iPad

สถานะ: **ผ่านในขอบเขต agent-only**; เลื่อน physical-device UAT ไปรวมหลังเฟส 8 จึงยังไม่ถือว่า iPad จริงผ่าน release gate

Agent ตรวจ 512×1024, 768×1024, 1024×1366 และ 1366×1024 แล้วไม่พบ overflow/control หลุดจอ แก้ iPad แนวตั้งกับ Split View ไม่ให้ navigator ด้านขวาบีบเนื้อหา โดยเพิ่ม dialog **ดูทุกข้อ** ที่รองรับเวลา สถานะทุกข้อ keyboard focus และ touch target; ปรับ viewport/safe-area ของโหมดโฟกัส dialog แป้นคณิตศาสตร์ เครื่องคิดเลข และกระดาษทด พร้อมเพิ่มพฤติกรรมลากด้วย touch/pen และเป้าสัมผัสของจับคู่/เรียงลำดับ ผลโต้ตอบจำลองของจับคู่สองแบบ เรียงลำดับ โหมดโฟกัส เครื่องคิดเลข และกระดาษทดผ่าน รวมถึง 96 test files / 1,310 tests, TypeScript, token lint และ production build ผ่าน รายละเอียดอยู่ใน `docs/EXAM_SCREEN_QA_IPAD.md`

สิ่งที่จงใจรอ physical-device UAT หลังเฟส 8: Safari/WebKit และ SEB จริง, safe-area, split/floating keyboard, camera/file picker, การหมุนเครื่อง, long-press ด้วยนิ้ว และ Apple Pencil

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

ผู้ใช้เลื่อน Windows N2.1 มาทดสอบก่อนเฟส 8 และวันที่ 19 กันยายน 2026 ผ่าน native lab core บน Windows 11 x64 + SEB 3.10.2.920 แล้ว (A/B, CK+BEK, รหัสออกแยกชุด, Quit URL, เปิดผิดชุด และไฟล์แก้ไข) แต่ Windows ยังเป็น pending production release gate จนกว่าจะเก็บ BEK ของ production config และผ่าน mock exam จริง ส่วน device-UX เฟสที่เหลือยังต้องกลับมาทำต่อ

## หลักฐานที่เก็บได้

เก็บเฉพาะวันที่, รุ่นอุปกรณ์/OS/SEB/browser, ขนาดหรือแนวจอ, กรณีที่ทดสอบ, ผ่าน/ไม่ผ่าน และอาการที่ไม่มีข้อมูลส่วนบุคคล ห้าม commit credential, password, CK/BEK, token, request hash, ข้อมูลนักเรียน คำตอบจริง รูปลายมือจริง หรือไฟล์ข้อสอบจริง

## ความเสี่ยงที่แยกจากเฟสหน้าจอ

- ยังไม่มี staging จึงยังพิสูจน์ autosave/upload/submit/RLS จริงไม่ได้
- ยังไม่มี browser E2E framework; physical-device UAT ยังจำเป็น
- dependency audit วันที่ 20 กันยายน 2026 หลังอัปเกรด Next.js เป็น 16.3.5 รายงาน 54 รายการ (3 low, 40 moderate, 11 high); ช่องโหว่ critical ของ Next.js เดิมไม่ปรากฏแล้ว แต่ TipTap และ dependency อื่นยังมีรายการ high ต้องแก้เป็นงาน dependency แยกอย่างควบคุมก่อน production ห้ามใช้ automatic/forced fix เพราะอาจทำระบบเดิมพัง
- `npm run check:seb-readiness` ใน local คาดว่าจะไม่ผ่านเพราะจงใจไม่เก็บ production secret และ canonical HTTPS config ไว้ในเครื่อง ผลนี้ไม่ใช่ความล้มเหลวของห้องทดลองหน้าจอ
