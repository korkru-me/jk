# การล็อก Exam release candidate

อัปเดต: 21 กันยายน 2026

สถานะปัจจุบัน: **ล็อก release candidate สำหรับ final UAT แล้ว** โดยผูก source
revision, Vercel Staging deployment และ SEB config ไว้ใน
`config/exam-release-candidate.json`; `npm run check:exam-candidate` ผ่านครบ
และงานถัดไปคือ responsive spot retest บนอุปกรณ์จริง

candidate ถูกล็อกใหม่เป็นรอบ `r5` หลัง physical iPad UAT ของรอบ `r4` พบว่าหน่วย
คำตอบอยู่หลังปุ่มเปิดแป้นคณิตศาสตร์ จึงแก้ component กลางให้ลำดับเป็น **ช่องคำตอบ
→ หน่วย → ปุ่มเปิดแป้น** ครบทั้งคำตอบเดี่ยว หลายข้อย่อย และช่องฝังในโจทย์ โดย
ไม่เปลี่ยนพฤติกรรมการกรอกหรือแป้นคณิตศาสตร์

Vercel deployment ใหม่ขึ้นสถานะ Ready และ canonical Staging alias ชี้มาที่ commit
`4e8a8c4`; ตรวจ DOM จริงบน `staging.korkru.com` แล้วพบลำดับช่องแรกเป็นช่องคำตอบ
→ `m/s²` → ปุ่มเปิดแป้น และช่องถัดไปเป็นช่องคำตอบ → `m` → ปุ่มเปิดแป้น ตรงตาม
ข้อกำหนด

ผล physical UAT ของ iPhone และ Windows ในรอบ `r4` ยังเป็นหลักฐานการค้นพบที่มีค่า
แต่ไม่ถูกยกมาเป็นผลผ่านของ `r5` เพราะตำแหน่งหน่วยเป็น UI ร่วมที่เปลี่ยนบนทุกขนาดจอ
จึงคืน iPhone, iPad และ Windows responsive suite เป็น `pending` เพื่อ spot retest
candidate เดียวกัน ส่วน Mac และ suite ระบบจริงอื่นยังคง `pending` ตามเดิม

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
