# Android monitored exam mode — คู่มือเฟส 3

Android monitored mode เป็นทางสำรองสำหรับนักเรียนที่มีเพียง Android ในห้องสอบจริง โดยยังใช้เว็บ KorKru เดิม ไม่ใช่ Safe Exam Browser และไม่ใช่ kiosk ระดับระบบ

ข้อจำกัดสำคัญ:

- เว็บตรวจได้เมื่อแท็บถูกซ่อน แอปเปลี่ยน หน้าต่างเสียโฟกัส ออกจาก fullscreen หรือเปิดหน้าสอบพร้อมกันหลายจุด แต่เป็นเพียงสัญญาณประกอบ
- เว็บ Android ป้องกันหรือตรวจการแคปหน้าจอระดับระบบอย่างน่าเชื่อถือไม่ได้ `FLAG_SECURE` เป็นความสามารถของ native Android window ไม่ใช่ Web API
- fullscreen ของเว็บออกได้และการสลับแอปทำให้หลุด จึงใช้เป็นแรงเสียดทานและสัญญาณ ไม่ใช่ security boundary
- ห้ามกล่าวว่าโหมดนี้ปลอดภัยเทียบเท่า SEB; Windows, macOS และ iOS/iPadOS ควรใช้ SEB เป็นทางหลัก

