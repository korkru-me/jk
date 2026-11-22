# ประเมินสอบดาราศาสตร์ 80 คน × 40 ข้อ แบบอ่านอย่างเดียว

ตรวจ 22 พฤศจิกายน 2026 ประมาณ 22:40 น. Asia/Bangkok อ้างอิง Ready Production fb8e0665fcd8cbcf00c0c8e4b9e3f8f4c29f3e4f / dpl_XPff6FGSWgTqMKvZJgVTmaHqfa1w ผู้ใช้ห้ามทดสอบเพิ่ม รอบนี้อ่าน source, Usage dashboards และ aggregate SQL เท่านั้น ไม่มีการสมัคร/เริ่มสอบ/ส่งคำตอบ/heartbeat จำลอง ไม่มี code/config/schema changes หรือ migration

## สิ่งที่ต้องจัดการก่อนเริ่ม

- ข้อสอบแบบทดสอบคัดเลือกนักเรียนเข้าค่ายดาราศาสตร์ ปี 2569 ยัง status=closed; readSubmissionEntry รับเฉพาะ published จึงเริ่มไม่ได้จนเผยแพร่ รอบเวลาจริง 23 พ.ย. 16:30–18:30 น. ไทย; duration 60 นาที ยังไม่แก้ค่า
- เชื่อมห้องหนึ่งห้อง มี roster ปัจจุบัน 82 บัญชี แต่ไม่ยืนยันว่าเป็นบัญชีของผู้ที่จะสมัครใหม่พรุ่งนี้ สมัครแล้วต้องเข้าห้องด้วยบัญชีนั้น studentHasAssignment ใช้ auth user ID/สมาชิกห้องจริง ไม่จับคู่จากชื่อหรือรหัสนักเรียนโดยอัตโนมัติ

## ภาระตามโค้ด ไม่ใช่ผลทดสอบโหลด

hooks/use-exam-proctor.ts เปิดใช้อยู่ตาม proctoring_enabled=true: heartbeat ทุก 15s แม้ไม่มี events => 80×3600/15 = 19,200 Server Actions/60 นาที บวกตอบครั้งเดียวต่อข้อ 80×40 = 3,200 autosave => สองส่วนรวม 22,400 calls หรือ 6.22/s เฉลี่ย แต่สามารถกระจุกเป็นกลุ่มทุก 15 วินาที ไม่รวม start/submit/signup/join/SSR/proxy/events/retries/แก้คำตอบ/ครู

แต่ละ heartbeat ตรวจ getUser + อ่าน submission/assignment + RPC; saveAnswer ตรวจ getUser + อ่านสิทธิ์/สถานะ/answer + update จึงประมาณ 67,200 Supabase HTTP calls จากสองส่วนหลักเมื่อทุกครั้งสำเร็จ เป็นคนละหน่วยกับ SQL queries/RPC work และ Vercel invocations

เริ่มสอบสร้าง 80 headers + 3,200 answer rows โดย batch insert answers ต่อคน; submit flush ก่อนส่ง, freeze/commit_grade เป็น RPC ธุรกรรมต่อคน ไม่ใช่ 40 network writes ต่อใบ ตรวจ MCQ ในเซิร์ฟเวอร์ ไม่เรียก AI คุมสอบใช้ advisory lock ต่อ submission ไม่ใช่ lock ทั้งห้องพร้อมกัน

Autosave debounce 500ms เฉพาะข้อเปลี่ยน มี per-answer queue/localStorage backup และ network retry สูงสุด 3 tries; manual submit ไม่ดำเนินต่อถ้า flush ไม่ผ่าน แต่หลังหมดเวลา save ถูกปฏิเสธและ automatic finalization อ่าน DB สำเนาในเครื่องจึงไม่รับประกันกู้คำตอบที่ยังไม่ถึง DB หลังเส้นตาย เน็ตใกล้หมดเวลายังเป็นความเสี่ยงสำคัญ

นักเรียนคุมสอบส่ง HTTP ไม่เปิด Realtime socket ต่อคน จอครูใช้ postgres_changes สามตาราง Free 100 messages/s และ 200 concurrent sockets; burst ตอนเริ่ม/ส่งอาจทำจอสดสะดุด แต่มี fallback snapshot 15s / live reconcile 60s การสะดุดจอคุมสอบไม่ใช่หลักฐานว่าคำตอบหาย

## โควตาที่อ่านจริง

