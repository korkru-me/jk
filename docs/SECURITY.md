# Security และ privacy guardrails

อัปเดตล่าสุด: 3 กันยายน 2026

KorKru จัดการข้อมูลนักเรียนและอาจเกี่ยวข้องกับผู้เยาว์ ความปลอดภัยและความเป็นส่วนตัวเป็นเงื่อนไขของความถูกต้อง ไม่ใช่งานเก็บรายละเอียดภายหลัง

## ข้อมูลที่ต้องปกป้อง

- Identity: ชื่อ อีเมล รูปโปรไฟล์ รหัสนักเรียน
- Education records: ห้องเรียน งาน คำตอบ คะแนน feedback และประวัติ attempt
- Contact/family: ที่อยู่ เบอร์โทร ผู้ปกครอง และข้อมูลครอบครัว
- Health/wellbeing: แพ้อาหาร โรคประจำตัว ความเครียด พฤติกรรม และบันทึกครู
- Credentials/secrets: session, invite/access codes, anon/service keys และ OAuth data

ห้ามบันทึกข้อมูลเหล่านี้ใน console/log/analytics โดยไม่จำเป็น ห้ามใช้ข้อมูลจริงใน fixture, screenshot หรือ prompt ภายนอกโดยไม่ได้รับอนุญาต

## Authorization model

- Browser UI ไม่ใช่ security boundary
- ทุก mutation ต้องยืนยัน session และสิทธิ์ต่อ resource ฝั่ง server
- RLS ต้องป้องกัน direct API access แม้ client ถูกดัดแปลง
- `org_id`, classroom membership, ownership และ co-teacher permission ต้องตรวจตาม action
- การดูข้อมูลนักเรียนต้องจำกัดตามวัตถุประสงค์ ไม่ใช่เพียงอยู่ organization เดียวกัน
- แยก system admin, organization admin, classroom admin และ super admin ให้ชัด

## Authentication และ account recovery

- ตรวจ email, password, display name และ `teacher|student` ซ้ำฝั่ง server ทุกครั้ง ห้ามเชื่อ role จากปุ่มหรือ TypeScript type ใน browser
- Google OAuth ที่ยังไม่มี `survey_role` ต้องจบ profile completion ก่อนเข้า protected app; การกำหนด role ครั้งแรกต้องตรวจ exact session และ update เฉพาะ profile เดียวที่ `survey_role IS NULL`
- Magic link จากหน้า login ต้องตั้ง `shouldCreateUser: false` และตอบแบบไม่เปิดเผยว่าอีเมลใดมีบัญชี
- password recovery ต้องแลก code เป็น session ที่ callback ก่อนเรียก `updateUser`; หลังเปลี่ยน credential ให้ global sign-out เพื่อตัด refresh token เดิม
- การสร้าง auth user ต้องสร้าง profile และ personal organization ใน transaction เดียว ฟังก์ชันซ่อม provisioning ต้องล็อกต่อ user และ idempotent เพื่อไม่สร้าง workspace ซ้ำเมื่อ callback ชนกัน

## Supabase admin client

`createAdminClient()` ข้าม RLS และเป็นจุดเสี่ยงสูง:

- ใช้ได้เฉพาะ server-only code
- ห้ามส่ง service role key หรือ admin client ไป browser
- ตรวจผู้ใช้ด้วย session ก่อน แล้วตรวจ ownership/membership/permission อย่างชัดเจน
- จำกัด query ด้วย resource ID และ tenant ที่ตรวจแล้ว
- อย่าใช้ admin client เพียงเพื่อทำให้ query ที่ติด RLS “ผ่าน”

## RLS และ multi-tenancy

- ห้าม disable RLS หรือเพิ่ม policy แบบกว้างเพื่อแก้ปัญหาชั่วคราว
- ทดสอบ positive และ negative cases ด้วยผู้ใช้คนละ organization
- ตรวจ recursion/SQL helper ด้วย `SECURITY DEFINER`, fixed `search_path` และสิทธิ์ execute ที่เหมาะสม
- field ที่ใช้ใน RLS บ่อยต้องมี index ที่เหมาะสม
- การแชร์ต้องเป็น explicit relation/visibility ไม่แก้ ownership boundary

