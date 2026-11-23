# งานกลุ่มในหน้าสร้างแบบฝึกหัด — 23 พฤศจิกายน 2569

## พฤติกรรม

- หน้าสร้างแบบฝึกหัดเริ่มเป็นงานเดี่ยว เลือกงานกลุ่มแล้วกำหนดจำนวนสมาชิกขั้นต่ำ–สูงสุด นับผู้ส่งด้วย ใช้ตัวเลือกโจทย์จากคลังเดิม
- ตัวแทนตอบและส่งหนึ่งครั้ง เลือกชื่อเพื่อนในห้องเดียวกัน ระบบตรวจจำนวนคน ผู้ได้รับมอบหมาย ชื่อซ้ำ ต่างห้อง และการส่งซ้ำข้ามกลุ่ม
- ใช้คำตอบชุดเดียวและคะแนนต้นทางเดียว สมาชิกมี score receipts ที่ sync เมื่อระบบตรวจ ครูตรวจ/แก้คะแนน ปรับคะแนนส่งช้า หรือโมฆะข้อ
- ครูเปิดผลจากชื่อสมาชิกคนใดก็ตรวจคำตอบต้นทางได้ โดยต้องมีสิทธิ์จัดการงานนั้น Admin เจ้าของห้องและผู้ช่วยสอน admin/manage ใช้ความสามารถครูได้ตามขอบเขตเดิม
- สมาชิกอ่านคำตอบและ preview วิธีทำตามเวลาแสดงผล เฉลยใช้ release gate เดิมและลายน้ำของผู้เปิดจริง ไม่ขยายสิทธิ์แก้คำตอบหรือ standalone artifact policies

## Schema และขอบเขตที่อนุญาต

ใช้เฉพาะสอง migration ใหม่ของงานกลุ่ม:

1. `20261122232814_exercise_group_submission.sql`
2. `20261123013055_exercise_group_receipt_org.sql`

ทั้งสองสร้างด้วย Supabase CLI และ commit พร้อมโค้ดที่พึ่งพา Staging ลงแล้วจาก 168 เป็น 170 versions โดยไม่ repair/replay migration เก่า Production มี 155 versions และ 12 รายการ SEB ที่รอตามเดิม ใช้โฟลเดอร์ชั่วคราว fetch ประวัติจริงแล้วคัดลอกเฉพาะสองรายการใหม่ Dry run Production แสดงเฉพาะสองรายการนี้ ไม่รวม SEB

`exercise_group_members` เปิด RLS และไม่มี browser grants การจองกลุ่มและ freeze ใช้ service-only RPC หลังตรวจ session/เจ้าของ attempt และตรวจกลุ่มใน transaction เดียว การเป็น Admin ยังต้องผ่านสิทธิ์ห้องหรืองาน ไม่ได้สิทธิ์ข้าม tenant อัตโนมัติ การแก้ role guard ของ SEB แตะเฉพาะ RPC ที่ติดตั้งอยู่แล้ว ไม่ติดตั้งหรือแก้ไฟล์ 12 migrations ที่รอ

## หลักฐาน Staging

Canonical https://staging.korkru.com มีป้าย STAGING และทดสอบผ่าน Chrome ที่เข้าได้ตามสิทธิ์ปกติ ไม่อ่านหรือเปลี่ยน deployment protection รุ่นแอปที่ตรวจล่าสุดคือ merge `900ae6f8231ebe8ed741e0b090fb33d3cdf770ee` (PR #151–154) ชุด Production candidate อยู่ PR #150

