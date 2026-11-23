# Production incident: อ่าน log ระหว่างสอบ 23 พฤศจิกายน 2026

ผู้ใช้ส่ง Vercel logs และ Supabase Auth logs พร้อมสถานะ Unhealthy อนุญาตตรวจแบบอ่านอย่างเดียว งานนี้ไม่ทดสอบโหลด ไม่ restart/upgrade/deploy/config/schema/data mutation

## หลักฐาน

- Supabase project metadata ประมาณ16:56ไทย: ACTIVE_HEALTHY เป็นสถานะโครงการรวม ไม่ใช่หลักฐานว่าทุกบริการตอบได้
- Health advisors observed_at2026-11-23T09:58:46.696Z (16:58:46ไทย): Auth error rate46.75% of154requests และ Data API10.12% of405requests จากสองช่วง5นาทีต่อเนื่อง เป็นสัดส่วนคำขอ ไม่ใช่สัดส่วนนักเรียน
- bounded unified-log window2026-11-23T09:25Z–10:00Z (16:25–17:00ไทย): API Gatewayมากกว่า22krecords; auth_logsประมาณ3krecords (ต่างจำนวนเพราะคนละชั้น ไม่รวมกันเป็นจำนวนผู้ใช้)
- Gateway /auth/v1/user 504493ครั้ง +50357; /auth/v1/token504461 +50342; users/classroom_students/notifications/submissionsและเส้นทางอื่นมี503/504ด้วย
- Auth service logมี context deadline exceeded, error finding user/session/refresh token: context canceled และเชื่อมต่อPostgreslocalhost:5432ไม่ทัน หลักฐานชี้ database access/service latency ต้องตรวจ compute/memory/connections/queriesต่อ ยังไม่ยืนยันCPU/RAMหมดหรือconnectionเต็ม
- PostgreSQLSQLSTATE42703 341recordsในหน้าต่างที่เลือก; Supabase UI ยืนยัน column submissions.seb_config_revision does not exist. lib/submission-revision-compatibility.ts ในsourceที่ตรวจมีfallback: read(true)แล้วread(false)เมื่อ42703ของคอลัมน์นี้ จึงไม่สรุป341recordsเป็น341การสอบล้มเหลว หรือเป็นสาเหตุเดียวของ5xx เป็นงานอ่านเพิ่มที่ควรแก้หลังยืนยัน currentrelease/schema
- PostgreSQL23505 34records,57014 3records; แยกจากtimeoutและยังไม่ตีความว่าอีเมล/รหัสผ่านผิดทั้งหมด
- Vercel Runtime Logs pageที่ผู้ใช้ส่ง default Last30minutes16:28–16:58: sidebarError961เป็นจำนวนruntime log records ไม่ใช่จำนวนผู้ใช้หรือคำขอทั้งหมด พบTask timed out after300seconds ใน/login,/dashboard,/classrooms และ /assignments/<exam>/take; AuthRetryableFetchError status504 และdashboardโหลดข้อมูลการเรียนไม่สำเร็จ
- UIขณะอ่านแสดงทั้งVercel teamและSupabase orgเป็นProแล้ว ไม่มีการอัปเกรดโดยเอเจนต์งานนี้ ไม่ควรอ้างเพดานHobby4CPU-hoursเป็นสาเหตุปัจจุบันโดยไม่ตรวจusage
- Supabase Auth UIล่าสุดที่อ่านมี/user200และ/token200ต่อเนื่องราว16:57–17:00เป็นสัญญาณบางคำขอกลับมาสำเร็จ ไม่ใช่ยืนยันฟื้นครบหรือข้อมูลคำตอบครบ

## ข้อสรุปและข้อควรระวัง

Unhealthyเป็นการเสื่อมของบริการจริงจาก5xx/timeout ไม่ใช่แค่แถบquotaเหลือ/เต็มและไม่ใช่หลักฐาน429ที่แก้Authlimitเมื่อวาน จำเป็นต้องดูcompute/memory/pool/query metricsก่อนสรุปการแก้หรือซื้อcomputeเพิ่ม การเพิ่มAuthlimitอย่างเดียวไม่แก้5xxจากDBtimeouts ผลสมัครStaging80/80เดิมครอบคลุมsignup/sessionเท่านั้น

ระหว่างปัญหาให้ผู้สอบคงแท็บเดิมไว้ ไม่logout/ล้างbrowserstorage/รีเฟรชซ้ำ ติดตามสถานะบันทึกและใบยืนยันส่งตามจริง ยังยืนยันความครบถ้วนของคำตอบรายคนจากlogนี้ไม่ได้ ไม่restartหรือdeployฉุกเฉินเองระหว่างสอบโดยไม่มีขอบเขตการแก้ที่ชัดเจน

## แหล่งข้อมูล

- https://vercel.com/korkru-mes-projects/jk/logs?page=2
- https://supabase.com/dashboard/project/libsutfinswqkruihwdx/logs?filter=log_type%3Aeq%3Aauth
- https://supabase.com/dashboard/project/libsutfinswqkruihwdx/advisors/health
- https://supabase.com/docs/guides/platform/troubleshooting (diagnostic guidance: underprovisioned resources/queries/connectionsเป็นไปได้ ไม่ใช่ข้อสรุปเฉพาะproject)
- https://status.supabase.com/ ขณะอ่านแสดงfullyoperational ไม่มีเหตุให้สรุปเป็นoutageทั้งภูมิภาคจากหน้าประกาศ แต่ไม่ตัดความเป็นไปได้ของปัญหาเฉพาะproject

Handoff branch codex/exam-capacity-auth-20261122. Documentation only; ไม่รันtestsหรือmigration ไม่มีการเปลี่ยนไฟล์แอป/ตั้งค่า/ข้อมูลจริง ไม่restart/upgrade ข้อจำกัด: ยังไม่ได้อ่านcurrentCPU/RAM/poolmetrics/pg_stat_activityหรือสอบทานคำตอบรายบุคคล
