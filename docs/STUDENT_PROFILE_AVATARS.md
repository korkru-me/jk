# รูปโปรไฟล์และหน้าเรียนรู้ของนักเรียน · 14 ตุลาคม 2026

- รูปจากตัวจัดตำแหน่งเดิมเคยเป็นเพียง preview ในหน้า เจ้าของขอเปลี่ยนเป็นการบันทึกถาวรแล้ว: ส่ง crop PNG 512×512 ผ่าน `updateMyAvatar`, ตรวจ verified Auth และบัญชี active ก่อนใช้ admin Storage/users update ไม่รับ user ID หรือ URL จาก client
- `profile-avatars` เป็น bucket รูปแสดงตัวตนสาธารณะ แยกจากเอกสาร/รูปงานและข้อมูลนักเรียนส่วนตัว รับ PNG ไม่เกิน 2 MiB; restrictive Storage policy ปฏิเสธสิทธิ์ตรงของ anon/authenticated แม้มี permissive policy เดิม เฉพาะ server action ที่ตรวจเจ้าของแล้วเขียนได้
- Server decode ขนาด/format/page จริงด้วย sharp และ re-encode เพื่อตัด metadata; path เป็น UUID เจ้าของ + UUID ใหม่ ไม่ upsert ใช้ compare-and-set avatar_url ป้องกันสอง save แข่งกัน และ rollback object ใหม่หากเปลี่ยน profile ไม่สำเร็จ ลบรูปเก่าเฉพาะ bucket/namespace เจ้าของที่ตรงตัว ไม่ลบ OAuth/รูปภายนอก
- ปุ่มบันทึกรอผลจริงแล้วค่อยเปลี่ยนภาพ/ปิด editor และ refresh layout ถ้าไม่สำเร็จเก็บ crop draft ไว้ ไม่มี localStorage หรือ data URL เป็นรูปถาวรของบัญชีจริง
- งานส่งแล้วแสดงในรายการเดียวกับงานค้าง พร้อมติ๊กและกรอบเขียวอ่อน ใช้การเลือก official attempt/เกณฑ์ผ่านเดิมและลิงก์ submission ของตน คะแนนยังถูกลบจาก DTO เมื่อครูกำหนดไม่แสดง ไม่มีประวัติการสอบแบบรายการแยก
- ปุ่มเรียงใกล้กำหนดส่ง/มอบหมายล่าสุด กดตัวเดิมสลับทิศทาง วันที่ไม่ทราบอยู่ท้ายทั้งสองทิศ กรอบงานและประกาศล่าสุดจำกัดความสูง ใช้ natural wheel scroll chaining เมื่อสุดกรอบ หัวต้อนรับใหญ่ขึ้น และป้ายผู้ดูข้อมูลแสดงเพียงตา + บทบาทครู

## การปล่อยและหลักฐาน

- ลง schema และทดสอบ hosted เฉพาะ Staging ที่เจ้าของอนุญาต ไม่มี push/deploy หรือการเขียน Production; Production ยังต้อง migration bucket นี้ในรอบปล่อยจริงก่อนการบันทึกรูปจะทำงาน
- หน้าทดลอง `/exam-screen-lab/student-profile` ไม่เขียนบัญชีจริง ใช้ action error จำลองเพื่อยืนยันว่าคง crop draft เมื่อบันทึกไม่ได้
- Unit tests ครอบคลุม crop byte/ขนาด, ownership path, rollback/concurrent save, ไม่ลบรูปอื่น, restrictive RLS กับ broad legacy policy, completed result/hidden score และ reverse sorting; browser/runtime/build และ Staging integration รายงานผลเพิ่มเติมหลังตรวจครบ