- แอดมินจำลองสร้างงานผ่านหน้าสร้างแบบฝึกหัดจริง งานกลุ่ม 3–5 คน เลือกโจทย์คลังสองข้อ รวม 20 คะแนน ค่าที่เก็บตรงกับหน้า review
- ตัวแทนตอบอัตนัยและบรรยาย เลือกเพื่อนสองคนแล้วส่งจริง หน้าเลือกสมาชิกนับตัวแทน ปิดปุ่มเมื่อรวมมีสองคน และเลือกถึงห้าคนได้
- Hosted RPC ปฏิเสธกลุ่มน้อย/มากเกิน ชื่อซ้ำ และต่างห้อง โดยไม่ทิ้ง membership ค้าง นักเรียนเรียก privileged RPC โดยตรงไม่ได้
- ครูผู้ช่วยสอนตรวจบรรยาย 8/10 ผ่านหน้าจริง รวมอัตโนมัติ 10/10 เป็น **18/20** ของทั้งสามบัญชี เปิดผลผ่านตัวแทนและสมาชิกแต่ละบัญชีใน Chrome แล้วตรงกัน
- ครูเปิด receipt ของสมาชิก เห็นคำตอบร่วมทั้งสองข้อ แก้ 8 เป็น 9 แล้วตรวจฐานข้อมูลพบ **19/20 ครบสามคน** จากนั้นคืนเป็น 8 ผล **18/20** ตรวจจากแต่ละ authenticated Supabase client อีกครั้ง
- งานกลุ่มจำลองแยกอีกงานมีรูปวิธีทำส่วนตัวและเฉลย สมาชิกเปิดรูปได้จริง (naturalWidth 120) และเปิดเฉลยผ่าน Server Action ได้
- Fixture รูปมีคะแนนอัตโนมัติ 10/10 ทั้งสามคนและยัง submitted เพราะวิธีทำรอจัดสรร/ตรวจตามระบบเดิม Assertion แรกคาด graded เข้มเกินไป แก้ให้เทียบสถานะร่วมกับต้นทางแล้วตรวจหลักฐาน snapshot ก่อน cleanup ไม่ย้อนเปิดหรือแก้หลักฐานที่ส่งแล้ว
- นักเรียนห้องเดียวกันที่ไม่ใช่สมาชิกเปิด URL ผลกลุ่มแล้วได้ 404 และ direct answer read เป็นว่าง นักเรียนต่างห้องอ่านคำตอบไม่ได้ด้วย
- แอดมินเข้าหน้า group-work เดิมได้ งานเดี่ยวที่สร้างใหม่เริ่ม solo ไม่ต้องเลือกสมาชิก ส่งจริงแล้วได้ 10/10 หนึ่ง receipt ไม่มี source กลุ่ม

พบและแก้ระหว่าง UAT: receipt เพื่อนไม่มี org_id (เพิ่ม migration ตัวแก้ ไม่แก้ migration ที่ลงแล้ว), หน้าครูเปิดสมาชิกแล้วไม่มีคำตอบ, และการเปิดเฉลย/preview วิธีทำของสมาชิก มี regression กั้นการอ้างต้นทางข้ามงานและคนนอกกลุ่ม

บัญชีจำลองแปดบัญชี สองห้อง สามงาน สองโจทย์ และรูปส่วนตัวถูกล้างแล้ว ตรวจ provenance ก่อนลบ ยกเลิก sessions และตรวจ users/organizations/classrooms/questions/assignments ไม่เหลือรายการของ run นี้ ไม่ใช้ข้อมูลจริงและไม่สร้างข้อมูลทดสอบบน Production

## Checks และส่วนที่ต้องทำต่อ

Production candidate ผ่าน TypeScript, design-token lint, Webpack production build และ Vitest **354 suites / 4,948 tests** รุ่น Staging มี tests เฉพาะ Stage เพิ่ม จำนวนรวมจึงต่างกัน ตัวแก้ fixture ภายหลังไม่เปลี่ยน application code

Local Chrome ตรวจค่าเริ่มต้น solo ช่วงสมาชิกผิด เลือกโจทย์และ payload กลุ่ม หน้าส่งที่ 390px ไม่มีล้น Next.js MCP ไม่พบ config/session errors Preview แยกพอร์ต 3094 ส่วน primary localhost:3000 เคยคืนเฉพาะ patch นี้เพื่อรอ schema ต้อง sync รุ่นที่ปล่อยและตรวจ primary จริงหลัง Production ตามกฎ release