## Migrations

- ตรวจสถานะ migration ของฐานข้อมูลจริงก่อนเขียน
- ห้ามแก้ migration ที่ apply แล้วเพื่อเปลี่ยน production
- migration ที่แตะ policy/role/function ต้องผ่าน review เป็นพิเศษ
- รักษา backward compatibility ระหว่างช่วง deploy code และ schema
- อย่าใส่ secret หรือข้อมูลผู้ใช้จริงใน SQL

## Grading integrity

- random values และ correct answer ต้องตรึงต่อ attempt
- server ต้องบังคับเวลา attempts และ access code ไม่พึ่ง client
- การแก้คะแนนต้องตรวจสิทธิ์ เก็บผู้แก้ และเวลา
- score rescaling และ attempt strategy ต้องให้ผลเหมือนกันทุกหน้าที่อ่านคะแนน
- ห้ามให้นักเรียนอ่านเฉลยก่อนนโยบาย `show_results` อนุญาต

### Exam-taking data boundary

- `questions`, `assignments` และ `submission_answers` มี secret/answer-bearing columns จึงห้ามส่ง `select('*')` จากแถวเหล่านี้เข้า Client Component ของนักเรียน
- ระหว่างทำข้อสอบ browser รับเฉพาะ DTO จาก `lib/exam-safe.ts`; ต้องเพิ่ม field ใหม่ด้วย allowlist และ regression test ไม่ใช้ object spread จาก database row
- student RLS ห้ามอ่าน question-bank row และ assignment row เต็ม; `assignments.access_code` ต้องอยู่ฝั่ง server เท่านั้น
- นักเรียนอ่าน answer snapshot/เฉลยได้หลังส่งเมื่อ `show_results` เป็น `immediate` หรือ `after_due` ที่พ้นกำหนดแล้วเท่านั้น; `score_only` ห้ามอ่านคำตอบรายข้อและ `never` ห้ามอ่านคะแนนด้วย
- การบันทึกคำตอบ รูปวิธีทำ ไฟล์ การส่ง และการแก้คะแนนผ่าน server boundary หลังตรวจ session + exact owner/teacher + attempt status + deadline; browser role ไม่มีสิทธิ์เขียน `submissions`/`submission_answers` โดยตรง
- `users_update_own` ใช้สำหรับโปรไฟล์เท่านั้น ต้องมี trigger ป้องกัน self-update ของ authority fields (`role`, `status`)
- Fullscreen, tab visibility, copy/paste และ screenshot deterrence เป็นเพียงสัญญาณ/แรงเสียดทาน ไม่ใช่ security boundary และห้ามใช้แทนการปกป้องเฉลยฝั่ง server
- ลายน้ำข้อสอบแสดงเฉพาะชื่อเจ้าของ attempt, UUID ส่วนสั้น และเวลาปัจจุบันเพื่อให้ภาพที่ส่งต่อระบุที่มาได้ง่ายขึ้น ไม่ใช่การป้องกัน screenshot; ห้ามใส่อีเมล เบอร์โทร ข้อมูลอ่อนไหว หรือ answer content ลงในลายน้ำ
- ข้อมูลคุมสอบต้องเก็บเท่าที่จำเป็น: ชนิด browser event, เวลา, presence/counter, foreign keys และ UUID สุ่มต่อแท็บสำหรับ heartbeat lease เท่านั้น ห้ามเพิ่ม IP, user-agent, device fingerprint, ภาพหน้าจอ กล้อง ไมโครโฟน เนื้อหาคำตอบ หรือ keystroke โดยไม่มีการออกแบบวัตถุประสงค์ consent retention และสิทธิ์ใหม่
- ข้อมูลคุมสอบระดับ attempt ลบอัตโนมัติหลังไม่มี heartbeat 90 วันด้วย job รายวัน; การล้างก่อนกำหนดต้องตรวจ owner/co-teacher `admin/manage`/super admin ซ้ำใน service-role-only RPC, ปฏิเสธเมื่อยังมี session สด และห้ามลบ submission, คำตอบ หรือคะแนนร่วมไปด้วย
- เหตุการณ์เปิดหลายหน้าจอต้องคำนวณฝั่งฐานข้อมูลจาก lease ที่ยังสด ไม่เชื่อ counter/event จาก client และเป็นเพียงสัญญาณให้ครูพิจารณา การ reload ปกติต้องนำ id เดิมกลับมาใช้เพื่อลด false positive
- นักเรียนห้ามเขียนตาราง proctor โดยตรง; Server Action ต้องตรวจ exact submission owner + `in_progress` ก่อนใช้ service role และครูอ่านได้เฉพาะ assignment ที่ตนจัดการ ข้อมูลเหล่านี้เป็นหลักฐานประกอบการพิจารณา ไม่ใช่การตัดสินทุจริตอัตโนมัติ
- การรับทราบ event ต้องตรวจ exact event ผ่าน RLS แล้วใช้ service-role-only RPC ที่ตรวจ owner/co-teacher `admin/manage`/super admin ซ้ำ; authenticated role ไม่มี `UPDATE`, evidence fields มี immutable trigger และเงื่อนไข `acknowledged_at IS NULL` ทำให้ครูคนแรกชนะโดยไม่เขียนทับ audit เดิม การลบบัญชีผู้รับทราบล้างเฉพาะ actor id แต่คงเวลาไว้
- รายงานสัญญาณคุมสอบเป็น read-only view ไม่ใช่ฐานข้อมูลคำตัดสิน: server ต้องตรวจ exact assignment manager (owner, co-teacher `admin/manage` หรือ super admin) ก่อน แล้วอ่าน session/event ผ่าน RLS ซ้ำ ตัวกรอง student/attempt/kind/acknowledgement ต้องผ่าน allowlist และ pagination ฝั่ง server; การ resolve ชื่อด้วย admin client จำกัดเฉพาะ student IDs ของ retained sessions ที่ RLS คืนให้ exact assignment หลัง authorization และมี hard cap 2,000 attempts ห้ามค้น roster ทั้ง organization หรือโหลดประวัติ event ทั้งชุดไปกรองใน browser
- เวลาหลักของรายงานคือ `exam_proctor_events.created_at` จาก server เท่านั้น `occurred_at_client` มาจากนาฬิกาที่ client ควบคุมและอาจคลาดเคลื่อนหรือถูกแก้ ห้ามใช้แทน server time เพื่อเรียงเหตุการณ์ ตัดสินความน่าเชื่อถือ หรือกล่าวหานักเรียน
- Browser Notification ของห้องคุมสอบต้องขอสิทธิ์จาก user gesture ใช้ข้อความทั่วไปที่ไม่มีชื่อนักเรียน และเป็นเพียงส่วนเสริมขณะ dashboard เปิดอยู่; ชื่อแสดงได้เฉพาะ toast/feed ภายในหน้าที่ผ่าน authorization แล้ว ห้ามอ้างว่าเป็น background push หรือช่องทางแจ้งเหตุที่รับประกันการส่ง
- ข้อสอบ `seb_required` ต้องตรวจ **ทั้ง** Config Key และ Browser Exam Key request hash จาก SEB JavaScript API ที่ server; ผูก hash กับ exact URL challenge (ตัดเฉพาะ fragment), ผูก challenge/session กับ user + assignment, ตรวจ origin/path และเก็บ token ใน HttpOnly SameSite=Strict cookie ห้ามใช้ user-agent หรือการมี `window.SafeExamBrowser` อย่างเดียวเป็น security boundary
- ห้ามส่ง `SEB_SESSION_SECRET`, CK, BEK หรือ Quit/Admin Password ไป client/log/database; submission เก็บได้เฉพาะเวลา platform และ version ที่ผ่านตรวจ ส่วน raw request hash ไม่จำเป็นต่อ audit และห้ามเก็บ
- SEB preflight เก็บได้เฉพาะผล `system_check` ที่ผ่านล่าสุดต่อ assignment/student: `verified_at`, `valid_until` ไม่เกิน 12 ชั่วโมง, platform และ version ห้ามเก็บ failure, raw CK/BEK/request hash, IP, user-agent หรือ device fingerprint; browser เขียนตรงไม่ได้ service-role-only RPC ต้องตรวจซ้ำว่า assignment เผยแพร่และบังคับ SEB พร้อมตรวจ exact roster membership ส่วน RLS เปิดอ่านแก่ครูที่จัดการ assignment และ super admin เท่านั้น ตารางนี้ไม่เข้า Postgres Changes publication เพราะ RLS ไม่ครอบคลุม `DELETE` payload หน้าครูจึง refresh ผ่าน RLS-protected SELECT แทน
- สถานะ “พร้อม” ใน roster หมายถึงเคยผ่านการตรวจภายในอายุ session ไม่ใช่ device identity ไม่พิสูจน์ว่ายังใช้เครื่องเดิม และไม่ใช่หลักฐานว่าปกติหรือทุจริต จึงห้ามใช้ check-in เพียงอย่างเดียวเป็น hard gate หรือคำตัดสิน นักเรียนที่เปลี่ยนเครื่อง/รุ่น/ไฟล์ตั้งค่าต้องตรวจใหม่
- SEB session ต้องถูกตรวจซ้ำทุก mutation/read ของ attempt ไม่ใช่แค่หน้าเข้า; การบังคับ SEB กลาง attempt ถูกห้ามเพราะจะล็อกนักเรียนออกจากคำตอบเดิม และ server-initiated forced finalize หลังหมดเวลาต้องทำได้แม้ client session หมดอายุ
- Android monitored mode ไม่ใช่ SEB/kiosk และห้ามใช้ user-agent เป็น security boundary นักเรียนต้องรอโดยยังไม่สร้าง attempt แล้วให้ครูที่มีสิทธิ์ตรวจเครื่องจริงและอนุมัติ exact student + assignment ก่อนออก signed HttpOnly session; ทุก attempt read/write ต้องตรวจ session นี้ซ้ำเช่นเดียวกับ SEB
- Android approval เก็บได้เฉพาะ assignment/student/status/request/review/expiry และผู้อนุมัติ ห้ามเก็บ user-agent, IP, device ID/fingerprint หรือ screen content; ป้ายใน audit ต้องเป็น `android_monitored` และห้ามแสดงเป็น “SEB ยืนยันแล้ว”

