# แผนตรวจหน้าข้อสอบจริงตามขนาดจอ

อัปเดต: 20 กันยายน 2026 · **เฟส agent-only 1–9 จบ · release gate ยังรอ staging และ physical-device UAT**

เอกสารนี้เป็นแผนตรวจหน้าข้อสอบ KorKru บน iPhone, iPad และ Mac ก่อนกลับไปทดสอบ SEB บน Windows ตามลำดับที่ผู้ใช้เลือก ไม่ได้เปลี่ยน Windows ให้เป็น “ผ่าน” และไม่ได้ใช้ผลจาก Apple อนุมานแทน Windows

## กติกาความปลอดภัย

มี Staging แยกจาก Production แล้ว การทดสอบบนเว็บที่ deploy ต้องใช้ `https://staging.korkru.com` และข้อมูลสังเคราะห์เท่านั้น ห้ามสร้างหรือแก้ข้อมูล QA ใน Production

เฟส 1 ใช้ `/exam-screen-lab` ซึ่งมีคุณสมบัติดังนี้:

- เปิดได้เฉพาะ local development หรือ Staging ที่ผ่าน isolation guard; Production และ Preview ที่ตั้งค่าไม่ครบตอบ 404
- ใช้ `ExamClient` ตัวเดียวกับหน้าทำข้อสอบจริง แต่เปิด `previewMode`
- ข้อมูลทุกชิ้นเป็นข้อมูลสมมติในหน่วยความจำ; proxy ข้าม Supabase session refresh สำหรับ route นี้ทั้ง local และ Staging
- คำตอบ รูปวิธีทำ กระดาษทด และไฟล์แนบไม่ถูกส่งขึ้น server; preview ไม่เขียน answer backup ลง localStorage
- สร้าง submission id ใหม่ทุกครั้งที่เปิดหน้า เพื่อลดการปะปนกับ local backup จากรอบก่อน
- ไม่เปิด proctor, fullscreen, clipboard blocking, timer หรือ SEB gate เพราะเฟสนี้ตรวจเฉพาะหน้าจอและการแตะ/พิมพ์

เส้นทางที่ต้องพิสูจน์ autosave/upload/submit จริงใช้บัญชีและข้อมูล QA ใน Staging แยกต่างหาก ห้ามนำข้อมูลนักเรียนจริงมาเป็น fixture

## วิธีเปิดห้องทดลอง

- physical UAT หนึ่งข้อต่อหน้า: `https://staging.korkru.com/exam-screen-lab`
- physical UAT สามข้อต่อหน้า: `https://staging.korkru.com/exam-screen-lab?perPage=3`
- local unit/runtime smoke ใช้ `http://<ที่อยู่เครื่องพัฒนา>:<port>/exam-screen-lab` ได้ แต่ไม่นับแทน physical UAT

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

เริ่ม physical-device UAT บน iPhone แล้วเมื่อ 20 กันยายน 2026 และพบว่าช่องคณิตศาสตร์เรียกทั้งคีย์บอร์ด iOS กับแป้นของเว็บพร้อมกัน อีกทั้ง bottom sheet ทับช่อง active; แก้ในโค้ดด้วยการไม่ขอ software keyboard สำหรับช่องที่มีแป้นครบ และเลื่อนช่องขึ้นเหนือแผงตามความสูงจริงทั้งแนวตั้ง/แนวนอนแล้ว ผลจำลอง 393×852, 852×393, 768×1024 และ 1280×800 ผ่าน และทดสอบซ้ำบน iPhone จริงกับ Staging candidate `r3` แล้วยืนยันว่าเหลือเฉพาะแป้นคณิตศาสตร์ของเว็บ ช่องคำตอบยังมองเห็นและรับค่าจากแป้นได้ เมื่อปิดแป้นแล้วค่าที่กรอกยังคงอยู่ จึงปิด regression ข้อนี้ได้ แต่ภาพทดสอบแนวนอนยังเหลือที่เหนือแป้นน้อยเกินไป จึงปรับจอเตี้ยแนวนอนให้หัวแผงอยู่แถวเดียวและปุ่มหลักเป็น 10 คอลัมน์โดยไม่ลด touch target ต่ำกว่า 44px ผลจำลอง 844×390 แสดงปุ่มหลักครบ 3 แถว แผงลดจากประมาณ 262px เหลือ 206px ช่อง active ห่างจากแผงประมาณ 12px และไม่ล้นแนวนอน แต่ยังคง release gate ของ iPhone เป็น pending จนกว่าจะยืนยันรอบนี้บน iPhone จริงและรายการ physical UAT ที่เหลือจะครบ

