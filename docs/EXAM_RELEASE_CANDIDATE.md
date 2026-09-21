# การล็อก Exam release candidate

อัปเดต: 21 กันยายน 2026

สถานะปัจจุบัน: **ล็อก release candidate สำหรับ final UAT แล้ว** โดยผูก source
revision, Vercel Staging deployment และ SEB config ไว้ใน
`config/exam-release-candidate.json`; `npm run check:exam-candidate` ผ่านครบ
และกำลังทำ physical iPad UAT ต่อบน candidate นี้

candidate ถูกล็อกใหม่เป็นรอบ `r8` หลัง physical iPad UAT ของรอบ `r7` ผ่าน
แป้นคณิตศาสตร์แล้ว แต่พบว่าเครื่องคิดเลขวิทยาศาสตร์แสดงเลขหลักพันติดกัน เช่น
`1900052` จึงเพิ่มตัวคั่นเฉพาะชั้นแสดงผลให้เป็น `1,900,052` โดยคงนิพจน์ดิบที่ใช้
คำนวณและค่าที่ใส่กลับช่องคำตอบไว้เหมือนเดิม เพื่อไม่ให้ comma ของฟังก์ชัน เช่น
`log(1000,10)` เปลี่ยนความหมาย

Vercel deployment ใหม่ขึ้นสถานะ Ready และ canonical Staging alias ชี้มาที่ commit
`564f12c`; canonical Staging แสดงป้าย `STAGING · ระบบทดสอบ` และตรวจจาก DOM จริงว่า
กด `1900052` แล้วช่องแสดง `1,900,052` ส่วน `1,900,052 + 1,000` แสดงผล
`1,901,052` โดยไม่มี console error ตรงตาม build ที่ล็อก

Physical iPad UAT บน candidate `r7` ยืนยันแล้วว่าการลากจากพื้นที่การ์ดผ่านครบ
ทั้งสองทิศทาง การลากเฉียงไม่กลายเป็นเลื่อนหน้า และ feedback ทั้งสองฝั่งทำงานดี
การกดค้างแล้วลากเรียงลำดับด้วยนิ้วผ่านด้วย โดยการ์ดย้ายตำแหน่งและหน้าไม่เลื่อนแทน
โหมดโฟกัสผ่านทั้งเข้า/ออก การเลื่อน และการคงคำตอบเดิม iPad suite ยังเป็น
`pending`; กล่องยืนยันส่งผ่านทั้งการแสดงผล การเลื่อนภายใน การยกเลิก และการคง
ข้อมูลเดิมแล้ว เครื่องคิดเลขวิทยาศาสตร์ผ่านการคำนวณ การเลื่อนภายใน การหมุนจอ
และการคงคำตอบเดิม แป้นคณิตศาสตร์ของช่องคำตอบผ่านแล้วบน `r7` และเจ้าของผลิตภัณฑ์
ยืนยันการคั่นหลักพันบน iPad จริงของ `r8` แล้ว ขั้นถัดไปเหลือกระดาษทดและ
camera/file picker บน candidate เดียวกัน ต่อมาผู้ใช้ยืนยันกระดาษทดผ่านทั้งการวาด
ต่อเนื่อง ยางลบ undo/redo สีและขนาดเส้น รูปทรง ข้อความ ซูม/เลื่อน หมุนจอ และ
ปิด–เปิดแผงโดยงานยังอยู่ การรีเฟรชแล้วข้อมูลหายเป็นพฤติกรรมที่ตั้งใจของ lab/preview
ซึ่งปิด persistence; จึงเหลือ camera/file picker เป็นรายการถัดไป

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
