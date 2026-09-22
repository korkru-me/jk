# หลักฐานรองรับ SEB แยกตาม platform/build

อัปเดต: 22 กันยายน 2026

ไฟล์ `config/seb-release-registry.json` ล็อก immutable config revision, checksum ของ artifact,
policy review และ exact platform/version/build แบบไม่เก็บ secret ส่วน
`config/seb-platform-evidence.json` อ้าง revision + `buildId` จาก registry และเก็บเฉพาะสถานะ
หลักฐาน ห้ามใส่ CK, BEK, Quit/Admin Password, token หรือ URL ที่มี ticket ลงสองไฟล์นี้

รัน `npm run check:seb-registry` และ `npm run check:seb-platforms` ก่อนประกาศรองรับ
production ตัวตรวจจะผ่านต่อเมื่อ Windows, macOS, iPadOS และ iOS อ้าง exact config
revision/build เดียวกับ release candidate และครบทั้งสี่เงื่อนไข:

1. native core ผ่าน
2. ผู้ดูแลตรวจว่า production BEK ของ build นั้นลงทะเบียนแล้ว (บันทึกแค่ `registered` ไม่บันทึกค่า)
3. staging mock exam ผ่าน login/system check/autosave/reconnect/upload/submit/quit
4. physical UAT รอบสุดท้ายผ่าน

สถานะปัจจุบันบันทึก native core ที่เคยทดสอบแล้ว แต่ policy/build approval ยัง `pending`,
production BEK เป็น `unverified` และ mock exam/UAT เป็น `pending` เพราะ repository ตรวจค่า secret
ใน Vercel ไม่ได้ คำสั่งจึงต้องตอบ `NOT READY` จนกว่าจะมีหลักฐานครบจริง การที่ไฟล์ `.seb`
เปิดได้หรือ native lab ผ่านอย่างเดียวไม่พอ ดูขั้นตอนใน `docs/SEB_CONFIG_RELEASE_RUNBOOK.md`
