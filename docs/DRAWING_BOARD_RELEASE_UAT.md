# Drawing Board phase 8 — Staging UAT และ rollout gate

อัปเดต: 22 กันยายน 2026

สถานะ: **NOT READY — ยังไม่ได้ล็อก Drawing Board candidate บน canonical Staging และ physical/authenticated UAT ยัง pending**

เอกสารนี้เป็นรายการตรวจรับของ `docs/DRAWING_BOARD_IMPROVEMENTS.md` เฟส 8 เท่านั้น ไม่แทน Exam/SEB UAT ใน `docs/EXAM_RELEASE_UAT.md` และห้ามนำผลจากคนละ revision หรือ build มารวมกัน

## หลักฐานที่ปิดได้แล้ว

- สร้าง branch `codex/drawing-board-phase-8` จากเฟส 7 และรวม ancestry ของ `origin/staging` โดยไม่ย้าย canonical Staging ออกจาก Exam candidate `r8`
- ก่อนสร้าง migration ตรวจ `supabase migration list` กับ Supabase Staging แล้ว local/remote ตรงกันทุก version ถึง `20260916230106`
- สร้าง `20260921185046_allow_png_math_work_preview_paths.sql` ด้วย `supabase migration new` migration คง RLS/Storage/ownership เดิมและขยายเฉพาะ exact preview suffix จาก `.webp` เป็น `.webp|.png` ใน CHECK ของนักเรียน/ครูและ student scope trigger
- PGlite regression รัน SQL migration จริงและยืนยัน PNG/WebP ผ่าน แต่ GIF, path traversal และ student path ที่ชี้ submission ผิดยังถูกปฏิเสธ
- commit migration ก่อน apply แล้วจึงใช้ `supabase db push` กับ Staging; หลัง apply migration ledger ตรงกันถึง `20260921185046`, database lint ระดับ error ผ่าน และ dry-run รายงาน `Remote database is up to date`
- branch Preview ของ commit เฟส 8 ถูกสร้างแต่ deployment ล้มเหลวและไม่ถูกนับเป็น candidate; environment contract ของโครงการให้ Staging secrets เฉพาะ branch `staging` ขณะที่ canonical Staging ยังผูก source `564f12c` ของ Exam candidate `r8`
- regression ล่าสุดผ่าน 121 files / 1,570 tests, TypeScript, design-token lint, production build 63 static pages และ bundle gate 17 chunks / 248,228 bytes gzip
- ก่อน rollout Production ตรวจ migration ledger ว่าตรงกัน, dry-run พบเฉพาะ `20260921185046`, database lint ระดับ error ผ่าน แล้วจึง apply migration; dry-run หลัง apply รายงานว่า remote up to date
- fast-forward `master` ถึง `0a6904449dfdb8a007b0ada2749f5a83c64f5bf8` และ Vercel Production deployment สำเร็จตามคำสั่งเจ้าของผลิตภัณฑ์ แต่การ deploy นี้ไม่ใช่หลักฐาน UAT และไม่เปลี่ยนสถานะ **NOT READY**
- canonical Staging alias ยังไม่ถูกเปลี่ยนและ Drawing Board candidate ยังไม่ได้ล็อก; authenticated/physical/cross-account suites ด้านล่างยังเป็น `pending`

## การล็อก candidate

ทำหลัง Exam candidate ที่ใช้งาน canonical Staging อยู่จบรอบหรือเจ้าของผลิตภัณฑ์อนุมัติให้ยกเลิกเท่านั้น:

1. merge/fast-forward revision ของ Drawing Board เข้า branch `staging`
2. ยืนยัน build ผ่าน environment isolation guard และหน้าแสดงป้าย `STAGING · ระบบทดสอบ`
3. ยืนยัน `supabase migration list` ตรงกันและ dry-run ไม่มี migration ค้าง
4. กรอกเฉพาะ metadata ที่ไม่เป็นความลับใน `config/drawing-board-uat-evidence.json`: `candidateId`, revision 40 ตัว, Staging build id และ `lockedAt` แบบ ISO UTC
5. คืน suite ทุกชุดที่ได้รับผลจาก code/build ใหม่เป็น `pending` ก่อนเริ่มทดสอบ
6. รัน `npm run check:drawing-board-uat`; ผลที่ถูกต้องก่อน UAT คือ `NOT READY`

ห้ามใส่ URL, token, password, email, user id, signed URL, Storage path, scene, คำตอบ หรือข้อมูลนักเรียนใน evidence file

## ชุดทดสอบจริงที่ต้องผ่าน

ใช้บัญชีและข้อมูล QA สังเคราะห์ใน Staging เท่านั้น ทุก flow ต้องอยู่บน candidate เดียวกัน

### 1. iPhone Safari

