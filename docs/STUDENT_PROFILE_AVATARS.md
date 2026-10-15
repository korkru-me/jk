# รูปโปรไฟล์และหน้าเรียนรู้ของนักเรียน · 14 ตุลาคม 2026

- รูปจากตัวจัดตำแหน่งเดิมเคยเป็นเพียง preview ในหน้า เจ้าของขอเปลี่ยนเป็นการบันทึกถาวรแล้ว: ส่ง crop PNG 512×512 ผ่าน `updateMyAvatar`, ตรวจ verified Auth และบัญชี active ก่อนใช้ admin Storage/users update ไม่รับ user ID หรือ URL จาก client
- `profile-avatars` เป็น bucket รูปแสดงตัวตนสาธารณะ แยกจากเอกสาร/รูปงานและข้อมูลนักเรียนส่วนตัว รับ PNG ไม่เกิน 2 MiB; restrictive Storage policy ปฏิเสธสิทธิ์ตรงของ anon/authenticated แม้มี permissive policy เดิม เฉพาะ server action ที่ตรวจเจ้าของแล้วเขียนได้
- Server decode ขนาด/format/page จริงด้วย sharp และ re-encode เพื่อตัด metadata; path เป็น UUID เจ้าของ + UUID ใหม่ ไม่ upsert ใช้ compare-and-set avatar_url ป้องกันสอง save แข่งกัน และ rollback object ใหม่หากเปลี่ยน profile ไม่สำเร็จ ลบรูปเก่าเฉพาะ bucket/namespace เจ้าของที่ตรงตัว ไม่ลบ OAuth/รูปภายนอก
- ปุ่มบันทึกรอผลจริงแล้วค่อยเปลี่ยนภาพ/ปิด editor และ refresh layout ถ้าไม่สำเร็จเก็บ crop draft ไว้ ไม่มี localStorage หรือ data URL เป็นรูปถาวรของบัญชีจริง
- งานส่งแล้วแสดงในรายการเดียวกับงานค้าง พร้อมติ๊กและกรอบเขียวอ่อน ใช้การเลือก official attempt/เกณฑ์ผ่านเดิมและลิงก์ submission ของตน คะแนนยังถูกลบจาก DTO เมื่อครูกำหนดไม่แสดง ไม่มีประวัติการสอบแบบรายการแยก
- ปุ่มเรียงใกล้กำหนดส่ง/มอบหมายล่าสุด กดตัวเดิมสลับทิศทาง วันที่ไม่ทราบอยู่ท้ายทั้งสองทิศ กรอบงานและประกาศล่าสุดจำกัดความสูง ใช้ natural wheel scroll chaining เมื่อสุดกรอบ หัวต้อนรับใหญ่ขึ้น และป้ายผู้ดูข้อมูลแสดงเพียงตา + บทบาทครู

## การปล่อยและหลักฐาน

- ลง schema และทดสอบ hosted เฉพาะ Staging ที่เจ้าของอนุญาต ไม่มี push/deploy หรือการเขียน Production; Production ยังต้อง migration bucket นี้ในรอบปล่อยจริงก่อนการบันทึกรูปจะทำงาน; เจ้าของยืนยันให้เก็บไว้ปล่อยพร้อมเว็บจริง บัญชีเดิมบน localhost:3000 ที่เชื่อม Production จึงยังไม่เปิดพื้นที่เก็บรูปในรอบนี้
- หน้าทดลอง `/exam-screen-lab/student-profile` ไม่เขียนบัญชีจริง ใช้ action error จำลองเพื่อยืนยันว่าคง crop draft เมื่อบันทึกไม่ได้
- Unit tests ครอบคลุม crop byte/ขนาด, ownership path, rollback/concurrent save, ไม่ลบรูปอื่น, restrictive RLS กับ broad legacy policy, completed result/hidden score และ reverse sorting; TypeScript, token lint, webpack build และ 3,264 unit tests ผ่าน; Chrome จริง 390/1600px light/dark ไม่พบ axe violation, fresh navigation ไม่มี runtime error, mouse wheel ผ่านขอบบน/ล่างจริง, reverse sorting และ completed result link ถูกต้อง

- Staging ลง `20261014053207`, `20261014065458`, `20261014071012` แล้ว ประวัติ local/remote ตรงกัน ทดสอบด้วย Auth accounts/สององค์กร/สอง roster ที่สร้างใหม่เท่านั้น: รับทราบพร้อมกัน idempotent, ack+resend แข่งกัน, stale PT409, manager/view/foreign/student ข้ามห้อง, ออกจาก roster, archived room และ direct anon/auth RPC/table/Storage denial ผ่าน
- Browser localhost ที่เชื่อม Staging พร้อมป้าย STAGING: บันทึก PNG ผ่าน Server Action จริง กลับเข้าหน้าใหม่รูปยังโหลดเป็น 512px, ไม่มีป้ายดูได้, ครู 1/1 กดแจ้งซ้ำกลับเป็น 0/1 นักเรียนเห็น popup ใหม่และกดรับทราบใหม่ได้ ไม่มีการเริ่ม/ส่ง/ให้คะแนนงานจริง การทดสอบไม่ได้ครอบคลุมอุปกรณ์สัมผัสจริงหรือทุก browser
- โฟลเดอร์ `.next-*` ถูกยกเว้นจาก Git/Tailwind source scan เพื่อไม่อ่าน binary output ของ isolated build/dev เป็น utility classes; restart dev ของงานนี้โดยคง `.next` แก้ CSS parse error ที่เกิดระหว่างทดสอบได้

- Cleanup รอบทดสอบเสร็จแล้ว ตรวจ users/classrooms/organizations ของ manifest และ Storage ของบัญชี QA เหลือศูนย์ ล้าง browser state และไฟล์คีย์ชั่วคราว ปิด server Staging เฉพาะพอร์ต 3037 คง localhost:3000 ให้ดูต่อ QA runner รองรับ sign out refresh sessions ก่อนลบบัญชีในรอบต่อไป.
