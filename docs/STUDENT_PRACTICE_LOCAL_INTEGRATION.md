# Student practice: local integration handoff

## รอบต่อมา: ย่อพื้นที่และตั้งกฎถาวร

เจ้าของให้ประหยัดพื้นที่แกน Y เป็นกฎทุกงานเว็บ และขอบซ้ายตรงแนวเนื้อหาข้างเมนู บันทึกใน AGENTS.md และ `.cursor/rules/vertical-space.mdc` (alwaysApply). คลังฝึกลด padding/gap/radius, รวม pin filter กับหัวข้อ, ย่อชุดฝึก/แถบเลือกและการ์ดโจทย์, รวม attempt status กับ metadata, และถอด mx-auto. Card ของชุด/ฟอร์มวัดจาก container width ที่เหลือจาก sidebar ไม่ใช้ viewport อย่างเดียว

ข้อมูลจำลองวัดที่ 1280px: การ์ดโจทย์ 137→89px และแถบเลือก 93→69px; กลุ่มชุดฝึกที่ 699px 162→73px. Shell ขยาย/ย่อขอบรายการตรงขอบซ้ายเนื้อหา 336/125px. ตรวจ 320/1024px ไม่มี overflow ของหน้า/ข้อมูลความคืบหน้า, header pin แถวเดียวกับหัวข้อ, สร้างสามข้อ/ตอบแล้ว 1 จาก 3, ปุ่มแก้ไขเปิดฟอร์ม/ยกเลิก, ปัก/กรอง/เอาหมุดออกและคง shell ระหว่าง navigation ผ่าน. Fixture สำหรับเมนูจริง: `/exam-screen-lab/practice-library?view=local-student&shell=student`, ชื่อ/บัญชี/โจทย์สังเคราะห์และปิด notification polling

ผ่าน TypeScript, token lint, webpack production build และ Next MCP. รอบนี้แก้เฉพาะ UI/fixture/rules/docs ไม่แก้ lib, schema, scoring หรือ server mutation จึงไม่รัน unit suite ซ้ำหลัง 3,344 tests ที่ผ่านใน integration รอบก่อน. ยังไม่ apply migration, push/deploy หรือทดสอบ hosted persistence ตามคำสั่ง local only

อัปเดต 14 ตุลาคม 2026 · ผู้ใช้ให้ commit และตรวจ localhost ก่อน ยังไม่ push/deploy หรือเปลี่ยนฐานข้อมูลจริง

## Checkout และสาเหตุที่เห็นหน้าเดิม

- พอร์ต 3000 รัน `/Users/korkusonmasaen/Korkru/korkru` บน branch `codex/student-classroom-cards` (base `4d49323`)
- การ์ดและชุดฝึกก่อนหน้านี้อยู่ worktree `/Users/korkusonmasaen/Korkru/korkru-student-practice-exercises`, branch `codex/student-practice-exercises`, commits `e6cf85e` และ `493e033`; preview พอร์ต 3021 จึงไม่ได้เปลี่ยนหน้า library บน 3000
- รอบนี้รวม source/test/migrations/docs ของฟีเจอร์เข้า checkout หลักโดยรักษางานอื่นที่ dirty อยู่ และไม่เปลี่ยน checkout/branch ของ dev server

## พฤติกรรมที่ตรวจได้บน localhost:3000

Route เดิม `/practice/[id]/library` แสดงการ์ดโจทย์พร้อม difficulty/type/subject/tags/คำย่อ/สถานะตอบแล้ว เฉพาะปุ่มนักเรียนดูตัวอย่าง เฉลยแนบที่ library อนุญาต และปักไว้ทบทวน ไม่มีคำสั่งแก้/ลบ/แชร์โจทย์ของครู

นักเรียนเลือกข้ามหน้า/ตัวกรองได้สูงสุด 500 ข้อ ตั้งชื่อชุดส่วนตัว กรอบชุดอยู่เหนือโจทย์และแสดงตอบแล้ว X/Y โดยนับข้อที่ตรวจคำตอบอย่างน้อยหนึ่งครั้ง รวมประวัติก่อนสร้างชุด เปิดแก้ชื่อ/เพิ่ม/เอาออกภายหลังได้ มี revision conflict และยืนยันก่อนทิ้งร่าง; ร่างชื่อ/selection อยู่ sessionStorage แยกบัญชี/คลัง ปักหมุด/กรอง/เอาหมุดออกได้

เฉพาะ `NODE_ENV=development` ใช้ `PracticeLocalLibraryView` กับ helper `practice-local-review.ts`: ชื่อชุด/ID สมาชิก/revision/หมุดบันทึกใน localStorage แยกผู้ใช้/คลัง ไม่เรียก server mutations ของชุด/หมุด ไม่เก็บ answer key/คำตอบ/คะแนน และแสดงข้อความว่าบันทึกในเบราว์เซอร์นี้ ยังไม่ซิงก์ข้ามอุปกรณ์ ข้อมูลนี้จะไม่ย้ายเข้า cloud โดยอัตโนมัติ

