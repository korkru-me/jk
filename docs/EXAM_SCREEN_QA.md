# แผนตรวจหน้าข้อสอบจริงตามขนาดจอ

อัปเดต: 12 กันยายน 2026 · **เฟส 1 ผ่าน · เฟส 2A ผ่านการจำลอง / 2B รอ iPhone จริง · เฟส 3A ผ่านการจำลอง / 3B รอ iPad จริง · เฟส 4A ผ่านการจำลอง / 4B รอ Mac Safari จริง**

เอกสารนี้เป็นแผนตรวจหน้าข้อสอบ KorKru บน iPhone, iPad และ Mac ก่อนกลับไปทดสอบ SEB บน Windows ตามลำดับที่ผู้ใช้เลือก ไม่ได้เปลี่ยน Windows ให้เป็น “ผ่าน” และไม่ได้ใช้ผลจาก Apple อนุมานแทน Windows

## กติกาความปลอดภัย

เครื่องพัฒนาปัจจุบันเชื่อมกับ Supabase project ที่เอกสารโครงการระบุว่าเป็น production และยังไม่มี staging แยก จึงห้ามสร้างบัญชี ห้องเรียน ข้อสอบ คำตอบ การส่งงาน หรือไฟล์ QA ในฐานนี้

เฟส 1–4A ใช้ `/exam-screen-lab` ซึ่งมีคุณสมบัติดังนี้:

- เปิดได้เฉพาะเมื่อ environment ระบุชัดว่าเป็น development/test; production, preview, staging, ค่าว่าง และค่าที่ไม่รู้จักตอบ 404
- ใช้ `ExamClient` ตัวเดียวกับหน้าทำข้อสอบจริง แต่เปิด `previewMode`
- ข้อมูลทุกชิ้นเป็นข้อมูลสมมติในหน่วยความจำ; proxy ข้าม Supabase session refresh เฉพาะ route นี้ใน development/test
- คำตอบ รูปวิธีทำ กระดาษทด และไฟล์แนบไม่ถูกส่งขึ้น server; preview ไม่เขียน answer backup ลง localStorage
- สร้าง submission id ใหม่ทุกครั้งที่เปิดหน้า เพื่อลดการปะปนกับ local backup จากรอบก่อน
- ไม่เปิด proctor, fullscreen, clipboard blocking หรือ SEB gate เพราะเฟสนี้ตรวจเฉพาะหน้าจอและการแตะ/พิมพ์; timer ปิดตามค่าเริ่มต้นและเปิดเวลาจำลองได้ด้วย `timer=1`

เมื่อมี Supabase และ Vercel staging แยกแล้ว จึงค่อยสร้างบัญชี QA และทำเฟสที่ต้องพิสูจน์ autosave/upload/submit จริง ห้ามนำข้อมูลนักเรียนจริงมาเป็น fixture

## วิธีเปิดห้องทดลอง

- หนึ่งข้อต่อหน้า: `http://<ที่อยู่เครื่องพัฒนา>:<port>/exam-screen-lab`
- สามข้อต่อหน้า: `http://<ที่อยู่เครื่องพัฒนา>:<port>/exam-screen-lab?perPage=3`
- แสดงเวลาจำลอง 60 นาที: เติม `timer=1` เช่น `/exam-screen-lab?timer=1`
- เปิดกล่องยืนยันส่งโดยไม่ต้องแนบรูปจำลองก่อน: เติม `work=0` เช่น `/exam-screen-lab?work=0`

ชุดจำลองมี 12 กรณี ครบ question type ที่บันทึกได้ทั้ง 10 ชนิด และมีกรณีสัมผัสที่ต่างกันสำหรับ true/false และ matching:

