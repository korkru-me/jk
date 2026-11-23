# งานไฟล์กลุ่มและปุ่มมอบหมายงาน — release 23 พฤศจิกายน 2026

เจ้าของอนุมัติให้ทดสอบ Staging แล้วขึ้น Production เมื่อผ่าน โดยไม่แตะ migration SEB ที่รอ 12 รายการ ขอบเขตโค้ดคือ local commit 73c1e57 และ dependencies ของคำตอบงานไฟล์แบบข้อความ/ลิงก์/PDF/รูป ไม่มีการแก้ schema หรือ migration

## Staging ผ่าน

PR #158 รวมเข้าสู่ staging commit 7975a2db218d31957914617a496468541d45ef1b; Vercel deployment dpl_5JkHRU9TM7rs5kkwgU2WVRxphjHu Ready ตรวจป้าย STAGING · ระบบทดสอบที่ https://staging.korkru.com ก่อนใช้งาน บัญชีทั้งหมดเป็นข้อมูลจำลองของ run 5ee50d00 ใน Supabase dyuxkrzeveknqgtuzpbh: admin, teacher manager และนักเรียน 6 คน แยกสองห้อง ไม่ใช้ข้อมูลจริง

- Admin สร้างงานกลุ่ม 3–5 คนได้ ครูผู้ช่วยสอนเปิดทั้ง solo/group และมอบหมายงานเดี่ยวได้ ค่าเริ่มต้น solo ค่าขอบเขตผิดถูกปฏิเสธ
- งานเดี่ยวส่งข้อความอย่างเดียว ถอนส่งก่อนตรวจ และส่งใหม่ด้วยลิงก์อย่างเดียวได้ ลิงก์ javascript ถูกปฏิเสธ
- กลุ่มจากโจทย์ในคลัง: ตัวแทนตอบและเลือกเพื่อนสองคน สมาชิกทั้งสามมี 10/10 เหมือนกัน เปิดผลจากบัญชีตัวแทนและสมาชิกทั้งสองจริง
- งานไฟล์กลุ่มข้อความ+ลิงก์: สมาชิกคนหนึ่งมี draft อยู่ก่อน ตัวแทนส่งแล้ว reuse receipt นั้น ครูให้ 8/10 หนึ่งครั้ง ช่องคะแนนทั้งสามเปลี่ยนพร้อมกันและบันทึกเพียงหนึ่ง canonical answer สมาชิกทั้งสองเปิดหน้าตนเองเห็นคำตอบต้นทางกับ 8/10 ไม่เห็น draft เก่าของตน
- ตรวจ server/RPC ด้วยกลุ่มน้อยเกิน มากเกิน สมาชิกซ้ำ และต่างห้อง: ถูกปฏิเสธและไม่ทิ้ง reservation นักเรียนเรียก privileged close RPC ตรงไม่ได้
- ทดสอบ PDF/PNG จริงผ่าน signed Staging targets ตรวจ bytes ที่ดาวน์โหลดกลับตรงต้นฉบับ แล้วใช้ saved-file fixture ตรวจ compatibility ของคำตอบ array เดิม หน้าเว็บเพิ่มข้อความ/ลิงก์และส่งเป็น versioned response ได้ ตัวแสดง PDF เป็น iframe/blob และรูปโหลดครบ 180×90
- หลังเจ้าของเปิดสิทธิ์ file URLs ให้ส่วนขยายชั่วคราว สร้างอีกงานแยกและเลือก PDF/PNG จากเครื่องผ่าน Chrome file chooser จริง อัปโหลดผ่าน Server Actions ปกติ ปุ่มส่ง/นำไฟล์ออกถูก disabled ขณะ upload จากนั้นส่ง PDF+PNG+ข้อความ+ลิงก์ผ่าน UI และตรวจคะแนนกลุ่มอีกครั้ง ได้ 8/10 ทั้งสามบัญชี กรณีนี้ไม่ได้ seed คำตอบหรือไฟล์ผ่าน admin fixture
- อ่านผลจาก client ของสมาชิกแต่ละคนอย่างอิสระ ยืนยันหนึ่ง canonical answer, สองไฟล์และคะแนน 8/10 ของแต่ละ receipt นักเรียนไม่เข้ากลุ่มและนักเรียนต่างห้องอ่าน submission_answers ของกลุ่มไม่ได้ผ่าน RLS

