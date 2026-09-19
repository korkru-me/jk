# Exam release UAT — งานที่เจ้าของผลิตภัณฑ์ต้องทดสอบ

อัปเดต: 20 กันยายน 2026

เฟส agent-only 1–9 จบแล้ว แต่ **ยังไม่พร้อมเปิดขายระบบสอบ** จนกว่ารายการด้านล่างจะผ่านบน staging และอุปกรณ์จริง ตัวตรวจ `npm run check:exam-release` จงใจขึ้น `NOT READY` ระหว่างที่หลักฐานเหล่านี้ยังไม่ครบ

ผล responsive/authenticated/recovery/cleanup บันทึกสถานะใน `config/exam-uat-evidence.json` ตาม `docs/EXAM_UAT_EVIDENCE.md`; ผล native SEB บันทึกแยกใน `config/seb-platform-evidence.json` ห้ามเก็บข้อมูลลับหรือข้อมูลนักเรียนในทั้งสองไฟล์

หากจำไม่ได้ว่าต้องทำอะไรต่อ ให้รัน `npm run next:exam-uat` ระบบจะบอกทีละหนึ่งขั้นตามลำดับใน `docs/EXAM_UAT_NEXT_STEP.md`

หลัง staging พร้อม ต้องล็อก code revision, staging build และ SEB config ตาม `docs/EXAM_RELEASE_CANDIDATE.md` ให้ `npm run check:exam-candidate` ผ่านก่อนเริ่มเก็บผล UAT

## 1. สร้าง staging แยกก่อน

- อ่าน inventory และ blocker ใน `docs/STAGING_PHASE_2A_AUDIT.md`; ห้าม `supabase db push` ไป fresh project จนกว่า bootstrap guard เฟส 2B จะเสร็จ
- ใช้ Vercel Preview/โดเมน HTTPS ที่ไม่ใช่ production
- ใช้ Supabase project ใหม่ที่ไม่ใช่ production
- สร้างเฉพาะบัญชีครู/นักเรียนและข้อสอบจำลอง ห้ามคัดลอกข้อมูลนักเรียนจริง
- ตั้งค่าตาม `.env.qa.example` แล้วรัน `npm run check:exam-staging` ให้ผ่านก่อนเริ่ม

## 2. ตรวจหน้าจอจริง

เปิด `/exam-screen-lab` และทดสอบ fixture ทั้ง 16 แบบตาม `docs/EXAM_SCREEN_QA.md`:

- iPhone: แนวตั้ง/แนวนอน, notch/safe area, คีย์บอร์ดไทย, Files/Camera, แตะ/ลาก และหมุนจอ
- iPad: แนวตั้ง/แนวนอน, split/floating keyboard, Files/Camera, touch/long-press และ Apple Pencil ถ้ามี
- Mac: Safari, zoom, fullscreen, file picker, mouse/trackpad และ SEB
- Windows: Edge/Chrome และ SEB ด้วยเมาส์/คีย์บอร์ด

ยืนยันว่าไม่มีแนวนอนล้น, ปุ่มสำคัญไม่ถูกคีย์บอร์ดบัง, dialog โฟกัสถูกจุด, Escape/ปุ่มย้อนกลับไม่ทำคำตอบหาย และโจทย์แบบจับคู่/เรียงลำดับ/คณิต/ไฟล์ใช้ได้จริง

## 3. ทดสอบเส้นทางข้อสอบจริงบน staging

ใช้สองบัญชีและสองเครื่อง:

1. ครูสร้างข้อสอบจำลอง เปิด timer, autosave, งานบังคับรูป/ไฟล์ และหน้าคุมสอบ
2. นักเรียนเริ่ม ทำต่อหลัง reload แล้วส่งข้อสอบ
3. ครูเห็นสถานะกำลังทำ/ส่งแล้ว คะแนน และ event ของคนถูกต้อง
4. ตรวจ retry/attempt limit, access control และการที่อีกบัญชีเปิด submission ของคนอื่นไม่ได้
5. ลบข้อมูล QA เมื่อจบ โดยตรวจว่าไม่มีไฟล์หรือ attempt จำลองค้าง

## 4. ซ้อม recovery และห้องคุมสอบ

ทำทั้ง Wi‑Fi หลุด/กลับมา, pending sync, reload/resume, เวลาหมด, upload ล้มเหลว, Realtime fallback/reconnect, หลายหน้าต่าง และครูรับทราบ event ตามขั้นตอนใน `docs/EXAM_RECOVERY_QA.md`

## 5. ผ่าน SEB ด้วย production config เดียวกันทุกระบบ

สำหรับ macOS, iPadOS, iOS และ Windows ทำกับ build/config ที่จะเปิดขายจริง:

- ลงทะเบียน/ตรวจ production BEK โดยไม่ commit หรือส่ง key ในแชต
- เปิดข้อสอบจำลองบน staging, ตรวจ CK+BEK, ส่งข้อสอบจริงของบัญชี QA และออกหลังส่งได้
- ครูอนุญาตให้ออกกลางคันแล้วนักเรียนออกได้
- รหัสออกของครูใช้ได้เฉพาะชุดที่ตั้งไว้
- เปิดผิดชุด/ไฟล์ถูกแก้แล้วถูกปฏิเสธ
- บันทึก OS/SEB version และผลแบบไม่ระบุตัวบุคคลใน `config/seb-platform-evidence.json`

## 6. เกณฑ์ปิดงาน

- `npm test`, `npx tsc --noEmit`, `npm run lint:tokens` และ `npm run build` ผ่านจาก commit เดียวกัน
- `npm run check:exam-staging` ผ่าน
- `npm run check:exam-candidate` ผ่าน
- `npm run check:exam-uat` ผ่าน
- `npm run check:seb-platforms` ผ่าน
- `npm run check:exam-release` ผ่าน
- ไม่มี password, CK/BEK, token, request hash, ชื่อนักเรียน, คำตอบ หรือภาพข้อมูลจริงใน commit/log/เอกสาร
- ความผิดปกติทุกข้อมีเลข issue หรือแก้และทดสอบซ้ำแล้ว ห้ามใช้คำว่า “ผ่าน” หากข้ามอุปกรณ์หรือขั้นตอน

หลังครบทั้งหมดจึงค่อยอนุมัติ deployment production และประกาศอุปกรณ์ที่รองรับ