- เปิด lab และหน้าทำงานจริงทั้งแนวตั้ง/แนวนอน ไม่มี horizontal overflow หรือคำสั่งถูก clip
- วาดด้วยนิ้ว, สลับนิ้วเขียน/นิ้วเลื่อน, pinch, undo/redo, partial eraser และ close/reopen
- ลอง camera/Files picker จริงและยืนยันว่า action ที่ policy ปิดยังเข้าไม่ได้ผ่าน paste/drop/context menu
- Safari PNG fallback ต้องแนบสำเร็จและเปิด preview ได้หลัง signed URL ถูกออกใหม่

### 2. iPad Safari และ Apple Pencil

- ทดสอบนิ้วกับ Pencil แยกกัน: Pencil ยังเขียนเมื่อโหมดนิ้วเป็นเลื่อน และนิ้วกลับมาเขียนได้เมื่อเลือกโหมดนิ้วเขียน
- ทดสอบ pinch/pan, partial eraser, selection, text, rotate, split/floating keyboard และ close/reopen
- ตรวจ palm/gesture behavior ตามจริงโดยไม่อ้างคุณภาพเทียบ native app
- แนบ PNG fallback, reload แล้วกู้ local draft และ stale/unverified warning ถูกต้อง

### 3. Desktop Safari และ Chromium

- ทดสอบ Safari อย่างน้อยหนึ่งเครื่องและ Chrome/Edge อย่างน้อยหนึ่งเครื่องด้วย mouse/trackpad/keyboard
- ตรวจ focus, shortcut policy, text editing, paste/drop/context menu, zoom และ fullscreen panel
- สลับ/ซ่อน editor 10 รอบ ต้องมี `.excalidraw` ไม่เกินหนึ่ง instance และไม่มี growth ผิด gate 20% ใน profile เดียวกัน

### 4. Student Auth/Storage/attachment

- ครูสร้างงานออนไลน์ QA ที่เปิดกระดาษทดและมีข้อที่บังคับแนบวิธีทำ นักเรียนเริ่ม submission จริง
- วาด → autosave local → close/reopen → reload → แนบ → แก้ต่อจน stale → submit warning → แนบใหม่ → submit
- ตรวจทั้ง WebP และ Safari PNG; preview/scene ต้องอยู่ private Storage และอ่านผ่าน signed URL อายุสั้นเท่านั้น
- attach failure ต้องคง local draft และ artifact รุ่นก่อน; หลัง submit ต้องแก้/ลบ artifact ไม่ได้

### 5. Teacher Auth/Storage/board

- ครูสร้าง, save, load, replace และ delete กระดานอย่างน้อยสองข้อ/หลาย slot
- ตรวจ dirty state, load/save failure, one-step recovery, app-back/link/reload guard และ duplicate-next-step ที่ไม่เขียนทับต้นฉบับ
- ปิด/เปิดและสลับข้อ 10 รอบ ต้องเหลือ editor เดียว; session Library อยู่ระหว่าง remount และหายเมื่อออก route
- ครูร่วม `view` เห็น read-only; owner หรือ `admin/manage` ที่ถูกต้องจัดการได้ตาม policy และ slot 6 ถูกปฏิเสธ

### 6. Cross-account authorization

- ใช้ teacher owner, co-teacher `manage`, co-teacher `view`, student เจ้าของ submission และบัญชีคนละ organization
- ยืนยัน direct browser/API attempt ไม่อ่านหรือเขียน board/artifact ของคนอื่น และไม่ใช้ signed token/receipt ข้าม actor, assignment, question, answer, part หรือ upload id
- ตรวจว่าคำตอบ/scene/signed URL/path ไม่ปรากฏใน client log หรือ error message

### 7. QA cleanup

- ลบ board/artifact ผ่าน flow จริงและตรวจว่า database reference เปลี่ยนก่อน object cleanup
- รัน orphan cleanup แบบ dry-run และลบเฉพาะข้อมูล QA หลังครบ grace/เงื่อนไขที่ออกแบบไว้ ห้ามแตะข้อมูล Production
- ยืนยันไม่มี assignment, submission, artifact, board หรือ Storage object ของรอบ QA ค้าง
- บันทึก `qa-data-cleanup` เป็น passed หลัง suite อื่นผ่านครบเท่านั้น

## เกณฑ์อนุมัติ rollout

- `npm run check:drawing-board-uat` ผ่านจาก evidence ของ candidate เดียวกัน
- `npm test`, `npx tsc --noEmit`, `npm run lint:tokens`, `npm run build` และ `npm run measure:take-bundle` ผ่านจาก source revision เดียวกัน
- Supabase Staging ledger ตรงกับ Git, database lint ระดับ error ผ่าน และไม่มี schema push ไป Production
- ไม่มี unresolved issue จาก physical/authenticated UAT; ถ้าแก้ code, migration หรือ build ต้องล็อก candidate ใหม่และทดสอบ suite ที่ได้รับผลซ้ำ
- หลังครบทั้งหมดจึงค่อยพิจารณา merge/deploy Production โดยต้องได้รับคำสั่งที่ชัดเจนแยกจากการทดสอบ Staging