- ตัวเลขหลายข้อย่อยและรูปวิธีทำบังคับ
- ปรนัยพร้อมรูปประกอบ
- ถูก–ผิดแบบตัดสินทีละข้อความ และแบบเลือกข้อความที่ไม่ถูกต้อง
- เติมคำแบบพิมพ์และรายการเลือก
- จับคู่แบบวางลงช่อง และแบบลากเส้น
- เรียงลำดับ
- โจทย์ผสม
- ตารางจำแนกหลายมิติ
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

สถานะ: **2A ผ่านเฉพาะการเตรียมและ browser simulation · 2B รอเครื่อง iPhone จริง**

#### เฟส 2A — Agent เตรียมให้โดยไม่รบกวนผู้ใช้

ทำแล้ว:

- แก้ lab ให้ปิดแบบ fail-closed เมื่อ environment หายหรือเป็นค่าที่ไม่รู้จัก
- หน้าทำข้อสอบจริง `/assignments/[id]/take` ใช้พื้นที่เต็มจอโดยไม่ซ้อน sidebar ของแอปกับแถบนำทางข้อสอบใน iPhone แนวนอน; สิทธิ์และการตรวจฝั่ง server ยังทำงานใน parent route เหมือนเดิม
- ซ่อนแถบนำทางด้านข้างบนจอเล็กทั้งโหมดปกติและโหมดโฟกัส และเพิ่มปุ่ม **ดูทุกข้อ** สำหรับกระโดดไปข้อที่ต้องการ
- แสดงเวลาที่เหลือบนมือถือ เพิ่มช่องเรียงความหลายบรรทัด และขยายพื้นที่แตะของจุดโยงเส้น ปุ่มเรียงลำดับ ปุ่มเครื่องมือ ปุ่มแนบ/ลบไฟล์ และปุ่มหลัก
- จำกัดความสูงและเปิดการเลื่อนให้แป้นคณิตศาสตร์กับกล่องยืนยันส่ง พร้อมปิดแผงเครื่องมือก่อนเปิดกล่องส่ง
- ตรวจด้วย desktop browser แบบ manual viewport emulation ที่ 375×667, 390×844 และ 844×390 ทั้งแนวตั้ง/แนวนอน, หนึ่งและสามข้อต่อหน้า, โหมดปกติ/โฟกัส, ครบ 11 กรณีที่มีในรอบนั้น โดยไม่พบการล้นแนวนอน; ตารางจำแนกที่เพิ่มภายหลังรวมอยู่ในการตรวจเฟส 3A
- ไม่มี migration, env, Supabase row, Storage object หรือ deployment เปลี่ยน

ผลข้างต้นมาจาก browser simulation บนเครื่องพัฒนา ไม่ใช่ Safari/WebKit หรือแอป SEB บน iPhone จริง จึงยังห้ามเรียกเฟส 2 ทั้งเฟสว่า “ผ่าน”

ผลตรวจรอบปิดเฟส 2A:

- `npm test`: 86 files / 1,073 tests ผ่าน
- `npx tsc --noEmit`: ผ่าน
- `npm run lint:tokens`: ผ่าน ไม่มี design-token debt เพิ่ม
- `npm run build`: ผ่าน สร้าง static pages 61 หน้า
- development smoke: lab พร้อม `perPage`, `timer` และ `work` ตอบ 200
- production smoke: `/exam-screen-lab` ตอบ 404
- `/assignments/[id]/take` client bundle ประมาณ 0.236 MiB gzip (811,756 bytes raw / 247,657 bytes gzip)
- รอบ manual simulation เพิ่มยืนยันว่ากล่อง **ดูทุกข้อ** ยังมองเห็นและปิดได้เมื่อหมุน 390×844 เป็น 844×390, เริ่ม focus ที่ปุ่มปิด และปุ่ม Escape ปิดกล่องได้

#### เฟส 2B — รอผู้ใช้ว่าง