## ตรวจโค้ดและความปลอดภัยของ release

Local scope ผ่าน 354 suites / 4,981 tests, TypeScript, token lint และ Chrome desktop/mobile ใน turn ก่อนหน้า Staging scope ผ่าน 356 suites / 5,003 tests, TypeScript และ token lint รอบนี้ Production candidate build จากฐาน origin/master 83a358b ผ่านด้วย output แยก .next-group-file-release-build และค่าทดสอบ ไม่ใช้คีย์ Production และไม่รบกวน primary dev cache

Staging migration history 170 versions และ Production 157 versions เท่าเดิมก่อน/หลัง UAT ชุด migration ใน Git ไม่เปลี่ยนแม้แต่ไฟล์เดียว Production ยังขาด 12 local versions เดิม ไม่ใช้ db push, repair, apply_migration หรือ SQL DDL ใด ๆ

เครื่องมือปฏิเสธการนำ Vercel session เก่าจากงานอื่นมาใช้ จึงไม่ได้ทำ ใช้ Chrome ที่เข้าถึง Staging ได้ตามปกติแทน ไม่ลด Deployment Protection การเปิดหน้าสิทธิ์ส่วนขยายถูก browser policy บล็อก เจ้าของเป็นผู้เปิดสิทธิ์เองตามคำขอ หลังทดสอบเจ้าของยืนยันปิดคืนแล้ว

## Production และส่งต่อ

Release branch codex/group-file-ui-release-20261123 แยกจาก master และนำเฉพาะ commit งานนี้มา ไม่ merge ทั้ง staging จึงไม่พางานอื่นหรือ 12 migration SEB ไปด้วย PR #159 รวมเป็น Production app commit 5f765f04720151fbedfffaaed118c1932b5d4dd7; deployment dpl_3BHC9v9oVPN1bkw9GCKFvKue2ffS Ready และ alias https://www.korkru.com กับ https://korkru.com ชี้เวอร์ชันนี้แล้ว

เปิดหน้าสร้างงานไฟล์และแบบฝึกหัดจริงใน Chrome ด้วยบัญชี Admin เดิมของเจ้าของ ตรวจ default solo และเปิด group 3–5 ได้ ไม่กดมอบหมาย/บันทึกและไม่สร้างข้อมูลทดสอบ Production เก็บสองฟอร์มไว้ให้เจ้าของใช้ต่อ

Primary process 33781 ให้บริการ 127.0.0.1:3000 จาก /Users/korkusonmasaen/Korkru/korkru ยังเป็น shared dirty branch codex/student-classroom-cards โค้ดฟอร์มและ dependencies ที่ปล่อยตรงกับ release อยู่แล้ว ตรวจหลัง Ready ผ่านทั้งแบบฝึกหัดและงานไฟล์ด้วย fixture บนพอร์ต 3000 จริง จอ 390px ไม่ล้นแนวนอน คืน viewport แล้ว เก็บ snapshot ของ 213 modified tracked files ก่อน sync เพื่อไม่ทับงานอื่น ผล Next compilation issues=[] และ runtime errors=[]

ล้าง fixture identities/sessions ทั้ง 8 บัญชี, 8 workspaces, 2 ห้อง, 5 assignments, private prompts/โจทย์ และ Storage objects ครบ ตรวจ rows ทุกตารางที่ระบุเป็นศูนย์ และตรวจ storage.objects เฉพาะ namespace ของบัญชีรอบนี้เหลือ 0 ไฟล์ ไม่ล้างข้อมูลนอก run นี้ ปิด browser ทดสอบที่สร้างเองแล้วและลบไฟล์คีย์/สถานะล็อกอินชั่วคราวครบแล้ว เจ้าของเป็นผู้เปิดและปิดคืนสิทธิ์ file URLs เพราะ Chrome policy ไม่ให้เครื่องมือควบคุมหน้านั้น

งานกลุ่มยังไม่เปิดถอนส่งหลังส่งแล้ว เพราะการเปิดเพียง receipt เดียวทำให้สถานะทั้งกลุ่มแยกกัน ต้องมี whole-group atomic reopen ก่อนจึงเปิดความสามารถนี้ได้ งานเดี่ยวคงเงื่อนไขเดิม