Server ยังตรวจ authenticated actor, exact library, membership และ access-code session ก่อนส่ง metadata. Snapshot อ่านผล search RPC เดิมทีละ 24 ข้อใน batch จำกัด; ตรวจ total/duplicate IDs และส่งเฉพาะ display DTO. คำค้น/แท็กยังมาจากผลค้น server ที่ตรวจสิทธิ์แล้ว จึงเลือกและกรองหมุดข้ามหน้าได้ก่อนมี schema ใหม่

Production build ไม่เปิด local adapter; ใช้ service-only RPC และ schema ที่เตรียมไว้ตามเอกสาร security/data model. ยังต้อง apply และ QA Staging ก่อนเปิดการบันทึกข้ามอุปกรณ์

## Migration ledger และสิ่งที่ยังไม่ apply

คืน `20261014072745_attempt_expiry_finalization.sql` ซึ่ง Staging บันทึกแล้วและหายจาก checkout เดิม จาก `supabase migration fetch` ในโฟลเดอร์ชั่วคราว ตรวจ SQL token ตรง origin/codex/attempt-expiry; SHA256 `f0066cc0966ed97714bac32e5f7383c6d67be569d8357378b5dbd565f523bb0b`. ไม่แก้ SQL ของ migration ที่ apply แล้ว

ผล read-only ledger ในรอบก่อนหน้านี้ของ feature worktree: ไม่มี remote-only หลังคืนไฟล์ และ local-only ต่อไปนี้ยังไม่ apply:

- `20261014125654_classroom_practice_work_layout.sql` — งานจัดกลุ่ม/ลำดับครูก่อนหน้า
- `20261014134748_student_practice_exercises.sql` — สร้าง/อ่านชุดส่วนตัวและตรวจ exact ownership/library
- `20261014144828_student_practice_editing_and_review_pins.sql` — แก้ชุดแบบ revision lock และหมุดส่วนตัว

ไม่ทำ `migration repair`, schema apply, push หรือ deploy ในรอบ local integration. เมื่อกลับมาทำ Staging ให้รัน migration list ใหม่และตรวจ exact local/remote history ก่อนดำเนินการตาม AGENTS.md; ผล ledger นี้เป็นหลักฐานในเวลาที่ตรวจ ไม่รับประกันสถานะ remote ในอนาคต

## การตรวจ

- `npx tsc --noEmit`: ผ่าน
- `npm run lint:tokens`: ผ่าน ไม่มีไฟล์เพิ่ม semantic-token debt
- `npm test`: 259 files / 3,344 tests ผ่าน รวม 12 เคส local adapter (dev guard, derived progress, exact membership, strict storage, idempotency, revision conflicts, rename/membership และ desired pin state) และ SQL PGlite tests ของ schema ใหม่
- `NEXT_DIST_DIR=.next-build-practice-local npm run build -- --webpack`: ผ่าน รวม TypeScript และ static generation; Turbopack ครั้งแรกติด network Google Fonts จึงตรวจด้วย webpack พร้อมอนุญาต network โดยไม่เปลี่ยน app config. Build cache แยกจาก dev server และคืน tsconfig ให้ตรง dirty contents ก่อนเริ่มงาน
- Next MCP ที่ 3000: project path ตรง checkout หลัก, compilation issues และ runtime/config errors ว่าง
- Browser fixture `/exam-screen-lab/practice-library?view=local-student` ใช้ local adapter และ component จริง ไม่มีฐานข้อมูล: สร้างสองข้อ/ตอบแล้ว 1 จาก 2, เปลี่ยนชื่อ/เอาข้อเดิมออก/เพิ่มข้อใหม่, reload คงข้อมูล, เปิดชุดได้สมาชิกและลำดับที่แก้แล้ว, ปักหมุด/กรอง/เอาหมุดออกจนรายการว่าง, เปิดเฉลยแนบผ่าน
- ตรวจ route จริงแบบ read-only: browser session ที่มีอยู่เป็นบัญชีแอดมินและถูกปฏิเสธ 404 ตามสิทธิ์นักเรียน ไม่สลับบัญชีของผู้ใช้หรือสร้าง QA writes เพื่อให้ผ่าน จึงยังไม่ได้ตรวจรายการ 143 ข้อด้วยบัญชีนักเรียนใน browser session นี้
- Hosted Staging/Auth-to-DB persistence, multi-connection races และ migration apply ยังไม่ทดสอบในรอบนี้; ไม่มีการเขียนข้อมูล Production

## ส่งต่อ

Commit รอบนี้ลง `codex/student-classroom-cards` ในเครื่องเท่านั้น ตามคำสั่งล่าสุด ไม่มี push. ผู้ใช้เปิดลิงก์ library เดิมบน 3000 ด้วยบัญชีนักเรียนแล้ว refresh เพื่อดู layout ใหม่; กลุ่ม/หมุดใน local review อยู่เฉพาะ browser profile นั้น การทดสอบ hosted persistence และเผยแพร่ให้กลับมาทำหลังผู้ใช้เลือกดำเนินการต่อ
