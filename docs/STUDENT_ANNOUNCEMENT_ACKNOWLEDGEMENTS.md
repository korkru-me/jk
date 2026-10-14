# การรับทราบประกาศห้องเรียน

14 ตุลาคม 2026 · source และ localhost preview · ยังไม่เปิดใช้ฐานข้อมูลจริง

## พฤติกรรม

- นักเรียนที่เข้าหน้าเว็บใหม่จะเห็นประกาศที่ยังไม่กดรับทราบจากห้องเรียนที่ตนเป็นสมาชิกและยัง active เท่านั้น แสดงธีม/ชื่อห้อง ผู้ประกาศ เวลาเดิม ปักหมุด เวลาที่แก้ไขหรือแจ้งเตือนซ้ำ ข้อความ ลิงก์ และไฟล์แนบ
- กดรับทราบทีละประกาศ บันทึกสำเร็จแล้วจึงไปประกาศถัดไป ถ้าเกิด error จะคงประกาศและไม่เพิ่มจำนวนรับทราบ “ไว้ภายหลัง” ไม่บันทึก receipt และประกาศยังเด้งเมื่อเข้ามาใหม่ คลิกนอก/Escape/ปิดใช้คำยืนยันก่อนพักคิว รูปขยายเป็น popup อ่านอย่างเดียวและไม่ทำให้ประกาศหลักปิด
- ครูเห็น “รับทราบแล้ว X/Y คน” และรายชื่อที่ยังไม่รับทราบ ปุ่ม BellRing ต้องยืนยันก่อนเริ่มรอบใหม่ นักเรียนทุกคนต้องรับทราบใหม่ในรอบนั้น แม้รับทราบรอบก่อนแล้ว; การปักหมุดหรือแก้ข้อความไม่ใช่การแจ้งเตือนซ้ำ
- ประกาศเก่าที่เคยอยู่บนหน้าจอไม่ถูกถือว่ารับทราบ: `post_reads` เก็บ legacy sighting เดิม ไม่ backfill ไป receipt ใหม่ ดังนั้นเมื่อเปิดฟีเจอร์ครั้งแรก ประกาศเก่าของห้อง active จะให้กดรับทราบด้วย

## ขอบเขตข้อมูลและความปลอดภัย

- Migration `20261014053207_classroom_announcement_acknowledgements.sql` เพิ่ม state ของรอบต่อ post และ receipt ต่อ `(post, student, round)` แยกจากตารางเดิม ประวัติ receipt รอบก่อนยังอยู่; ลบ post/user แล้ว cascade ตามเจ้าของข้อมูล
- ตารางใหม่เปิด RLS และถอนสิทธิ์ตรงจาก PUBLIC/anon/authenticated ไม่มีการเปิด policy กว้าง ทุก RPC เป็น SECURITY INVOKER, fixed empty search_path และ execute เฉพาะ service_role
- Server action อ่าน actor จาก verified session เท่านั้น RPC ตรวจ role และ roster หรือสิทธิ์เจ้าของ/co-teacher admin/manage ของห้องที่ระบุซ้ำ ก่อนส่งข้อมูลหรือเขียนอะไร ไม่มี global-admin override ห้องของคนอื่น
- Ack และ resend ล็อก post แถวเดียวกันเพื่อเรียงลำดับ transaction Ack จาก popup รอบเก่าถูกปฏิเสธด้วย 40001; ย้ำรับทราบรอบเดิมเป็น idempotent และคงเวลาครั้งแรก คนที่ออกจากห้องไม่อยู่ใน pending feed และไม่ถูกนับใน roster ปัจจุบัน ห้อง archived รับทราบ/แจ้งใหม่ไม่ได้
- Payload นักเรียนไม่มีรายชื่อผู้รับทราบคนอื่น ไฟล์แนบในข้อมูลจริงผ่าน sanitizer ของ Storage host/bucket เดิมก่อนเข้า client ข้อความยังเป็น plain text ไม่ใช้ HTML ที่ครูป้อน

## ก่อนเปิดใช้

1. จัดประวัติ migration ให้ตรงกันก่อนตาม AGENTS.md ไม่มีการ db push หรือ repair/revert ประวัติจากงานนี้ ผล audit ก่อนสร้างไฟล์ใหม่: linked Production มี local-only เดิม 12 รายการ และ Staging มี remote-only `20261009142610` ซึ่งไม่มีไฟล์ใน checkout นี้
2. ตรวจและ apply **เฉพาะ migration ใหม่นี้** กับ Staging หลัง baseline ตรงกัน ทดสอบ Data API/Auth ด้วยบัญชีสังเคราะห์ owner, manager, view co-teacher, นักเรียนสองห้องและคนละองค์กร รวม concurrent ack/resend บน connection แยก ตรวจ advisors และ grants/RLS หลัง apply
3. เปิด server flag `CLASSROOM_ANNOUNCEMENT_ACKNOWLEDGEMENTS=true` เฉพาะ environment ที่ schema และ integration checks ผ่านแล้ว ค่าเริ่มต้นปิด เมื่อปิดไม่มีการอ่าน/เขียนตารางหรือ RPC ใหม่ และหน้าครูยังแสดง legacy “เห็นแล้ว” ตามข้อมูลเดิม
4. การเปิด Production ต้องรวมในรอบปล่อยจริงที่เจ้าของอนุมัติภายหลัง ไม่มีการเปลี่ยน env/credential หรือ apply/deploy/push จากรอบนี้