Vercel Hobby Usage รวมทีม Last 30 Days ตาม UI (23 ต.ค.–22 พ.ย.):
- Function invocations 145,913/1,000,000 เหลือ 854,087
- Fluid Active CPU ประมาณ 1h40m/4h เหลือประมาณ 2h20m ตัวเลขปัดเศษ ควรติดตามก่อนรายการอื่น
- Provisioned memory 8.7/360 GB-h
- Fast data transfer 1.24/100 GB; Origin 837.14 MB/10 GB

Supabase All projects รวม Staging รอบ 26 ต.ค.–26 พ.ย.:
- Egress .436/5 GB เหลือประมาณ 4.564 GB; cached .418/5 GB แยกโควตา
- MAU 238/50,000 (อัปเดตล่าช้าได้ 24h)
- Realtime peak 1/200, messages 0/2,000,000 ตามยอด dashboard ซึ่งอาจล่าช้า
- Storage .051/1 GB เป็น average in period ไม่ใช้แทนพื้นที่ว่างปัจจุบัน
- Production database SQL 111,570,067 bytes; dashboard 120.81 MB เป็น snapshot ต่างเวลา ไม่รวมกัน ยังห่างเพดาน .5 GB
- Log ingestion .649/1 GB ปัจจุบันระบุ grace ถึงต้นปี 2027 ไม่ใช้เป็นเหตุอัปเกรดเพื่อสอบ

SQL ยืนยัน question_ids 40, mcq 40, ข้อความ/ตัวเลือก/URL รวม 31,187 bytes, image_urls ไม่มีรูปและไม่มี http(s) URLs ในข้อความ/ตัวเลือก ส่วนนี้×80≈2.5 MB ก่อน HTTP/HTML/JS/fonts/คำขอซ้ำ ไม่ใช่ transfer จริง จึงเสี่ยง egress ต่ำ

Sensitivity ของ CPU สำหรับ 22,400 calls หลัก: ถ้าใช้ Active CPU 50ms/call =>18.7 นาที, 100ms=>37.3 นาที, 500ms=>3h6m กรณีหลังเกินส่วนที่เหลือ ทั้งหมดเป็นสมมติฐาน ไม่ใช่ค่า CPU ของข้อสอบที่วัดไว้ เวลารอ DB ไม่คิด Active CPU แต่ยังเพิ่ม latency/memory duration ตามเอกสาร Vercel

## ข้อสรุปและแนวทาง

ยังไม่เห็นเหตุจำเป็นต้องอัปเกรดจากโควตาที่เหลือ ความเสี่ยงหลักคือสถานะ/เวลา/สมาชิกห้อง, DB/Auth latency ช่วงกระจุก และเน็ตหลุดก่อนเส้นตาย ยังไม่มี full-exam load evidence สมัคร Staging 80/80 จากรอบก่อนเป็นหลักฐานเฉพาะ Auth/session

ควรให้สมัคร/เข้าห้องล่วงหน้า 15–30 นาที ตรวจเวลา/เผยแพร่ข้อสอบ เปิดจอครูเท่าที่จำเป็น นักเรียนใช้แท็บเดียว ส่งเมื่อเสร็จโดยเหลือ 1–2 นาที ตรวจคำตอบรอ sync และใบยืนยัน ไม่รอหมดเวลาพร้อมกัน โควตา Supabase รอบนี้ไม่ reset พรุ่งนี้; Vercel Hobby ไม่ใช่ reset ทุกเที่ยงคืน GitHub ไม่อยู่ใน request path ตอนสอบ

## แหล่งข้อมูล / handoff

- Source: hooks/use-answer-autosave.ts, hooks/use-exam-proctor.ts, lib/actions/submissions.ts, lib/actions/exam-proctor.ts, lib/exam-write-access.ts, lib/submission-finalization.server.ts, lib/auth/assignment-access.ts, lib/exam-taking.ts, proctor-dashboard.tsx
- https://vercel.com/korkru-mes-projects/~/usage
- https://supabase.com/dashboard/org/iybmtxdhntfpilixlfxk/usage
- https://vercel.com/docs/functions/usage-and-pricing
- https://vercel.com/docs/plans/hobby
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/platform/manage-your-usage/egress

Branch codex/exam-capacity-auth-20261122: assessment documentation only. ไม่รันเว็บ/โหลด/ข้อสอบ/แอป tests เพิ่มตามคำสั่ง ตรวจเฉพาะความสมบูรณ์ของรายงาน; Canvas TS ผ่าน; ไม่มี migrations หรือ blockers ด้านการอ่านข้อมูล เหลือการเผยแพร่ข้อสอบ/ตรวจเวลา/เข้าห้องก่อนสอบโดยเจ้าของ ไม่เปลี่ยนให้ในงานประเมินนี้