### เฟส 3 — iPad

สถานะ: **ผ่านในขอบเขต agent-only**; เลื่อน physical-device UAT ไปรวมหลังเฟส 8 จึงยังไม่ถือว่า iPad จริงผ่าน release gate

Agent ตรวจ 512×1024, 768×1024, 1024×1366 และ 1366×1024 แล้วไม่พบ overflow/control หลุดจอ แก้ iPad แนวตั้งกับ Split View ไม่ให้ navigator ด้านขวาบีบเนื้อหา โดยเพิ่ม dialog **ดูทุกข้อ** ที่รองรับเวลา สถานะทุกข้อ keyboard focus และ touch target; ปรับ viewport/safe-area ของโหมดโฟกัส dialog แป้นคณิตศาสตร์ เครื่องคิดเลข และกระดาษทด พร้อมเพิ่มพฤติกรรมลากด้วย touch/pen และเป้าสัมผัสของจับคู่/เรียงลำดับ ผลโต้ตอบจำลองของจับคู่สองแบบ เรียงลำดับ โหมดโฟกัส เครื่องคิดเลข และกระดาษทดผ่าน รวมถึง 96 test files / 1,310 tests, TypeScript, token lint และ production build ผ่าน รายละเอียดอยู่ใน `docs/EXAM_SCREEN_QA_IPAD.md`

สิ่งที่จงใจรอ physical-device UAT หลังเฟส 8: Safari/WebKit และ SEB จริง, safe-area, split/floating keyboard, camera/file picker, การหมุนเครื่อง, long-press ด้วยนิ้ว และ Apple Pencil

เริ่ม physical-device UAT บน iPad จริงเมื่อ 21 กันยายน 2026 โดย layout แนวตั้ง/แนวนอน, navigator แบบ responsive และแป้นคณิตศาสตร์ที่ไม่เรียกคีย์บอร์ด iPad ซ้อนผ่าน แต่พบว่าหน่วยคำตอบถูกวางหลังปุ่มเปิดแป้น ทำให้ดูแยกจากช่องคำตอบ จึงยังไม่ปิด iPad suite และแก้ component กลางให้ลำดับเป็น **ช่องคำตอบ → หน่วย → ปุ่มเปิดแป้น** ครบทั้งคำตอบเดี่ยว หลายข้อย่อย และช่องฝังในโจทย์ ผล runtime จำลอง 390×844, 768×1024, 1024×768 และ 1280×800 ไม่ล้นแนวนอน ค่าที่กดจากแป้นยังคงอยู่หลังปิด และรอขึ้น Staging candidate รอบใหม่เพื่อยืนยันบน iPad จริง

### เฟส 4 — Mac

สถานะ: **ผ่านในขอบเขต agent-only**; เลื่อน Safari/SEB และ native-device UAT ไปรวมหลังเฟส 8 จึงยังไม่ถือว่า Mac จริงผ่าน release gate

Agent ตรวจหน้าต่าง 900×600, 1280×720, 1440×900 และ 1728×1117 ครบ fixture 16 กรณีโดยไม่พบ overflow/control หลุดขอบ ทดสอบ keyboard, focus trap/return, Escape, mouse pointer drag, file preview local-only, โหมดโฟกัส เครื่องคิดเลข แป้นคณิตศาสตร์ และกระดาษทด แก้โฟกัสเริ่มต้นของโหมดโฟกัส, Escape ที่ Excalidraw เคยรับไปก่อน, การนำทางข้อด้วย screen reader/keyboard, accessibility ของ preview ไฟล์ และ contrast ของสถานะ/ปุ่มสำเร็จ Next MCP กับ browser runtime ไม่มี error; axe เหลือเฉพาะลายน้ำตกแต่งที่ถูก `aria-hidden` รายละเอียดอยู่ใน `docs/EXAM_SCREEN_QA_MAC.md`

