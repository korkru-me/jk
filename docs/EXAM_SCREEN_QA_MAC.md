# รายการตรวจหน้าข้อสอบบน Mac — เฟส 4

อัปเดต: 20 กันยายน 2026 · **agent-only ผ่านแล้ว — Safari/SEB บน Mac จริงรอรวมหลังเฟส 8**

ใช้เฉพาะหน้า `/exam-screen-lab` และข้อมูลจำลอง การตรวจด้วย Chromium บนเครื่องพัฒนาไม่ใช่หลักฐานแทน Safari/WebKit, แอป SEB, native file picker หรือ trackpad บน Mac จริง

## ผล agent-only

- ตรวจหน้าต่าง 900×600, 1280×720, 1440×900 และ 1728×1117 ทั้งหนึ่งข้อและสามข้อต่อหน้า; fixture ครบ 16 กรณีไม่มี document overflow หรือ control หลุดขอบจอ
- ตรวจ keyboard navigation ของโจทย์จับคู่ด้วย Enter/Space, dialog ดูทุกข้อ, โหมดโฟกัส, เครื่องคิดเลข, แป้นคณิตศาสตร์ และกระดาษทด รวม Escape, focus trap และการคืน focus ไปยังปุ่มที่เปิด
- แก้โหมดโฟกัสให้เริ่มที่ปุ่มออกและคืน focus ไปยังปุ่มโฟกัสเมื่อปิด; การเปลี่ยนข้อย้าย focus ไปยัง region ของข้อใหม่เพื่อไม่ทิ้งผู้ใช้คีย์บอร์ดไว้ที่ปุ่มเดิม
- แก้ Escape ของกระดาษทดให้ทำงานก่อน Excalidraw รับเหตุการณ์ และจำกัด focus ใน panel เมื่อเป็น layout จอแคบ
- ทดสอบ mouse pointer drag จริงกับจับคู่และเรียงลำดับสำเร็จ; keyboard fallback ของจับคู่และปุ่มขึ้น/ลงของเรียงลำดับยังทำงาน
- เลือก `public/logo.png` ผ่าน file input ของ fixture local-only แล้วพบ preview ที่เปิดด้วยคีย์บอร์ดได้และปุ่มนำไฟล์ออก จากนั้นลบออกสำเร็จ โดยไม่มี upload/server write
- ปรับ preview รูปและปุ่มลบไฟล์ให้เข้าถึงด้วยคีย์บอร์ด พร้อมชื่อที่ screen reader อ่านได้
- fullscreen warning, navigator และ submit dialog ไม่ซ้อนให้ผู้สอบกดทะลุ; overlay ใช้ visible viewport, scroll ภายใน และ focus trap
- ปรับสีข้อความสถานะกับ `success-foreground` ให้ผ่าน contrast; axe WCAG A/AA เหลือเฉพาะลายน้ำโปร่งใสซึ่งเป็นของตกแต่งและถูก `aria-hidden`
- Next MCP รายงาน compilation/config/session errors ว่าง และ browser console ไม่มี runtime error
- `npm test` ผ่าน 96 files / 1,310 tests, `npx tsc --noEmit` ผ่าน, token lint ไม่ถอยหลัง และ production build สร้าง static pages 63 หน้า

## สิ่งที่ผู้ใช้จะตรวจภายหลัง

1. Safari บน Mac: ย่อ/ขยายหน้าต่าง, zoom 125/150/200% และใช้ Tab/Shift+Tab ให้ทั่วหน้า
2. พิมพ์ไทยและคณิตศาสตร์จริง ตรวจตำแหน่ง cursor กับแป้นคณิตศาสตร์
3. ลากจับคู่/เรียงลำดับด้วย mouse และ trackpad แล้วทดสอบปุ่ม keyboard fallback
4. เปิด/ยกเลิก/เลือกไฟล์รูปและ PDF ผ่าน native file picker ด้วยไฟล์สมมติ
5. เปิดเครื่องคิดเลข กระดาษทด โหมดโฟกัส ดูทุกข้อ และยืนยันส่ง ตรวจ Escape/scroll/focus return
6. ทดสอบ Safari ก่อนเพื่อแยก layout bug ออกจาก policy ของ SEB; เส้นทาง SEB จริงอยู่ในรายการรวมเฟส 6/8

## ขอบเขตที่ยังไม่พิสูจน์

- ห้องทดลองไม่พิสูจน์ login, autosave, reload/resume, upload, submit, RLS, ห้องคุมสอบ, CK/BEK หรือ quit link
- Safari ผ่านไม่แปลว่า SEB ผ่าน เพราะ SEB มี kiosk policy, URL filtering, JavaScript API และ config เพิ่ม
- ห้ามบันทึก password, CK, BEK, token, ticket หรือ URL ที่มี query ลับในเอกสาร/ภาพหลักฐาน