Agent จะเปิด local URL และบอกทีละขั้น ผู้ใช้ช่วยถือ iPhone ทดสอบแนวตั้ง/แนวนอน คีย์บอร์ดภาษาไทย ช่องคณิตศาสตร์ แตะจับคู่ เรียงลำดับ เครื่องคิดเลข กระดาษทด รูป และไฟล์ โดยใช้ข้อมูลสมมติเท่านั้น ดูรายการที่ [EXAM_SCREEN_QA_IPHONE.md](EXAM_SCREEN_QA_IPHONE.md) ผู้ใช้ไม่ต้องทำขั้นตอนนี้จนกว่าจะบอกว่าพร้อม

### เฟส 3 — iPad

สถานะ: **3A ผ่านเฉพาะการตรวจโค้ดและ browser simulation · 3B รอเครื่อง iPad จริง**

#### เฟส 3A — Agent เตรียมให้โดยไม่รบกวนผู้ใช้

ทำแล้ว:

- ให้ iPad แนวตั้งใช้กล่อง **ดูทุกข้อ** แทนแถบนำทางถาวร เพื่อไม่บีบพื้นที่ตอบ และคงแถบนำทางถาวรเมื่อจอกว้างพอ
- ให้กระดาษทดเต็มจอบน iPad แนวตั้งและเป็นแผงข้างเมื่อจอกว้าง พร้อมทำให้โหมดโฟกัส กล่องยืนยันส่ง เครื่องคิดเลข และแป้นคณิตศาสตร์อิงความสูงที่มองเห็นจริง
- ขยายพื้นที่แตะของตัวนำทาง จับคู่ เรียงลำดับ แป้นคณิตศาสตร์ เครื่องคิดเลข และเครื่องมือกระดาษทดสำหรับอุปกรณ์แบบสัมผัส
- การเรียงลำดับด้วยนิ้วหรือปากกาบนแถวต้องกดค้างเพื่อไม่แย่งการเลื่อนหน้า; จุดจับลากเฉพาะเริ่มได้ทันที และยังมีปุ่มลูกศรเป็นทางสำรอง
- ตรวจครบ 12 กรณีทั้งแบบหนึ่งและสามข้อต่อหน้า ที่ 744×1133, 768×1024, 820×1180, 1024×1366, 1024×768, 1133×744, 1180×820, 1366×1024 และ Split View 507×1024 ไม่พบ horizontal overflow, องค์ประกอบหลุดซ้าย/ขวา, console error, exception หรือ resource load failure
- เปิดและวัดกล่อง **ดูทุกข้อ**, เครื่องคิดเลข, กระดาษทด, โหมดโฟกัส และกล่องยืนยันส่งแล้ว ทุกกล่องอยู่ในขอบ viewport
- ไม่มี migration, env, Supabase row, Storage object หรือ deployment เปลี่ยน

ผลข้างต้นมาจาก Chrome browser simulation บนเครื่องพัฒนา ไม่ใช่ Safari/WebKit หรือแอป SEB บน iPad จริง จึงยังห้ามเรียกเฟส 3 ทั้งเฟสว่า “ผ่าน”

ผลตรวจรอบปิดเฟส 3A:

- `npm test`: 74 files / 819 tests ผ่าน
- `npx tsc --noEmit`: ผ่าน
- `npm run lint:tokens`: ผ่าน ไม่มี design-token debt เพิ่ม
- `npm run build`: ผ่าน สร้าง static pages 62 หน้า
- development simulation: ครบ 9 viewport ทั้งหนึ่งและสามข้อต่อหน้า; 12 fixtures, timer, navigator, focus, calculator, scratchpad และ submit dialog ผ่าน
- production smoke: `/exam-screen-lab` ตอบ 404
- `/assignments/[id]/take` client bundle ประมาณ 0.237 MiB gzip (816,690 bytes raw / 248,750 bytes gzip)
- ไม่มี migration, env, database, storage หรือ deployment เปลี่ยน

#### เฟส 3B — รอผู้ใช้ว่าง