## หลักฐานในเครื่อง

- PGlite ทดสอบ migration/RPC จริงด้วยข้อมูลสังเคราะห์: ไม่ย้าย sighting เก่า, explicit/idempotent ack, รอบใหม่และ stale ack, owner/manager/foreign/view/student permission, ออกจากห้อง, archived room และสิทธิ์ตรงของ anon/authenticated การทดสอบ connection เดียวไม่แทน Staging concurrent test
- `/exam-screen-lab/announcement-acknowledgements` ใช้ component จริงกับ callbacks จำลอง สถานะใน sessionStorage มีเฉพาะรอบ/receipt ของ fixture ไม่เคยเรียก action บัญชีจริง; `?scenario=error` ให้ครั้งแรกไม่สำเร็จเพื่อพิสูจน์ว่า popup และจำนวนไม่เปลี่ยน
- Browser ตรวจรับทราบครบ/โหลดใหม่ไม่เด้ง, ครูแจ้งใหม่/รับทราบใหม่, พักคิว/กลับมาใหม่, คลิกนอก/ย้อนกลับไปอ่าน, รูปขยายซ้อนและ Escape, mobile/light/dark การใช้ SQL ใน hosted Staging และ advisors ยังไม่รันเพราะ migration baseline ไม่ตรง

## Staging rollout · 14 ตุลาคม 2026

เจ้าของอนุญาตเฉพาะ Staging แล้ว คืนไฟล์ `20261009142610_atomic_seb_exam_start.sql` จาก `supabase migration fetch --project-ref` ในโฟลเดอร์ชั่วคราว ประวัติ baseline ตรงกันแล้ว จึง apply เฉพาะ migration ใหม่รับทราบประกาศ/รูปโปรไฟล์ ไม่มี repair/revert หรือรัน SQL เก่าซ้ำ และไม่เปลี่ยน Production.

พบใน Data API จริงว่า SQLSTATE `40001` ของ stale application round ทำให้ PostgREST 14 retry ไม่สิ้นสุดตาม Supabase troubleshooting จึงเพิ่ม migration `20261014071012_announcement_round_conflict_response.sql` เปลี่ยนเฉพาะกรณีนี้เป็น `PT409`/HTTP 409 ไม่เปลี่ยน transaction locking หรือ grants เดิม ไฟล์ migration ที่ apply แล้วไม่ถูกแก้ PGlite รันทั้ง baseline และ follow-up และ server action รองรับโค้ดทั้งสองระหว่าง rollout.

Advisors ของสองตาราง receipt เป็น INFO `rls_enabled_no_policy` ตามการออกแบบ server-only: เปิด RLS พร้อม REVOKE browser grants และ RPC execute ไม่ใช่การเปิด read/write สาธารณะ ตรวจ grant/negative API จริงอีกครั้งก่อนถือว่าใช้งานได้ รายละเอียดแนวทาง [Supabase SQLSTATE 40001](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

ผล Staging: migration baseline/follow-up ตรงกัน, RLS enabled, browser table/RPC grants=false และ invoker RPC service grant=true. `scripts/qa/student-profile-announcements.mjs` ทดสอบผ่าน real Auth/concurrent ack+resend/roster+permission negative/Storage denial ด้วยข้อมูลจำลอง; Chrome ทดสอบครูกดแจ้งซ้ำจาก 1/1 เป็น 0/1 และ popup นักเรียนเด้งใหม่แล้ว การบันทึกรูปใหม่กับค่า audience ตรวจใน environment เดียวกัน มีคำสั่ง cleanup เฉพาะ UUID ใน manifest; Production flag ยังปิดและเจ้าของให้เก็บทั้งหมดไว้ปล่อยพร้อมเว็บจริง.

Cleanup ของรอบนี้ตรวจครบ: fixture users/rooms/organizations และ avatar objects เหลือ 0 พร้อมล้างเฉพาะ state ของ browser QA/ไฟล์คีย์ชั่วคราว ไม่ลบหรือเปลี่ยนข้อมูล Staging ที่มีอยู่ก่อน.