## Uploads และ exports

- ตรวจ MIME type, ขนาด และจำนวนไฟล์ฝั่ง server/storage policy
- **URL ของไฟล์ที่ client ส่งกลับมาให้บันทึกต้องตรวจถึง “host” ไม่ใช่แค่ path** — `https://evil.example/storage/v1/object/public/classroom-post-files/x.png` มี path ตรงทุกตัวอักษร ถ้าตรวจแค่ path ไฟล์นอกโปรเจกต์จะถูกฝังเป็น `<img src>`/ปุ่มดาวน์โหลดต่อหน้าทั้งห้องได้ · ไฟล์แนบประกาศตรวจด้วย `isPostFileUrl()` เทียบกับ `NEXT_PUBLIC_SUPABASE_URL` (มี unit test ครอบ) และชื่อไฟล์ที่ client ส่งมาถูกตัดอักขระคั่น path และจำกัดความยาวก่อนเก็บ
- ใช้ชื่อไฟล์และ path ที่ไม่เปิดเผยข้อมูลเกินจำเป็น
- จำกัดการอ่านไฟล์ตาม owner/classroom/assignment
- ระวัง orphan files เมื่อแก้หรือลบ resource
- Export ต้องตรวจผู้ขอและข้อมูลทุกแถวก่อนสร้างไฟล์
- PDF/CSV/รูปที่ส่งออกอาจมีข้อมูลส่วนบุคคล ต้องไม่ใช้ public URL ถ้าไม่จำเป็น
- CSV รายงานคุมสอบต้องตรวจสิทธิ์ผู้จัดการ assignment ซ้ำและ re-query ตามตัวกรองจากฐานข้อมูล ห้ามเชื่อรายการ event หรือชื่อที่ browser ส่งกลับมา เส้นทางส่งออกตรึงขอบเขต event ใหม่ด้วย ID สูงสุดจาก query แรกและปฏิเสธเมื่อจำนวนที่อ่านไม่ตรงกัน ทุก event-derived attempt/student pair ต้องยืนยันกับ retained session ผ่าน RLS ก่อน admin lookup แต่กลไกนี้ไม่ใช่ transactional snapshot ของ acknowledgement ทุกช่อง จำกัดสูงสุด 10,000 แถว, 2,000 attempts และ payload UTF-8 สูงสุด 4 MiB หากเกินเพดานใดต้องปฏิเสธทั้งคำขอโดยไม่ truncate เงียบ ๆ หรือส่งไฟล์บางส่วน Request body ต้องเป็น `application/json` และอ่านแบบ stream ไม่เกิน 4 KiB จริงโดยไม่เชื่อ `Content-Length` เพียงอย่างเดียว ส่วน CSV ต้องป้องกัน spreadsheet formula injection สำหรับ `=`, `+`, `-`, `@`, รูป full-width และสูตรหลังตัวคั่น comma/semicolon/tab หรือ control character
- การตอบไฟล์รายงานใช้ `Cache-Control: private, no-store`, `Content-Disposition: attachment` และ `X-Content-Type-Options: nosniff`; ห้ามบันทึกไฟล์ลง public storage หรือ application log และห้ามเรียกว่า tamper-proof/certified evidence เพราะ CSV เป็นสำเนาข้อมูลแบบมีขอบเขตที่ผู้รับแก้ไขต่อได้
- ชื่อนักเรียนที่หน้า/CSV รายงานคุมสอบเป็น display value แบบจำกัด 160 Unicode code points และเติม `…` เมื่อยาวเกิน เพื่อไม่ให้ข้อความ profile หนึ่งค่าถูกขยายซ้ำจนกินหน่วยความจำระหว่างส่งออก; CSV มีรหัสอ้างอิง event แบบตัวเลขไว้ตรวจย้อนกับข้อมูลในระบบ แต่ไม่ส่ง student/submission/organization UUID
- Retention 90 วันและปุ่มล้างข้อมูลคุมสอบมีผลเฉพาะข้อมูลใน KorKru ไม่สามารถตามลบไฟล์ที่ดาวน์โหลดแล้ว หน้ารายงานต้องเตือนว่าไฟล์มีชื่อและพฤติกรรมของนักเรียน ผู้ดาวน์โหลดต้องจำกัดผู้เข้าถึง ส่งต่อเท่าที่จำเป็น และลบสำเนาเมื่อหมดวัตถุประสงค์
- ผลวิจัยระดับบุคคลและแท็บข้อมูลที่ใช้ต้องตรวจสิทธิ์จัดการโครงการก่อน query; pagination/filtering ทำฝั่ง server และไม่ส่ง roster ทั้งโครงการเข้า Client Component เมื่อผู้ใช้ดูเพียงหน้าปัจจุบัน
- Excel ข้อมูลวิจัยรายบุคคลรับเฉพาะ `POST application/json` แบบ allowlist และ stream ไม่เกิน 1 KiB ตรวจ manage permission ก่อนอ่านทุกแถว จำกัด 2,000 คน และตอบด้วย `private, no-store`, attachment, `nosniff` และ same-origin resource policy; สร้างในหน่วยความจำโดยไม่ใช้ public Storage แบบไม่ระบุตัวตนห้าม query/ใส่ชื่อ รหัสนักเรียน UUID หรือเลขที่ในห้องและต้องสุ่มลำดับใหม่ ส่วนแบบมีตัวตนเปิดเฉพาะเมื่อครูเลือกเอง ทั้งสองแบบเตือนว่าไฟล์ที่ดาวน์โหลดต้องจำกัดผู้เข้าถึงและลบเมื่อหมดความจำเป็น
- audit การส่งออกวิจัยเก็บเฉพาะ project/org, actor, โหมด, รูปแบบ, จำนวนแถว, เวลา และเวลาแก้คะแนนล่าสุด ไม่มีชื่อ รหัส คะแนน ชื่อไฟล์ หรือ binary; authenticated role อ่านได้ตาม manage RLS แต่เขียนไม่ได้ การ insert ทำหลังสร้าง workbook สำเร็จผ่าน service-role-only RPC ที่ตรวจสิทธิ์ actor กับ exact project ซ้ำ และหากบันทึก audit ล้มเหลว route ต้องไม่ส่งไฟล์

