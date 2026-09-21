# การล็อก Exam release candidate

อัปเดต: 21 กันยายน 2026

สถานะปัจจุบัน: **ล็อก release candidate สำหรับ final UAT แล้ว** โดยผูก source
revision, Vercel Staging deployment และ SEB config ไว้ใน
`config/exam-release-candidate.json`; `npm run check:exam-candidate` ผ่านครบ
และกำลังทำ physical iPad UAT ต่อบน candidate นี้

candidate ถูกล็อกใหม่เป็นรอบ `r7` หลัง physical iPad UAT ของรอบ `r6` พบว่า
พื้นที่การ์ดลากได้เพียงขวา→ซ้าย ส่วนซ้าย→ขวาไม่เริ่มลาก และบางครั้งการลากเฉียง
จากฝั่งขวาถูก Safari เปลี่ยนเป็นการเลื่อนหน้า นอกจากนี้เอฟเฟกต์กดค้างปรากฏเฉพาะ
การ์ดขวา จึงเปลี่ยนการ์ดที่ยังตอบได้ทั้งสองฝั่งเป็นพื้นที่ลากเฉพาะและใช้ปุ่มชนิด
เดียวกันทั้งคู่ เลื่อนหน้ายังคงทำได้จากพื้นที่ว่างนอกการ์ด

Vercel deployment ใหม่ขึ้นสถานะ Ready และ canonical Staging alias ชี้มาที่ commit
`21d8c02`; canonical Staging แสดงป้าย `STAGING · ระบบทดสอบ` และข้อ 8 แสดงคำแนะนำ
ใหม่ให้เลื่อนหน้าจากพื้นที่ว่างนอกการ์ดตรงตาม build ที่ล็อก Local runtime ยืนยัน
ซ้าย→ขวา, ขวา→ซ้าย, การกดค้างทั้งสองฝั่ง และการลากเฉียงจากฝั่งขวาโดย gesture
ไม่ถูกยกเลิกแล้ว

Physical iPad UAT บน candidate `r7` ยืนยันแล้วว่าการลากจากพื้นที่การ์ดผ่านครบ
ทั้งสองทิศทาง การลากเฉียงไม่กลายเป็นเลื่อนหน้า และ feedback ทั้งสองฝั่งทำงานดี
การกดค้างแล้วลากเรียงลำดับด้วยนิ้วผ่านด้วย โดยการ์ดย้ายตำแหน่งและหน้าไม่เลื่อนแทน
โหมดโฟกัสผ่านทั้งเข้า/ออก การเลื่อน และการคงคำตอบเดิม iPad suite ยังเป็น
`pending` เพราะเหลือกล่องยืนยันส่ง, overlay/เครื่องมือ, กระดาษทด และ
camera/file picker บน candidate เดียวกัน

ผล physical UAT ของ iPhone และ Windows ในรอบ `r4` ยังเป็นหลักฐานการค้นพบที่มีค่า
แต่ไม่ถูกยกมาเป็นผลผ่านของ `r7` เพราะมี UI ร่วมเปลี่ยนหลังจากนั้น
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