ผลตรวจรอบปิดเฟส: 96 test files / 1,310 tests, TypeScript, token lint และ production build 63 static pages ผ่านทั้งหมด ไม่มี migration, environment, database, storage หรือ deployment เปลี่ยน

สิ่งที่จงใจรอหลังเฟส 8: Safari/WebKit จริง, browser zoom/native fullscreen, native file picker, trackpad gesture และ SEB บน Mac จริง

### เฟส 5 — เส้นทางนักเรียนจริงใน browser ปกติ

สถานะ: **agent-only readiness ผ่าน · authenticated E2E ถูกกั้นจนมี staging แยก**

เพิ่ม `.env.qa.example` และ `npm run check:exam-staging` ซึ่งอ่านเฉพาะ `.env.qa.local` แบบไม่เรียก network/ฐานข้อมูล ไม่แสดงค่าที่ตั้ง และ fail closed เมื่อไม่ประกาศ staging, ใช้ production deployment, site ซ้ำ หรือ Supabase project ซ้ำ production พร้อม unit tests ครอบคลุมกรณีผ่าน/ปฏิเสธ รายละเอียดอยู่ใน `docs/EXAM_STAGING_SETUP.md`

ยังต้องใช้บัญชีและข้อมูล QA ใน staging จริงเพื่อตรวจ login, start, autosave, reload/resume, upload, submit, result และผลที่ครูเห็น จึงบันทึกเป็น release blocker โดยไม่สร้างข้อมูลทดสอบใน production แทนการอ้างว่าผ่าน

ผลตรวจรอบเฟส: staging-guard tests 4 ข้อและชุดรวม 97 files / 1,314 tests ผ่าน, TypeScript กับ token lint ผ่าน; การรัน guard ในเครื่องปัจจุบันปฏิเสธอย่างถูกต้องเพราะไม่มี `.env.qa.local` และ staging แยก

### เฟส 6 — เส้นทางเดิมใน SEB

สถานะ: **agent-only evidence gate ผ่าน · native staging flow รอ staging และอุปกรณ์จริงหลังเฟส 8**

เพิ่ม manifest ที่ไม่เก็บ secret และ `npm run check:seb-platforms` เพื่อกันการประกาศรองรับจากผล native lab อย่างเดียว ตัวตรวจบังคับ Windows/macOS/iPadOS/iOS ให้ครบ native core, production-BEK verification, staging mock exam และ physical UAT ของ config/build เดียวกัน และปฏิเสธ field ที่เสี่ยงเก็บ key/password/token/hash มี unit tests ครอบคลุม รายละเอียดอยู่ใน `docs/SEB_PLATFORM_MATRIX.md`

สถานะจริงจงใจเป็น `NOT READY`: native core เคยผ่านแล้ว แต่ repository ยืนยัน secret ใน Vercel ไม่ได้และยังไม่มี staging mock exam/physical UAT รอบสุดท้าย จึงไม่ส่ง Key/รหัสเข้าระบบหรืออ้างว่าผ่านแทนผู้ใช้

ผลตรวจรอบเฟส: platform-evidence tests 4 ข้อและชุดรวม 98 files / 1,318 tests ผ่าน, TypeScript กับ token lint ผ่าน; ตัวตรวจรายงาน 4 release blockers ตรงตามหลักฐานจริงโดยไม่พิมพ์ CK/BEK

### เฟส 7 — การกู้คืนและห้องคุมสอบ

สถานะ: **ผ่านในขอบเขต agent-only · staging recovery/proctor drill รอหลังเฟส 8**

เสริม recovery ไม่ให้ backup ของ attempt เก่าหรือ answer id ที่ไม่อยู่ในข้อสอบปัจจุบันถูกส่งค้าง, แยกการคำนวณ timer จากเวลาเริ่มจริงเพื่อทดสอบ reload/throttle/clone/invalid time และแก้คิว proctor ให้ส่ง signal ที่เกิดระหว่าง request ต่อทันทีแทนการรอ heartbeat พร้อม unit tests ครอบคลุม retry, Realtime reconciliation, polling fallback, review queue และ alert deduplication รายละเอียดอยู่ใน `docs/EXAM_RECOVERY_QA.md`