### พื้นที่เขียนและวิธีทำที่แนบ

- ข้อความคณิตศาสตร์จากนักเรียนต้องผ่าน bounded allowlist parser เท่านั้น: จำกัดความยาว/token/depth/operation, ปฏิเสธ identifier และ syntax ที่ไม่รู้จัก, ไม่ใช้ `eval` หรือ `Function`, และไม่ส่ง mathjs เข้า initial client path โหมด DEG/RAD ที่ใช้ตรวจต้องมาจาก metadata ที่ validate แล้วและบันทึกพร้อมคำตอบ
- เครื่องคิดเลขแสดงจาก assignment flag ที่ server อ่านให้ แต่ไม่ถือเป็น security boundary ต่อเครื่องคิดเลขภายนอก; implementation โหลดหลัง user gesture และ history อยู่ใน memory ของหน้าเท่านั้น ห้ามเพิ่ม API, database row หรือ telemetry ที่ส่งนิพจน์/ประวัติการคำนวณขึ้น server
- กระดาษทดที่ยังไม่แนบอยู่ใน IndexedDB ของอุปกรณ์เท่านั้นแล้ว ไม่ส่ง scene ต่อ stroke และไม่ถือเป็น education record บน server; teacher preview ไม่เขียน IndexedDB
- Local key แยก authenticated user/submission/answer/part, scene ใช้ allowlisted format version และจำกัด 2 MiB/10,000 elements; ล้างเมื่อส่งสำเร็จแบบ best effort และ purge รายการหมดอายุ 7 วันเมื่อเปิด editor ครั้งถัดไป local data เป็น recovery convenience ไม่ใช่ trusted submission state
- Preview และ scene ที่แนบใหม่อยู่ใน private bucket `math-work-artifacts`; browser ขอ path-bound signed upload token และ signed read URL อายุ 5 นาทีผ่าน Server Action หลังตรวจ exact submission/assignment authority ไม่มี client policy สำหรับ list/read/write/delete ทั้ง bucket
- Browser ส่ง Storage path, MIME, size, format version และ element count มาได้แต่เชื่อไม่ได้ Server Action ต้องตรวจ owner, tenant, exact in-progress answer, เวลา และ SEB/Android access gate ซ้ำก่อนบันทึก reference
- หลังส่งต้องปฏิเสธการแก้ scene, preview และ metadata แม้ client ยังถือ URL หรือ local copy อยู่
- `student_work_artifacts` แก้/ลบได้เฉพาะเจ้าของที่ submission ยัง `in_progress`; `teaching_boards` อ่านได้เฉพาะครูที่มีสิทธิ์ใน assignment และแก้/ลบได้เฉพาะผู้สร้าง เพดาน 5 slots บังคับด้วย constraint เพื่อกัน concurrent request
- การ finalize งานที่บังคับแนบวิธีทำตรวจ exact answer/part ฝั่ง server และยอมรับเฉพาะ artifact reference หรือ `work_images` รุ่นเก่าที่มีอยู่จริงใน answer; หน้าผลลัพธ์ sign เฉพาะ preview path ที่ได้จากคำตอบซึ่งผ่าน result-visibility/RLS แล้วและไม่เปิด scene
- การแทนที่หรือลบต้องเปลี่ยน database reference ก่อนแล้วจึงลบไฟล์แบบ best effort; scheduled orphan cleanup เว้น grace period 7 วัน ลบเฉพาะ path ที่ตรงกับ builder ใต้ `students/`/`teachers/` หลังตรวจ exact path จากทั้งสอง reference tables ซ้ำ และหยุดก่อนเริ่มลบเมื่อ listing/reference scan ไม่ครบหรือเกินเพดาน
- Cleanup route ใช้ Bearer `CRON_SECRET` อย่างน้อย 32 ตัวอักษรและเปรียบเทียบแบบ constant-time ก่อนสร้าง admin client; response/log มีเฉพาะ aggregate/error code ไม่ส่ง path, URL หรือข้อมูลนักเรียน และ deployment ที่ไม่มี secret จะ fail closed ด้วย 503
- rollout audit เฟส 8 ตรวจแบบอ่านอย่างเดียวแล้วว่า bucket `math-work-artifacts` เป็น private จำกัด 5 MiB รับเฉพาะ WebP/JSON (ตั้งแต่ migration `20260904023417` รับ `image/png` ด้วย เพราะ Safari เข้ารหัส WebP จาก canvas ไม่ได้ โดย Server Action ยังตรวจว่า byte signature ตรงกับชนิดที่ client แจ้ง), migration local/remote ตรงกัน และ dry-run cleanup ไม่ลบข้อมูล; environment ที่ตรวจยังไม่มี Vercel project link/CLI และ `CRON_SECRET` จึงห้ามถือว่า scheduled cleanup ทำงาน production แล้วจนกว่าจะ deploy และตั้ง secret
- ห้าม log scene, คำตอบเต็ม, signed URL หรือ path ที่เปิดเผยข้อมูลนักเรียน รายละเอียด threat model และ lifecycle อยู่ใน `docs/STUDENT_MATH_TOOLS.md`

