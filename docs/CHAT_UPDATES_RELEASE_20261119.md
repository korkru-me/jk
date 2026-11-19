# งานในแชทสมัครนักเรียนและหน้าข้อสอบ — 19 พฤศจิกายน 2026

เจ้าของอนุมัติให้นำงานที่แก้ทั้งหมดในแชทขึ้นเว็บจริง หลังจากตรวจ Local แล้ว ชุดนี้ต่อจาก Production 27f2d8314bfd4e0842c704d9116b370e3f6f9149 ซึ่งมีการกรอกข้อมูลนักเรียนตั้งแต่สมัครและกรอบข้อมูลอีเมลก่อนข้อมูลนักเรียนแล้ว

## ขอบเขตที่ปล่อย

- นักเรียนสมัครด้วยอีเมล ส่วนการสมัครด้วย Google ใช้สำหรับครู รวมการตั้งค่าบัญชี Google ใหม่
- หน้ารอเฉพาะข้อสอบมีเวลานับถอยหลังวัน ชั่วโมง นาที วินาทีถึงเวลาเปิดสอบ แบบฝึกหัดเปิดเข้าทำโดยตรงและคลังฝึกเปิดรายการโจทย์ โดยตรวจสิทธิ์ รหัส และเวลาเปิดตามเดิม
- ชื่อแฟ้มย่อยเป็นข้อมูลจัดโจทย์ของครู หน้าทำงานและทบทวนของนักเรียนแสดงลำดับข้อโดยไม่มีชื่อแฟ้ม ตัวเลือกแสดงชื่อแฟ้มถูกนำออกจากหน้าสร้างและแก้ไข
- เวลาทำอยู่ใต้กำหนดวันทำในขั้นที่ 3 และในกรอบกำหนดวันทำของหน้าแก้ไข
- สลับห้องแล้วเปิดภาพรวมของห้องที่เลือก ฟอร์มที่ยังไม่บันทึกถามก่อนออกหรือเปลี่ยนห้อง และยกเลิกการออกเพื่อทำต่อได้
- คะแนนที่ยังรอตรวจแสดงสถานะรอตรวจสำหรับครูและนักเรียน ตรวจครบและส่งคะแนนจึงแสดงคะแนนจริง รวมถึงศูนย์ที่ตรวจแล้ว สูตร best/latest/average เดิมยังใช้ตามงานนั้น

## การเตรียมและตรวจ

ใช้ branch codex/chat-updates-release-20261119 จาก origin/master และคัดเฉพาะไฟล์กับ hunks ของแชทนี้จาก primary ที่มีงานอื่นค้างอยู่ ระบบสมัครนักเรียนใช้ migration 20261118075735 ซึ่งมีอยู่แล้วทั้ง Staging และ Production รอบนี้ไม่มี migration ใหม่

ก่อนส่ง Staging ผ่าน TypeScript, design-token lint และ 348 ชุด / 4,902 tests บน candidate การตรวจ hosted และผล deployment จะบันทึกหลังทำเสร็จ

Primary ที่ต้องตรวจหลังปล่อยคือ /Users/korkusonmasaen/Korkru/korkru บน localhost:3000 เก็บ snapshot digest ของไฟล์ก่อนปล่อยและคงค่าการเชื่อมต่อเฉพาะ Local

## Staging และการตรวจหน้าจอที่ผ่านแล้ว

เจ้าของอนุญาตให้ใช้ Chrome ที่ลงชื่อเข้า Vercel ไว้เพื่อเข้าผ่าน SSO ตามปกติ หลังจาก auto-review ปฏิเสธการอ่าน bypass token ไม่ได้ใช้ token หรือปิด protection

- PR #140 merge 8c13b0a8caac500579d016b9ed36d6dff1e50bd8; PR #142 merge 6c871e9265878e847ede20314acf103e91d72684; PR #143 merge 1a9d5b58bb337ebd5e9b3d42344525052301dbd8
- Staging สุดท้าย Vercel dpl_335RE7mDBPXVXsLqW22G3iKKRggX เป็น READY และ alias staging.korkru.com ตรงกับ commit 1a9d5b5
- ตรวจป้าย STAGING และใช้เฉพาะบัญชี/ข้อมูลสังเคราะห์ของรอบนี้ ไม่เขียนข้อมูล Production
- นักเรียนเห็นรอตรวจทั้งงานที่ seed และแบบฝึกหัดที่ตอบและส่งผ่าน UI จริง โดยไม่มีคะแนนรวม 0 หรือเปอร์เซ็นต์ก่อนตรวจ ครูเห็นรอตรวจในตาราง หน้าสรุปตรวจ รายคน และช่องคะแนนว่าง หลังครูกรอก 0 และยืนยันเผยแพร่ผ่าน UI ครูและนักเรียนจึงเห็น 0/10 จริง
- ข้อสอบอนาคตมีนับถอยหลังวัน/ชั่วโมง/นาที/วินาทีที่เปลี่ยนจริงและปุ่มเริ่มยังปิดอยู่ แบบฝึกหัดเข้าหน้าโจทย์โดยตรง คลังฝึกเข้ารายการโจทย์ปรนัยโดยตรง และปุ่มกลับไปห้องเรียนพาไปห้องต้นทาง ไม่มีหน้ารอหรือชื่อแฟ้มของครูในหน้าทำงาน
- แบบสร้างไม่มีตัวเลือกแสดงแฟ้ม เวลาทำอยู่ใต้กำหนดวันทำในขั้นที่ 3 สลับห้องมีคำเตือน ยกเลิกแล้วร่าง/ขั้น/ห้องเดิมยังอยู่ ยืนยันออกแล้วเปิดภาพรวมห้องปลายทางจริง
- สมัครนักเรียนแสดงอีเมลก่อนข้อมูลนักเรียน บังคับสี่ช่องการศึกษา ไม่ขอโรงเรียน และไม่มี Google เมื่อเลือกครูจึงมีปุ่มสมัคร Google ตรวจ UI โดยไม่สมัครบัญชีจริงหรือยอมรับข้อตกลงแทนผู้ใช้
- Hosted ตรวจ desktop; mobile และ fixture ตรวจใน primary Local แยกจากข้อมูลจริง ไม่ได้ทดสอบ OAuth Google กับบัญชีจริงหรือ SEB ในรอบนี้

