# การล็อก Exam release candidate

อัปเดต: 21 กันยายน 2026

สถานะปัจจุบัน: **ล็อก release candidate สำหรับ final UAT แล้ว** โดยผูก source
revision, Vercel Staging deployment และ SEB config ไว้ใน
`config/exam-release-candidate.json`; `npm run check:exam-candidate` ผ่านครบ
และกำลังทำ physical iPad UAT ต่อบน candidate นี้

candidate ถูกล็อกใหม่เป็นรอบ `r6` หลัง physical iPad UAT ของรอบ `r5` ยืนยันว่า
เมนู **ดูทุกข้อ** และจับคู่แบบช่องผ่าน แต่พบว่าจับคู่แบบลากเส้นเริ่มลากได้เฉพาะ
จุดวงกลมฝั่งซ้ายซึ่งเล็งยาก จึงแก้ให้กดค้างบนพื้นที่การ์ดแล้วลากได้ทั้งซ้าย→ขวา
และขวา→ซ้าย โดย gesture แนวตั้งยังใช้เลื่อนหน้าได้

Vercel deployment ใหม่ขึ้นสถานะ Ready และ canonical Staging alias ชี้มาที่ commit
`394c04d`; canonical Staging แสดงป้าย `STAGING · ระบบทดสอบ` และข้อ 8 แสดงคำแนะนำ
ใหม่ให้กดค้างบนการ์ดฝั่งใดก็ได้แล้วลากไปอีกฝั่งตรงตาม build ที่ล็อก

ผล physical UAT ของ iPhone และ Windows ในรอบ `r4` ยังเป็นหลักฐานการค้นพบที่มีค่า
แต่ไม่ถูกยกมาเป็นผลผ่านของ `r6` เพราะมี UI ร่วมเปลี่ยนหลังจากนั้น
จึงคืน suite ที่ได้รับผลกระทบเป็น `pending` ก่อนทดสอบ candidate เดียวกัน จากนั้น
เจ้าของผลิตภัณฑ์ยืนยันบน iPad จริงว่าหน่วยอยู่ถูกตำแหน่งและค่าคำตอบยังคงอยู่หลังปิด
แป้น ซึ่งปิด regression จุดนี้แล้ว แต่ iPad suite ยังคง `pending` จนกว่าจะทดสอบ
เมนู/overlay, touch gesture, กระดาษทด และ file picker ครบ; iPhone และ Windows จะ
ตรวจเองโดยเจ้าของผลิตภัณฑ์และยังคง `pending` จนกว่าจะมีผลยืนยัน ส่วน Mac และ suite
ระบบจริงอื่นยังคง `pending` ตามเดิม

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