## Logging และ errors

- SEB password/revision core ใน `lib/seb-password-*` ยังไม่ต่อ runtime/storage: expected org/teacher/assignment/revision ต้องมาจาก server-authorized record ไม่ใช่ browser และ AES-GCM binding ไม่ได้แทน authorization; ใช้ dedicated encryption key เท่านั้น ห้าม reuse session/CK/BEK/Supabase keys ไม่ส่ง private envelope/รหัสไป client/log การเพิ่ม persistence ภายหลังต้องมี atomic revision write + RLS/ownership checks และออกแบบ key management/retention ก่อน ดู `docs/SEB_PHASE3.md` การเลื่อน native test ไม่อนุญาตให้ promote draft เป็น applied หรือผ่อน gate เดิม

- ห้าม log access code, token, service key, คำตอบเต็ม, health/family notes หรือข้อมูลผู้ปกครอง
- ส่งข้อความทั่วไปให้ผู้ใช้และเก็บรายละเอียดเฉพาะ server log ที่ควบคุมสิทธิ์
- อย่าแสดง SQL, table policy หรือ stack trace แก่ผู้ใช้

## Billing

- ห้ามเชื่อ client ว่าผู้ใช้ชำระแล้ว
- entitlement ต้องตรวจจาก server-side source of truth
- webhook ต้องตรวจ signature และทำงานแบบ idempotent
- ห้ามเก็บข้อมูลบัตรเอง
- pricing UI ปัจจุบันเป็นต้นแบบ ไม่ใช่ระบบชำระเงินจริง

## Compliance claims

ห้ามประกาศว่า KorKru “เป็นไปตาม PDPA”, “เข้ารหัสครบ”, “ได้ ISO 27001”, “มี SSO/SLA” หรือข้ออ้างคล้ายกันเพียงเพราะผู้ให้บริการ infrastructure มีคุณสมบัติบางอย่าง ต้องผ่านการตรวจระบบ กระบวนการ สัญญา และกฎหมายก่อน

## ก่อนเปิดให้ผู้ใช้จริง

- สรุป authority matrix และ data-retention policy
- ทำ threat model สำหรับ auth, tenant isolation, exam integrity, uploads และ exports
- ทดสอบ RLS แบบ automated ด้วยหลายบทบาท
- ตรวจ storage policies และ public URLs
- เพิ่ม audit ที่เชื่อถือได้สำหรับ privileged actions
- ทำ backup/restore และ incident-response procedure
- ตรวจ privacy notice, consent และการจัดการข้อมูลผู้เยาว์กับผู้เชี่ยวชาญที่เกี่ยวข้อง

เอกสารนี้เป็น engineering guardrail ไม่ใช่คำรับรองทางกฎหมาย