## Validation และ primary

- Candidate หลังแก้หน้าตรวจคะแนนผ่าน TypeScript, token lint, 349 suites / 4,905 tests และ production build
- Patch ปุ่มคลังฝึกสุดท้ายผ่าน TypeScript, token lint, 3 suites / 29 tests และ production build ซ้ำแล้ว (เคยระบุชื่อ test component ที่ไม่มีไฟล์ จึงเปลี่ยนใช้ suites ที่มีจริง)
- Primary หลัง integrate หน้าตรวจคะแนนผ่าน TypeScript, token lint, 351 suites / 4,946 tests; คง unrelated work และ environment เดิม
- ปุ่มกลับคลังฝึก integrate เฉพาะ hunk ใน primary โดยรักษางาน disclosure คำชี้แจงที่มีอยู่เดิม ไม่คัดทั้งไฟล์ทับ
- Production PR #141 พร้อมปล่อยหลัง hosted validation ข้างต้น บันทึก commit/deployment และผล primary localhost:3000 หลังปล่อยด้านล่าง

## Production และ handoff เสร็จแล้ว

- Production PR #141 merge เข้า master เป็น 71bdee02eeec931be0728c85e706b10754c45eac และ push บน origin/master แล้ว
- Vercel dpl_9CFGGHZt3SXpZCKH6tyzNF6KEbQu เป็น READY, exact githubCommitSha 71bdee02eeec931be0728c85e706b10754c45eac, canonical aliases www.korkru.com และ korkru.com
- ตรวจเว็บจริงแบบอ่านอย่างเดียว: signup เลือกนักเรียนไม่มี Google มีข้อมูลการศึกษาครบและบัญชีอีเมลก่อนข้อมูลนักเรียน เลือกครูมี Google; assignments/new ที่ยังไม่ล็อกอินกลับ login ถูกต้อง ไม่สร้าง/แก้/ลบข้อมูล Production
- Primary process PID 26292 ให้บริการ /Users/korkusonmasaen/Korkru/korkru ที่ localhost:3000; HEAD 83245b7 ยังเดิมเพราะเป็น shared dirty checkout จึง integrate เฉพาะ scope โดยไม่ reset/pull/stash/stage งานอื่น
- เทียบทุก path ใน scope กับ release แล้วตรงกัน ยกเว้น lib/actions/submissions.ts ซึ่งรักษางานส่งไฟล์และ copy เพิ่มเติมเดิม และ components/practice/practice-library-view.tsx ซึ่งรักษา disclosure คำชี้แจงเดิม แต่ hunk ปุ่มกลับห้องตรงกับ release ทั้งสองไฟล์
- ตรวจ primary หลัง Production READY: signup email-first/สี่ช่อง/no school/no Google นักเรียน, นับถอยหลัง desktop/mobile เดินจริงและเมื่อถึงเวลาเปิดปุ่มใช้ได้โดยยังไม่เริ่มรอบอัตโนมัติ, ตารางรอตรวจเทียบศูนย์จริงและบัตรงานนักเรียน, หน้าสรุป/รายคน pending กับช่องคะแนนว่าง, wizard ไม่มีตัวเลือกแฟ้มและเวลาทำอยู่ในขั้น 3 ใต้กำหนดวันทำ ไม่เรียกฐานข้อมูลจริงบน Local
- primary หลัง patch สุดท้าย TypeScript, token lint และ 29 targeted tests ผ่าน; full suite ก่อน patch ปุ่มกลับ 351 suites / 4,946 tests ผ่าน Next.js MCP get_compilation_issues = [] และ get_errors configErrors/sessionErrors = []
- หลักฐานภาพเก็บใน private temporary directory ไม่รวมข้อมูลจริง: Production signup, Staging countdown/teacher matrix/switch overview/signup, primary countdown desktop/mobile และ student pending mobile
- เก็บกวาดบัญชี/ห้อง/งาน/คำตอบ/โจทย์/ชุดโจทย์/คลังฝึก/องค์กรสังเคราะห์ครบแล้ว ยืนยันทุกกลุ่ม 0 แถวและ Auth 0 บัญชีในโครงการ Staging เท่านั้น (run 0242809c-7a64-4cc6-ac6b-af93f68b740b) การ DELETE คลังฝึกโดยตรงไม่มีสิทธิ์และ connector SQL confirmation หมดอายุ จึงใช้ cleanup ของห้องสังเคราะห์ที่ lifecycle รองรับ cascade อยู่แล้ว โดยไม่เปลี่ยน grants/RLS/triggers
- รอบนี้ไม่มี migration ใหม่หรือค้างต้อง apply ไม่ได้ทดสอบ Google OAuth กับบัญชีจริง, SEB/Android จริง หรือโทรศัพท์จริง; integration ที่มีการเขียนทั้งหมดทดสอบเฉพาะ Staging

บันทึกผลหลังปล่อยนี้เป็น docs-only handoff บน branch codex/chat-updates-release-20261119 ที่ push แล้ว ไม่เปลี่ยน application source ของ Production 71bdee02
