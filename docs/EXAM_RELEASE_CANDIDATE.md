# การล็อก Exam release candidate

อัปเดต: 20 กันยายน 2026

สถานะปัจจุบัน: **ล็อก release candidate สำหรับ final UAT แล้ว** โดยผูก source
revision, Vercel Staging deployment และ SEB config ไว้ใน
`config/exam-release-candidate.json`; `npm run check:exam-candidate` ผ่านครบ
และงานถัดไปคือ responsive UAT บน iPad จริง

candidate ถูกล็อกใหม่เป็นรอบ `r4` หลัง physical iPhone UAT ของรอบ `r3` ยืนยันว่า
คีย์บอร์ด iOS ไม่ซ้อนกับแป้นคณิตศาสตร์แล้ว ช่อง active ไม่ถูกบัง และค่าคำตอบยังอยู่
หลังปิดแป้น แต่พบว่าแผงแนวนอนยังสูงจนเหลือพื้นที่อ่านโจทย์น้อย จึงปรับเฉพาะหน้าจอ
แนวนอนความสูงไม่เกิน 500px ให้ toolbar กระชับ ปุ่มหลักเรียง 10 คอลัมน์ 3 แถว
และรักษาพื้นที่แตะขั้นต่ำ 44px โดย layout แนวตั้ง/แท็บเล็ต/เดสก์ท็อปยังเหมือนเดิม

Vercel deployment ใหม่ขึ้นสถานะ Ready และ canonical Staging alias ชี้มาที่ commit
`c787823`; ตรวจ DOM จริงบน `staging.korkru.com` ที่ 844×390 แล้วพบว่าแผงสูง
206px, ปุ่มหลักครบ 30 ปุ่มเรียง 3 แถว, ปุ่มสูง 44px, ช่องคำตอบอยู่เหนือแผง
ประมาณ 12px, `inputmode="none"` และไม่มี horizontal overflow

บันทึก iPhone responsive suite เป็น `passed` หลังยืนยันบน iPhone จริงว่า layout
ไม่ล้น ไม่มีคีย์บอร์ดระบบซ้อน และค่าคำตอบยังอยู่หลังปิดแป้น จากนั้นบันทึก Windows
responsive suite เป็น `passed` หลังทดสอบ Windows 11 + Chrome ทั้งเต็มจอ/ครึ่งจอ,
ซูม, keyboard navigation, แป้นคณิตศาสตร์, เครื่องคิดเลข, กระดาษทด, โหมดโฟกัส,
แนบไฟล์และการลากด้วยเมาส์ ส่วน suite อื่นยังคงเป็น `pending` และไม่มีผลจาก build
เก่าถูกนำมารวม ทั้งสองผลมาจาก canonical Staging candidate `r4` เดียวกัน

หลักฐาน UAT หลังล็อก candidate ให้ commit/push ที่ branch `exam-uat-evidence`
ซึ่งถูกปิด deployment ใน `vercel.json`; ห้าม push evidence-only commit ไป branch
`staging` เพราะจะเลื่อน canonical Staging domain ออกจาก build ที่กำลังทดสอบ

ก่อนเริ่ม UAT จริง ต้องกำหนดให้ชัดว่ากำลังทดสอบ **โค้ด commit ไหน + staging build ไหน + SEB config ไหน** มิฉะนั้นผลจากคนละรุ่นอาจถูกนำมารวมจน release gate ผ่านผิด ๆ

ไฟล์ `config/exam-release-candidate.json` มี fixed schema และไม่มีช่อง URL/notes/credential:

- `candidateId` — ต้องตรงกับ `runId` ใน `config/exam-uat-evidence.json`
- `sourceRevision` — Git commit SHA ตัวพิมพ์เล็ก 40 ตัวของโค้ดที่ deploy
- `stagingBuild` — build/deployment id ที่ไม่ใช่ URL หรือ secret
- `sebConfigId` — ต้องตรงกับ `configId` ใน `config/seb-platform-evidence.json`
- `lockedAt` — เวลา ISO UTC ที่ล็อก candidate

## ลำดับการล็อก

1. ให้ `npm run check:exam-staging` ผ่านก่อน
2. เลือก commit ที่ regression/build ผ่าน แล้วดู SHA เต็มด้วย `git rev-parse HEAD`
3. deploy commit นั้นไป staging และจดเฉพาะ build id ที่ไม่เป็นความลับ ห้ามใส่ URL/token
4. ยืนยันว่าจะใช้ SEB config id เดิมตลอดรอบ
5. ใส่เวลา ISO UTC แล้วรัน `npm run check:exam-candidate`
6. เมื่อผ่านแล้วจึงเริ่ม physical/authenticated UAT

## เมื่อจำเป็นต้องแก้โค้ดหรือ SEB config

หยุดรอบ UAT เดิม สร้าง `candidateId` ใหม่ อัปเดต revision/build/config และคืน suite ที่ได้รับผลกระทบเป็น `pending` ก่อนทดสอบซ้ำ ห้ามคง `passed` จาก build เก่ามาปิด release ใหม่

ตัวตรวจไม่พิมพ์ค่า candidate/build/config ออกมา และปฏิเสธ URL, key-like hash ใน build id, เวลาไม่ใช่ ISO, field เพิ่มเติม หรือ candidate/config ที่เชื่อมกันไม่ตรง