ผลนี้ไม่แทน Wi‑Fi/Supabase/Realtime/upload/หลายบัญชีจริง เพราะยังไม่มี staging แยก การซ้อม attempt จำลอง, reload/resume, ไฟล์ล้มเหลว, timer, teacher presence และข้อความเตือนจึงรอทำรวมหลังเฟส 8 โดยห้ามจงใจทำให้เครื่องค้างหรือบังคับปิด

### เฟส 8 — regression และปิดหลักฐาน

สถานะ: **ผ่านในขอบเขต agent-only · external release gate ยัง NOT READY**

เพิ่ม `npm run check:exam-release` รวม staging-isolation และ SEB-platform evidence แบบ read-only/no-secret พร้อม runbook `docs/EXAM_RELEASE_UAT.md` ที่รวบ physical responsive UAT, authenticated staging, recovery/proctor และ production-config SEB ไว้เป็นลำดับเดียว Agent รัน regression, runtime smoke และ production build จาก commit เดียวกัน ส่วนผู้ใช้ช่วยเฉพาะขั้นที่ต้องใช้อุปกรณ์/บัญชีจริงหลังงาน agent จบ

ตัวตรวจต้องรายงาน `NOT READY` ในเครื่องปัจจุบัน เพราะยังไม่มี staging แยกและหลักฐาน production BEK + staging mock exam + physical UAT ยัง pending นี่เป็นผลที่ถูกต้อง ไม่ใช่ข้อผิดพลาด และห้ามเปลี่ยนสถานะให้ผ่านจากผล native lab เดิม

ผลตรวจปิดเฟส: 100 test files / 1,326 tests ผ่าน, TypeScript และ design-token lint ผ่าน, production build สร้าง 63 static pages สำเร็จ, Next.js MCP ไม่พบ config/session/compilation issue และ browser smoke หลัง restart ไม่พบ runtime error

### เฟส 9 — หลักฐาน UAT แบบ fail-closed

สถานะ: **agent-only tooling ผ่าน · UAT จริงทั้ง 7 ชุดยัง pending**

เพิ่ม manifest schema ตายตัว `config/exam-uat-evidence.json` กับ `npm run check:exam-uat` เพื่อแยก iPhone/iPad/Mac/Windows responsive, authenticated staging, recovery/proctor และการล้างข้อมูล QA ตัวตรวจบังคับผลผ่านพร้อมเวลา ISO/รุ่นที่ทดสอบและปฏิเสธ field เพิ่มเติม เพื่อกัน secret/ข้อมูลนักเรียน/free-text หลุดเข้า Git รายละเอียดอยู่ใน `docs/EXAM_UAT_EVIDENCE.md`

`npm run check:exam-release` รวม gate นี้แล้วและปัจจุบันรายงาน external blockers 3 กลุ่มตรงตามสถานะจริง: staging isolation, SEB platform evidence และ external UAT suites

ผลตรวจเฟส 9: 101 test files / 1,333 tests, TypeScript, design-token lint และ schema checks ผ่าน; `check:exam-uat` จงใจรายงาน 7 pending suites และ `check:exam-release` จงใจรายงาน 3 external blocker groups โดยไม่แสดงค่ารุ่นหรือข้อมูลที่บันทึกไว้

### เฟส 10 — UAT ทีละขั้นและ cleanup ordering

สถานะ: **agent-only tooling ผ่าน · Staging และ candidate พร้อมแล้ว · ขั้นถัดไปคือ iPhone responsive UAT**

เพิ่ม `npm run next:exam-uat` เพื่ออ่านหลักฐานแบบ read-only แล้วบอกงานถัดไปเพียงหนึ่งข้อ ตามลำดับ staging → responsive 4 ระบบ → authenticated flow → recovery/proctor → SEB 4 ระบบ → cleanup พร้อม unit tests ครบเส้นทาง malformed/pending/complete รายละเอียดอยู่ใน `docs/EXAM_UAT_NEXT_STEP.md`

ขยาย evidence state เป็น `pending`/`failed`/`passed` แบบสอดคล้องกับเวลาและรุ่นที่ทดสอบ และบังคับว่า QA cleanup ต้องเกิดหลัง suite อื่นผ่านครบพร้อม timestamp ไม่เก่ากว่า ป้องกันการใช้ผล cleanup เก่าปิด release หลังมีการทดสอบเพิ่ม