เอกสารอ้างอิง platform: [Android Lock Task Mode](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode), [Android `FLAG_SECURE`](https://developer.android.com/security/fraud-prevention/activities), [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)

## การเปิดใช้

1. Apply migration ตามลำดับ: `20260830062722_add_seb_secure_exam_mode.sql`, `20260830072842_add_android_monitored_exam_access.sql` แล้ว `20260830082038_add_exam_proctor_event_review.sql`
2. Deploy code ชุดเดียวกับ migration และตั้ง `SEB_SESSION_SECRET` อย่างน้อย 32 ตัวอักษร ค่าเดียวนี้ใช้เซ็น session ทั้ง SEB และ Android แต่มี domain separator แยก token
3. ในหน้าสร้าง/แก้ข้อสอบ เปิด “บังคับใช้ Safe Exam Browser” ก่อน แล้วเปิด “อนุญาต Android แบบครูตรวจเครื่อง”
4. ระบบบังคับเปิด proctoring อัตโนมัติ และไม่อนุญาตให้เปลี่ยนนโยบาย Android หลังมี submission แรก
5. ทดสอบ mock exam ด้วย Android รุ่น/เบราว์เซอร์และ Wi-Fi ห้องจริงก่อนใช้กับข้อสอบจริง

โหมดนี้ไม่ควรเป็นค่าเริ่มต้นของทุกข้อสอบ เปิดเฉพาะเมื่อโรงเรียนยอมรับความมั่นใจที่ต่ำกว่าและมีครูตรวจเครื่องต่อหน้าครบทุกคน

## ลำดับวันสอบ

1. ครูเปิด “ห้องคุมสอบสด” ก่อนให้นักเรียนกดเริ่ม จากนั้นเปิดและทดสอบเสียงแจ้งเตือนของเครื่องคุมสอบ (การแจ้งเตือนนอกแท็บทำงานเฉพาะขณะที่ dashboard ยังเปิด)
2. นักเรียน Android เปิดหน้าข้อสอบ จะเข้าห้องรอโดยยังไม่เห็นโจทย์ ไม่สร้าง attempt และไม่เริ่ม timer
3. นักเรียนปิดการแจ้งเตือนและแอปอื่น แสดงหน้ารายการแอปล่าสุด และยื่นเครื่องให้ครูตรวจว่ามีอุปกรณ์เดียว
4. นักเรียนกดส่งคำขอขณะครูเห็นเครื่องอยู่ ครูตรวจชื่อแล้วกด “ตรวจแล้ว อนุมัติ” รายคน
5. คำอนุมัติสร้าง session แบบ HttpOnly, SameSite=Strict ที่ผูก student + assignment + ผู้อนุมัติ อายุไม่เกิน 12 ชั่วโมง หลังจากนั้นจึงผ่านไปตรวจ access code และสร้าง/resume attempt
6. ระหว่างสอบครูติดตาม heartbeat, ออกจากแท็บ/แอป, fullscreen, clipboard และการเปิดพร้อมกันหลายจุดในห้องคุมสอบ เมื่อตรวจบริบทแล้วกด “รับทราบ” เพื่อแยกคิว โดยไม่ถือเป็นคำตัดสินทุจริต
7. ถ้าปฏิเสธหรือคำอนุมัติหมดอายุ นักเรียนต้องให้ครูตรวจเครื่องและส่งคำขอใหม่

อย่าอนุมัติจากรายชื่ออย่างเดียวโดยไม่เห็นเครื่องจริง เพราะ user-agent เป็นเพียง routing hint และปลอมได้ การตรวจต่อหน้าคือ operational control หลักของโหมดนี้

## หลังสอบและรายงานสัญญาณ

1. ครูผู้จัดการข้อสอบเปิด “รายงานสัญญาณคุมสอบ” เพื่อดูข้อมูลย้อนหลังแบบอ่านอย่างเดียว กรองตามนักเรียน, attempt, ชนิดสัญญาณ และสถานะรับทราบได้โดยระบบแบ่งหน้าฝั่ง server
2. ใช้เวลา server เป็นเวลาหลักของรายงาน ส่วนเวลาจากเครื่อง Android เป็นข้อมูล client ที่คลาดเคลื่อนหรือแก้ได้ สัญญาณออกจากแท็บ/แอปหรือ fullscreen จึงต้องพิจารณาร่วมกับสิ่งที่ครูเห็นในห้อง ไม่ใช่ข้อสรุปว่าทุจริต
3. หากต้องดาวน์โหลด CSV ระบบจะ re-query ตามตัวกรองหลังตรวจสิทธิ์ซ้ำและตรึงขอบเขต event ใหม่ด้วย ID สูงสุดจาก query แรก จำกัด 10,000 แถว, 2,000 attempts และ 4 MiB และปฏิเสธทั้งไฟล์เมื่อข้อมูลเปลี่ยนจนจำนวนไม่ตรงหรือเกินเพดานโดยไม่ตัดข้อมูลเงียบ ๆ กลไกนี้ไม่ใช่ transactional snapshot และไฟล์เป็นสำเนาที่แก้ไขได้ ไม่ใช่หลักฐานแบบ tamper-proof
4. Job retention 90 วันและปุ่มล้างข้อมูลใน KorKru ไม่สามารถลบไฟล์ที่ดาวน์โหลดออกไปแล้ว ผู้ดาวน์โหลดต้องจำกัดผู้เข้าถึง ไม่ส่งต่อเกินวัตถุประสงค์ และลบสำเนาเมื่อไม่จำเป็น

## ข้อมูลและสิทธิ์

- `exam_android_approvals` เก็บเฉพาะ assignment, student, สถานะ, เวลา, ผู้อนุมัติ และวันหมดอายุ ไม่เก็บ user-agent, IP, device ID/fingerprint, ภาพหน้าจอ กล้อง ไมโครโฟน หรือเนื้อหาคำตอบ
- นักเรียนอ่านได้เฉพาะคำขอของตัวเอง ครูอ่านได้เฉพาะ assignment ที่ตนจัดการ นักเรียนและ browser เขียนตารางตรงไม่ได้
- Server Action ตรวจ session, roster, ช่วงเวลาสอบ และ assignment policy ก่อนใช้ service role ทุกครั้ง
- submission/proctor session แยก `exam_access_mode` เป็น `seb` หรือ `android_monitored` ป้าย Android จึงไม่ถูกแสดงเป็น SEB
- คำขอ Android ถูกลบอัตโนมัติเมื่อพ้นเพดาน retention 90 วัน เช่นเดียวกับข้อมูลห้องคุมสอบ

## เกณฑ์ pilot

- ทดลองหนึ่งห้องขนาดเล็กพร้อมเครื่องสำรอง
- ผ่าน request → approve → access code → autosave → ออกจากแอป → reconnect → submit ครบทั้ง flow
- ตรวจว่าครูเห็นชื่อและป้าย “Android · ครูอนุมัติ” ของคนที่ถูกต้อง
- ทดลองปฏิเสธ, คำขอซ้ำ, session หมดอายุ, deadline หมด และผู้ใช้ที่ไม่อยู่ใน roster
- บันทึก false positive/เหตุขัดข้องเพื่อปรับคู่มือ ไม่ใช้ event เดียวตัดสินทุจริตอัตโนมัติ

หากโรงเรียนต้องการห้าม screenshot หรือทำ true kiosk บน Android จริง ต้องใช้ native app/managed-device solution เช่น Lock Task Mode ภายใต้ Device Policy Controller ซึ่งอยู่นอกขอบเขต “เว็บอย่างเดียว” ของเฟสนี้
