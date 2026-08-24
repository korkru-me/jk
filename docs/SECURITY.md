# Security และ privacy guardrails

อัปเดตล่าสุด: 18 สิงหาคม 2026

KorKru จัดการข้อมูลนักเรียนและอาจเกี่ยวข้องกับผู้เยาว์ ความปลอดภัยและความเป็นส่วนตัวเป็นเงื่อนไขของความถูกต้อง ไม่ใช่งานเก็บรายละเอียดภายหลัง

## ข้อมูลที่ต้องปกป้อง

- Identity: ชื่อ อีเมล รูปโปรไฟล์ รหัสนักเรียน
- Education records: ห้องเรียน งาน คำตอบ คะแนน feedback และประวัติ attempt
- Contact/family: ที่อยู่ เบอร์โทร ผู้ปกครอง และข้อมูลครอบครัว
- Health/wellbeing: แพ้อาหาร โรคประจำตัว ความเครียด พฤติกรรม และบันทึกครู
- Credentials/secrets: session, invite/access codes, anon/service keys และ OAuth data

ห้ามบันทึกข้อมูลเหล่านี้ใน console/log/analytics โดยไม่จำเป็น ห้ามใช้ข้อมูลจริงใน fixture, screenshot หรือ prompt ภายนอกโดยไม่ได้รับอนุญาต

## Authorization model

- Browser UI ไม่ใช่ security boundary
- ทุก mutation ต้องยืนยัน session และสิทธิ์ต่อ resource ฝั่ง server
- RLS ต้องป้องกัน direct API access แม้ client ถูกดัดแปลง
- `org_id`, classroom membership, ownership และ co-teacher permission ต้องตรวจตาม action
- การดูข้อมูลนักเรียนต้องจำกัดตามวัตถุประสงค์ ไม่ใช่เพียงอยู่ organization เดียวกัน
- แยก system admin, organization admin, classroom admin และ super admin ให้ชัด

## Supabase admin client

`createAdminClient()` ข้าม RLS และเป็นจุดเสี่ยงสูง:

- ใช้ได้เฉพาะ server-only code
- ห้ามส่ง service role key หรือ admin client ไป browser
- ตรวจผู้ใช้ด้วย session ก่อน แล้วตรวจ ownership/membership/permission อย่างชัดเจน
- จำกัด query ด้วย resource ID และ tenant ที่ตรวจแล้ว
- อย่าใช้ admin client เพียงเพื่อทำให้ query ที่ติด RLS “ผ่าน”

## RLS และ multi-tenancy

- ห้าม disable RLS หรือเพิ่ม policy แบบกว้างเพื่อแก้ปัญหาชั่วคราว
- ทดสอบ positive และ negative cases ด้วยผู้ใช้คนละ organization
- ตรวจ recursion/SQL helper ด้วย `SECURITY DEFINER`, fixed `search_path` และสิทธิ์ execute ที่เหมาะสม
- field ที่ใช้ใน RLS บ่อยต้องมี index ที่เหมาะสม
- การแชร์ต้องเป็น explicit relation/visibility ไม่แก้ ownership boundary

## Migrations

- ตรวจสถานะ migration ของฐานข้อมูลจริงก่อนเขียน
- ห้ามแก้ migration ที่ apply แล้วเพื่อเปลี่ยน production
- migration ที่แตะ policy/role/function ต้องผ่าน review เป็นพิเศษ
- รักษา backward compatibility ระหว่างช่วง deploy code และ schema
- อย่าใส่ secret หรือข้อมูลผู้ใช้จริงใน SQL

## Grading integrity

- random values และ correct answer ต้องตรึงต่อ attempt
- server ต้องบังคับเวลา attempts และ access code ไม่พึ่ง client
- การแก้คะแนนต้องตรวจสิทธิ์ เก็บผู้แก้ และเวลา
- score rescaling และ attempt strategy ต้องให้ผลเหมือนกันทุกหน้าที่อ่านคะแนน
- ห้ามให้นักเรียนอ่านเฉลยก่อนนโยบาย `show_results` อนุญาต

## Uploads และ exports

- ตรวจ MIME type, ขนาด และจำนวนไฟล์ฝั่ง server/storage policy
- ใช้ชื่อไฟล์และ path ที่ไม่เปิดเผยข้อมูลเกินจำเป็น
- จำกัดการอ่านไฟล์ตาม owner/classroom/assignment
- ระวัง orphan files เมื่อแก้หรือลบ resource
- Export ต้องตรวจผู้ขอและข้อมูลทุกแถวก่อนสร้างไฟล์
- PDF/CSV/รูปที่ส่งออกอาจมีข้อมูลส่วนบุคคล ต้องไม่ใช้ public URL ถ้าไม่จำเป็น
- ผลวิจัยระดับบุคคลและแท็บข้อมูลที่ใช้ต้องตรวจสิทธิ์จัดการโครงการก่อน query; pagination/filtering ทำฝั่ง server และไม่ส่ง roster ทั้งโครงการเข้า Client Component เมื่อผู้ใช้ดูเพียงหน้าปัจจุบัน

## Logging และ errors

- ห้าม log access code, token, service key, คำตอบเต็ม, health/family notes หรือข้อมูลผู้ปกครอง
- ส่งข้อความทั่วไปให้ผู้ใช้และเก็บรายละเอียดเฉพาะ server log ที่ควบคุมสิทธิ์
- อย่าแสดง SQL, table policy หรือ stack trace แก่ผู้ใช้

## Billing

- ห้ามเชื่อ client ว่าผู้ใช้ชำระแล้ว
- entitlement ต้องตรวจจาก server-side source of truth
- webhook ต้องตรวจ signature และทำงานแบบ idempotent
- ห้ามเก็บข้อมูลบัตรเอง
- pricing UI ปัจจุบันเป็นต้นแบบ ไม่ใช่ระบบชำระเงินจริง

## Compliance claims

ห้ามประกาศว่า KorKru “เป็นไปตาม PDPA”, “เข้ารหัสครบ”, “ได้ ISO 27001”, “มี SSO/SLA” หรือข้ออ้างคล้ายกันเพียงเพราะผู้ให้บริการ infrastructure มีคุณสมบัติบางอย่าง ต้องผ่านการตรวจระบบ กระบวนการ สัญญา และกฎหมายก่อน

## ก่อนเปิดให้ผู้ใช้จริง

- สรุป authority matrix และ data-retention policy
- ทำ threat model สำหรับ auth, tenant isolation, exam integrity, uploads และ exports
- ทดสอบ RLS แบบ automated ด้วยหลายบทบาท
- ตรวจ storage policies และ public URLs
- เพิ่ม audit ที่เชื่อถือได้สำหรับ privileged actions
- ทำ backup/restore และ incident-response procedure
- ตรวจ privacy notice, consent และการจัดการข้อมูลผู้เยาว์กับผู้เชี่ยวชาญที่เกี่ยวข้อง

เอกสารนี้เป็น engineering guardrail ไม่ใช่คำรับรองทางกฎหมาย