ผลเดิมของเฟส 10 คือ 102 test files / 1,342 tests ผ่านและชี้ไปสร้าง Staging; หลังเฟส 2C ตัวนำรองรับค่าที่ฉีดจาก Keychain/CI โดยไม่ต้องเขียน secret ลงไฟล์ และปัจจุบันชี้ไปทดสอบ iPhone จริงโดยไม่พิมพ์ค่า environment/manifests

### เฟส 11 — ผูกหลักฐานกับ release candidate เดียว

สถานะ: **candidate จริงถูกล็อกกับ source revision + Staging build + SEB config แล้ว**

เพิ่ม `config/exam-release-candidate.json` และ `npm run check:exam-candidate` เพื่อล็อก Git revision 40 ตัว, staging build id, SEB config id และเวลา ISO พร้อมตรวจว่า candidate id ตรงกับ UAT run และ config id ตรงกับ SEB platform evidence โดยไม่ยอมรับ URL, key-like build id, free text หรือ field เพิ่มเติม รายละเอียดอยู่ใน `docs/EXAM_RELEASE_CANDIDATE.md`

รวม candidate gate เข้า `check:exam-release` และ `next:exam-uat` แล้ว ลำดับจึงเป็น staging พร้อม → ล็อก candidate → เริ่ม UAT หากแก้ code/config ระหว่างทางต้องสร้าง candidate ใหม่และทดสอบ suite ที่ได้รับผลกระทบซ้ำ ปัจจุบัน Staging กับ candidate ผ่านแล้ว และ release checker เหลือ external blockers 2 กลุ่มตามจริง: SEB platforms และ external UAT

ผลรอบล็อก candidate: 105 test files / 1,360 tests, TypeScript, design-token lint และ production build ผ่าน; candidate checker ผ่านครบโดยไม่พิมพ์ค่า candidate/config และ next-step planner ชี้ iPhone responsive UAT เป็นงานถัดไป

ผู้ใช้เลื่อน Windows N2.1 มาทดสอบก่อนเฟส 8 และวันที่ 19 กันยายน 2026 ผ่าน native lab core บน Windows 11 x64 + SEB 3.10.2.920 แล้ว (A/B, CK+BEK, รหัสออกแยกชุด, Quit URL, เปิดผิดชุด และไฟล์แก้ไข) แต่ Windows ยังเป็น pending production release gate จนกว่าจะเก็บ BEK ของ production config และผ่าน mock exam จริง ส่วน device-UX เฟสที่เหลือยังต้องกลับมาทำต่อ

## หลักฐานที่เก็บได้

เก็บเฉพาะวันที่, รุ่นอุปกรณ์/OS/SEB/browser, ขนาดหรือแนวจอ, กรณีที่ทดสอบ, ผ่าน/ไม่ผ่าน และอาการที่ไม่มีข้อมูลส่วนบุคคล ห้าม commit credential, password, CK/BEK, token, request hash, ข้อมูลนักเรียน คำตอบจริง รูปลายมือจริง หรือไฟล์ข้อสอบจริง

## ความเสี่ยงที่แยกจากเฟสหน้าจอ

- ยังไม่มี staging จึงยังพิสูจน์ autosave/upload/submit/RLS จริงไม่ได้
- ยังไม่มี browser E2E framework; physical-device UAT ยังจำเป็น
- dependency audit วันที่ 20 กันยายน 2026 หลังอัปเกรด Next.js เป็น 16.3.5 รายงาน 54 รายการ (3 low, 40 moderate, 11 high); ช่องโหว่ critical ของ Next.js เดิมไม่ปรากฏแล้ว แต่ TipTap และ dependency อื่นยังมีรายการ high ต้องแก้เป็นงาน dependency แยกอย่างควบคุมก่อน production ห้ามใช้ automatic/forced fix เพราะอาจทำระบบเดิมพัง
- `npm run check:seb-readiness` ใน local คาดว่าจะไม่ผ่านเพราะจงใจไม่เก็บ production secret และ canonical HTTPS config ไว้ในเครื่อง ผลนี้ไม่ใช่ความล้มเหลวของห้องทดลองหน้าจอ