Agent จะเปิด local URL และบอกทีละขั้น ผู้ใช้ช่วยถือ iPad ทดสอบแนวตั้ง/แนวนอน คีย์บอร์ดปกติหรือคีย์บอร์ดลอย การสัมผัสและ Apple Pencil การหมุนจอ เครื่องมือ รูป และไฟล์ โดยใช้ข้อมูลสมมติเท่านั้น ดูรายการที่ [EXAM_SCREEN_QA_IPAD.md](EXAM_SCREEN_QA_IPAD.md) ผู้ใช้ไม่ต้องทำขั้นตอนนี้จนกว่าจะบอกว่าพร้อม

### เฟส 4 — Mac

สถานะ: **4A ผ่านเฉพาะ agent-only code audit และ Chromium CDP simulation · 4B รอ Mac Safari จริง**

#### เฟส 4A — Agent ตรวจโดยยังไม่รบกวนผู้ใช้

ทำแล้ว:

- ตรวจโค้ดเส้นทาง keyboard, focus, mouse/drag, scroll และ floating tools โดยไม่ใช้ข้อมูลจริงหรือเขียนขึ้น server
- ใช้ Chromium CDP จำลองหน้าต่าง 900×600, 1280×720, 1440×900 และ 1728×1117 ครบชุดจำลอง 12 กรณี ทั้งหนึ่งและสามข้อต่อหน้า ไม่พบ horizontal overflow
- จำลองพื้นที่แสดงผลเทียบเท่า browser zoom 200% และตัวอักษร 125% โดยไม่พบองค์ประกอบหลุดขอบ, console error, exception หรือ resource load failure
- ตรวจตัวนำทางข้อ, โหมดโฟกัส, เครื่องคิดเลข, กระดาษทด, แป้นคณิตศาสตร์, จับคู่, เรียงลำดับ, ตัวอย่างไฟล์ และกล่องยืนยันส่ง รวม focus trap และการย้าย focus ข้ามหน้าข้อแล้ว
- แก้เส้นทาง keyboard ของโจทย์จับคู่ให้ Enter/Space เลือกชิปได้ โดยไม่ทำให้การแตะหรือลากสลับสถานะซ้ำ

ผลข้างต้นเป็นเพียง code audit กับ Chromium CDP simulation บนเครื่องพัฒนา ไม่ใช่ผลจาก Safari/WebKit, แอป SEB, native fullscreen, native file picker หรือ trackpad บน Mac จริง จึงยังห้ามเรียกเฟส 4 ทั้งเฟสว่า “ผ่าน”

ผลตรวจรอบปิดเฟส 4A:

- `npm test`: 74 files / 819 tests ผ่าน
- `npx tsc --noEmit`: ผ่าน
- `npm run lint:tokens`: ผ่าน ไม่มี design-token debt เพิ่ม
- `npm run build`: ผ่าน สร้าง static pages 62 หน้า
- development simulation: ครบ 12 fixtures, `perPage=1/3` และ 4 viewport; keyboard/focus, การลากด้วย mouse, synthetic file preview และ overlay สำคัญผ่าน
- production smoke: `/exam-screen-lab` ตอบ 404 และ `/login` ซึ่งใช้เป็น control ตอบ 200
- `/assignments/[id]/take` client bundle ประมาณ 0.238 MiB gzip (819,496 bytes raw / 249,380 bytes gzip)
- ไม่มี migration, env, database, storage หรือ deployment เปลี่ยน

#### เฟส 4B — รอผู้ใช้ว่าง

ผู้ใช้ช่วยตรวจ Mac Safari จริงตาม [รายการทดสอบเฟส 4B](EXAM_SCREEN_QA_MAC.md) ทั้งหน้าต่างเล็ก/ใหญ่, keyboard navigation, scroll, trackpad/mouse drag, native file picker, focus mode และ modal ส่วน Safari, SEB และ native fullscreen ยังเป็น pending จนกว่าจะทดสอบบนเครื่องจริง ผู้ใช้ยังไม่ต้องทำขั้นตอนนี้จนกว่าจะบอกว่าพร้อม

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
