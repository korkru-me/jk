# ซิงก์ UI โจทย์กลับโลคอลหลัก — 18 ตุลาคม 2026

ผู้ใช้เปิด `http://localhost:3000/questions/new` แล้วพบดีไซน์เดิมหลังปล่อย PR #59/#60 สาเหตุคือ dev server PID 72854 ใช้ `/Users/korkusonmasaen/Korkru/korkru` แต่การพัฒนาและทดสอบก่อนหน้านี้ใช้ checkout แยกที่พอร์ต 3054

## ขอบเขตที่ซิงก์

นำไฟล์ runtime/test/fixture 12 paths จาก Production source `237f44e85ce55eb91ca2fe7b317c37d5ab577940` กลับ primary working copy และบันทึกแพตช์บน branch `codex/local-question-ui-sync-20261018` ซึ่งเริ่มจาก primary base `70f9f2a9e6a83ce34410b048f723a215239c81e2`:

- `app/(app)/questions/new/page.tsx`, `question-types.module.css`, `_components/sample-preview.tsx`
- `app/(app)/questions/import/page.tsx`, `_components/import-choice.tsx`, `_components/import-choice.module.css`
- `components/questions/question-preview.tsx`, `question-preview-content.tsx`
- `lib/question-scoring.ts`, `question-scoring.test.ts`
- `app/exam-screen-lab/question-samples/page.tsx`, `question-import-options/page.tsx`

ทั้ง 12 paths ใน primary ตรงกับ source ของ Production ทุก byte เพิ่ม preload/error/retry dependency ของพรีวิวพร้อมดีไซน์ใหม่ คง `lib/assignment-attempt.ts` ของ primary ที่มีงานตรวจคะแนนใหม่ไว้ ฟังก์ชัน `naturalMaxScore`/`gradeValue` ใน helper ที่เพิ่มเหมือน implementation เดิมของ primary

Primary มีงานตรวจคะแนนทำอยู่ จึงใช้การซิงก์ scoped working-tree files โดยไม่สลับหรือ commit บน branch primary งานตรวจคะแนน, tsconfig และไฟล์ PDF/patch ที่ค้างอยู่ยังคงอยู่ แพตช์ที่ตรงกันถูก commit/push บน branch แยกเพื่อให้สืบต่อและนำเข้าผ่าน Git ได้ เอกสารนี้คัดลอกไว้ใน primary ด้วย ส่วน Feature status/Design system ที่อัปเดตอยู่ใน branch แพตช์

## ผลตรวจ

- ตรวจจาก dev server พอร์ต 3000 จริงด้วย Next MCP: `/questions/new` และ `/questions/import` compile ไม่มี issues; ไม่พบ config/runtime session errors
- Chrome ที่ 320/390/1440px: หัวกรอบสีอ่อน/ส่วนล่างสีขาว, ไอคอนพื้นหลัง 32px เห็นครบ, ปุ่ม Eye พร้อม “ดูตัวอย่างโจทย์”, ไม่มี overflow
- เปิดตัวอย่างครบ 11 ประเภทสำเร็จ; การ์ดนำเข้า 2 แบบถูกต้อง และปุ่ม KorKru เรียก file input ได้โดยดัก click ไม่ให้เลือกไฟล์จริง
- TypeScript, token lint, production build และ unit tests 298 files / 3,842 cases ผ่านใน checkout แยกที่ใช้ baseline primary
- ย้าย generated route types เก่าของ checkout แยกที่ไม่มี dev server ใช้ ก่อนสร้าง types/build ใหม่ ไม่แตะ `.next` ของ primary ที่กำลังรัน

ขอบเขตนี้คือ UI สองหน้าและตัวพรีวิวที่เกี่ยวข้อง ไม่มี environment/ฐานข้อมูล/migration เปลี่ยน และไม่มีการ deploy Production เพิ่ม ตรวจข้อมูลจริงและการนำเข้าไฟล์จริงไม่ได้อยู่ในรอบนี้