## Production release และ primary local parity

ปล่อยผ่าน PR #150 แล้ว Application release commit `2248e556204a974629d11dbd709ab88a32bb43cd` และ deployment `dpl_52h9MthQLrnrbBXgTHu1oncv4Py2` อยู่สถานะ Ready ผูกทั้ง https://www.korkru.com และ https://korkru.com ตรวจด้วย Vercel deployment metadata และเปิดหน้าสร้างแบบฝึกหัดจริงแบบอ่านอย่างเดียว ครูใน Chrome เห็นตัวเลือกและช่วงสมาชิก บัญชี Admin เดิมของเจ้าของใน IAB เห็นห้องของตน ค่าเริ่มต้น solo และเปิด group 3–5 ได้ ไม่สร้างหรือส่งข้อมูลทดสอบบน Production

Production มี 157 migration versions หลังเพิ่มสองรายการของงานนี้ รายการ SEB ที่รอทั้ง 12 versions ตรงกับก่อนปล่อยทุกตัวและยังไม่ถูกลง ไม่มีการแก้ไฟล์ migration เก่าหรือ repair history ตรวจ RLS เปิด ไม่มี browser table grant/privileged close RPC grant และ trigger คัดลอก org_id แล้ว Advisory ของตารางสมาชิกมีเพียง INFO ว่าไม่มี browser policy ซึ่งตั้งใจให้ service-only

Primary checkout `/Users/korkusonmasaen/Korkru/korkru` branch `codex/student-classroom-cards` (HEAD เดิม `83245b7`) ให้บริการ `127.0.0.1:3000` ซิงก์เฉพาะ scope ของ release และเก็บงานค้างเดิม ไม่แตะ index ของ primary รวม conflict ข้อความงานอัปโหลดไฟล์โดยเก็บถ้อยคำ local และเพิ่มเฉพาะเงื่อนไขกลุ่ม เอกสารเพิ่มเฉพาะ section ของงานนี้ ตรวจ 176 modified tracked files นอก scope แล้ว hash เหมือนเดิม

Primary ผ่าน TypeScript, token lint, production build แยก output และ 354 suites / 4,982 tests (มี tests ของ local เพิ่มจาก candidate) คืน tsconfig เดิมแบบ byte-for-byte หลัง build ไม่ลบหรือย้าย .next ที่ dev ใช้อยู่ ตรวจ UI จริงบน port 3000: solo เป็นค่าเริ่มต้น, group เปิด min/max 3–5, mobile 390px ไม่มี overflow, เลือกเพื่อนสองคนรวมเป็นสามคนและยืนยันได้, เมื่อครบห้าคนปิด checkbox คนอื่น React inspect ยืนยัน ExamClient รับ groupWork; Next.js MCP compilation issues, config errors และ session errors เป็นว่าง

ไฟล์ภาพตรวจ local อยู่ /private/tmp/group-exercise-primary-final-create-desktop.png, /private/tmp/group-exercise-primary-final-create-mobile.png และ /private/tmp/group-exercise-primary-final-members-mobile.png ข้อมูลทั้งหมดเป็น fixture ไม่ใช่งานส่งจริง ปิด browser ทดสอบที่สร้างเองแล้ว ลบไฟล์คีย์ Staging ชั่วคราวหลังตรวจ cleanup ครบ เปิดหน้าแบบฝึกหัด Production ในบัญชี Admin ให้เจ้าของไว้

ขอบเขต UAT รอบนี้: bank written/essay, คะแนนอัตโนมัติและครูตรวจ/แก้, สมาชิกสามบัญชี, ภาพวิธีทำส่วนตัว, เฉลย, isolation และ solo regression ไม่สร้างข้อมูลทดสอบ Production และไม่ใช่ UAT บนมือถือจริง

