# หลักฐานรองรับ SEB แยกตาม platform/build

อัปเดต: 20 กันยายน 2026

ไฟล์ `config/seb-platform-evidence.json` เก็บเฉพาะชื่อ config, รุ่น OS/SEB และสถานะหลักฐาน ห้ามใส่ CK, BEK, Quit/Admin Password, token, hash หรือ URL ที่มี ticket ลงไฟล์นี้

รัน `npm run check:seb-platforms` ก่อนประกาศรองรับ production ตัวตรวจจะผ่านต่อเมื่อ Windows, macOS, iPadOS และ iOS ครบทั้งสี่เงื่อนไขสำหรับ config/build เดียวกัน:

1. native core ผ่าน
2. ผู้ดูแลตรวจว่า production BEK ของ build นั้นลงทะเบียนแล้ว (บันทึกแค่ `registered` ไม่บันทึกค่า)
3. staging mock exam ผ่าน login/system check/autosave/reconnect/upload/submit/quit
4. physical UAT รอบสุดท้ายผ่าน

สถานะปัจจุบันบันทึก native core ที่เคยทดสอบแล้ว แต่จงใจให้ production BEK เป็น `unverified` และ mock exam/UAT เป็น `pending` เพราะ repository ตรวจค่า secret ใน Vercel ไม่ได้และยังไม่มี staging แยก คำสั่งจึงต้องตอบ `NOT READY` จนกว่าจะมีหลักฐานครบจริง การที่ไฟล์ `.seb` เปิดได้หรือ native lab ผ่านอย่างเดียวไม่พอ

