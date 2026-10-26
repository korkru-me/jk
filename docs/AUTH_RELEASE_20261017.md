# แผนปล่อยระบบบัญชี — 17 ตุลาคม 2026

สถานะล่าสุด 26 ตุลาคม: PR #57 เผยแพร่ระบบบัญชีแล้ว และ PR #76 เผยแพร่ recovery feedback แล้ว SMTP/แม่แบบกู้รหัสผ่านใช้จริงและมีผลทดสอบเดิมตาม [SMTP_PRODUCTION_RELEASE_20261020.md](SMTP_PRODUCTION_RELEASE_20261020.md) Google/การเปลี่ยน Confirm email ยังพักไว้ตามเจ้าของ ส่วน signup feedback รอบถัดไปติดตาม [AUTH_FEEDBACK_RELEASE_20261026.md](AUTH_FEEDBACK_RELEASE_20261026.md) ข้อความด้านล่างเป็นประวัติเตรียมรุ่น 17 ตุลาคม ไม่ใช่รายการที่ต้อง apply/deploy ซ้ำ

ประวัติ checkpoint ก่อนปล่อย (ถูกแทนที่โดยสถานะล่าสุดข้างต้น): **Staging deploy และตรวจ Auth/Data smoke แล้ว; Production prerequisites ครบ แต่ยังไม่ deploy รุ่นนี้** เจ้าของอนุมัติการปล่อย Staging → Production พร้อม secret/migration/URL/current-password policy แล้ว การสมัคร Resend ยังพักไว้ การเปิดความสามารถที่ต้องใช้ SMTP/Google จริงต้องรายงานแยกจากการนำโค้ดขึ้นเว็บ

## Source และขอบเขต

- Release branch: `codex/auth-production-release-20261017` เริ่มจาก Production `origin/master` ที่ `e1ccfc0`
- Cherry-pick งานแชท 13 commits โดยไม่รวมสาม commits ประวัติ/synchronization ก่อนหน้า พร้อม release fixes ที่ตรวจต่อเนื่องจนถึง candidate `a83ecfc`
- รวมหน้า signup/login/ยืนยันอีเมล/เอกสารติดต่อและนโยบาย, การเปลี่ยนรหัสครูและนักเรียน, โค้ดเชื่อมวิธีเข้าใช้บัญชีเดียวกัน, recovery safeguards, quota alerts และขนาดแบรนด์บนหน้าบัญชี
- ไม่รวม `20261009142610_atomic_seb_exam_start.sql` และไม่เปิด native SEB เพิ่ม ไม่แก้ไฟล์งาน local ที่พักไว้นอก release นี้

## สิ่งที่ตรวจแล้ว

- Full unit suite ผ่าน 3,657 cases; TypeScript, token lint และ production webpack build ผ่าน รวม error mapping ของ provider สำหรับ `current_password_invalid`/`current_password_mismatch`/`current_password_required`
- Node.js ของ Vercel project `jk` เป็น 24 ซึ่งผ่านข้อกำหนด Node ≥22 ของ `svix@2.8.0`
- Production ปัจจุบันยังเป็น deployment **Ready ของ `master` `e1ccfc0`** ไม่ใช่ release ใหม่นี้
- Staging deployment `dpl_JAPz9zrcyqafBcDDKpLaBH5jKKvz` เป็น **READY** ที่ SHA `aa21bd53547709808ea1daefcb2b992a3fb69460`; ไฟล์ auth/app ตรงกับ release `a83ecfc` ความต่างที่เหลือเป็นประวัติ QA/docs ของ Staging
- Hosted Staging Auth/Data smoke **ผ่าน 43 รายการ ไม่ผ่าน 0 รายการ**: บัญชีครู/นักเรียนสังเคราะห์คง ID/role/profile หลังเปลี่ยนรหัส, รหัสปัจจุบันผิดถูกปฏิเสธ, isolated verifier ไม่แทน session เดิม, รหัสใหม่เข้าได้และรหัสเก่าเข้าไม่ได้; limiter สี่คำขอพร้อมกันอนุญาตหนึ่ง/ให้รอสาม และ anon/authenticated เรียกไม่ได้
- Cleanup ยืนยัน `sessions`, `authUsers`, `publicProfiles`, `organizations`, `limiterBuckets` เป็น `true` ครบ
- Hosted `/login`, `/signup`, `/terms`, `/privacy`, `/contact` ตอบ HTTP 200 ครบ มีป้าย STAGING และ SHA ตรงกับ deployment ทุกหน้า; login/signup แสดงโลโก้กวางขนาดใหญ่
- **ยังไม่ได้ยืนยัน hosted Next ServerAction E2E, SMTP/อีเมลจริง หรือ Google จริง** ผล Auth/Data API, public-page smoke และ local/mock ไม่ครอบคลุมการทดสอบเหล่านี้ รายละเอียดอยู่ใน `AUTH_SIGNUP_ROLLOUT.md` และ `ACCOUNT_SIGN_IN_METHODS.md`

## Hosted configuration ที่อ่านพบ

ค่าต่อไปนี้เป็น snapshot ก่อนเริ่มเตรียมระบบในรอบ release:

- **Production:** Site URL เป็น `http://localhost:3000` และ redirect allowlist เป็น localhost; email autoconfirm เปิด, Google provider ปิด, ไม่มี custom SMTP และ Require current password ปิด
- **Staging:** Site URL เป็น `https://staging.korkru.com`, ต้องยืนยันอีเมล, Google provider ปิด, ไม่มี custom SMTP และ Require current password ปิด

การไม่มี custom SMTP ไม่ใช่หลักฐานว่าอีเมลบัญชีส่งถึงผู้ใช้ทั่วไปได้ การเข้าสู่ระบบ Google ยังต้องตั้ง provider ให้พร้อม ไม่ถือว่าปุ่มหรือโค้ดที่ deploy แล้วแปลว่าบริการภายนอกเปิดใช้งานแล้ว

หลังเตรียม release ยืนยัน Production Site URL/redirects เป็น canonical `https://www.korkru.com` และ Require current password เปิดแล้ว โดยคง email autoconfirm เปิดและ Google provider ปิด; Staging เปิด Require current password เช่นกัน

## แผนฐานข้อมูลเฉพาะงานนี้

มี migration ใหม่ที่วางแผนปล่อยเพียงไฟล์เดียว: `20261017111034_auth_email_request_limits.sql` สำหรับ HMAC email/IP counters, service-only RPC/grants, RLS และ cleanup ของ counters ไม่มีการเปลี่ยน profile/role/ownership หรือข้อมูลการเรียน

Production ยังมี backlog SEB เดิม 13 รายการ และ Staging ยังมีความต่างของ retention migration `20261015132234` ต้องบันทึก/ตรวจ ledger ของเป้าหมายจริงก่อนดำเนินการ ไม่ใช้ broad `db push`, ไม่ replay backlog, ไม่แก้ไฟล์ migration ที่ apply แล้ว และไม่ rewrite ประวัติเพื่อทำให้ตัวเลขตรงกัน การปล่อยรอบนี้ไม่รวมการสะสาง backlog เหล่านั้น

สถานะ migration ใหม่ ณ checkpoint นี้: **Staging และ Production apply SQL ของไฟล์นี้และ record เฉพาะ version 20261017111034 แล้ว** Production catalog ยืนยัน RLS เปิด, anon/authenticated อ่านตารางไม่ได้, service role insert ได้, ทั้งสอง RPC เป็น invoker และให้ execute เฉพาะ service role; cleanup schedule `17 * * * *` เปิดใช้งาน ไม่เปลี่ยน version เก่า ผล Auth/Data runtime บน Staging อยู่ในรายการที่ตรวจแล้วข้างต้น

ยืนยัน `AUTH_FLOW_SECRET` แบบ sensitive คนละค่าสำหรับ Vercel Production และ Preview เฉพาะ `staging` พร้อม Google linking/Resend flags เป็น false และ tier Production แล้ว ไม่บันทึก secret ใน Git หรือรายงานผล การทดสอบ Staging พบรหัสปฏิเสธจริง `current_password_invalid` (HTTP 400) จึงรองรับใน error mapping ด้วย

## ประวัติขั้นตอน Production ก่อน release

1. เปิดและ merge PR ผ่าน workflow ของ `master` โดยคงขอบเขต release ที่ตรวจแล้ว
2. รอ Production deployment เป็น Ready ตรวจ SHA และ alias จริง
3. ทำ public smoke test แบบอ่านอย่างเดียว แล้วบันทึกผล Production แยกจาก Staging

Counter schema และ `AUTH_FLOW_SECRET` ต้องพร้อมก่อนแอปรุ่นใหม่ เพราะ email actions จะ fail closed หากขาด dependency นี้ ทั้ง signup/ส่งซ้ำ/ลืมรหัส/ขอตั้งรหัสจาก settings; prerequisites เหล่านี้ยืนยันแล้วตามข้างต้น

## ค่าที่จะรักษาระหว่างการปล่อยโค้ด

- คง **Production email autoconfirm เปิด** เพื่อรักษาการสมัครเดิมจนเจ้าของกลับมาตั้ง SMTP ไม่อ้างว่าผู้สมัคร Production ต้องกดลิงก์ยืนยันอีเมลแล้ว Staging ยังคงต้องยืนยันอีเมล
- คง `GOOGLE_ACCOUNT_LINKING_ENABLED=false` และ `RESEND_QUOTA_ALERTS_ENABLED=false` ไม่เปิด Supabase Manual Linking ไม่สมัคร Resend/ตั้ง DNS/เปิด quota webhook ในรอบนี้
- อย่าเปิด CAPTCHA enforcement เพราะยังไม่มี widget/token ครบทุก flow การป้องกันในแอปไม่บังคับ direct Supabase Auth API ทุกเส้นทาง
- SMTP จริง, Google provider/client ID/origins, collision/email-change race และการเข้าได้สองวิธีด้วย user ID เดิมยังรอตั้งค่า/ทดสอบก่อนเปิดฟีเจอร์เหล่านั้น รายละเอียด setup แยกใน `ACCOUNT_SIGN_IN_METHODS.md` และ `RESEND_SETUP.md`

## ข้อจำกัดและการกู้คืน

Recovery รุ่นใหม่ต้องมี intent/nonce จากอีเมลและ PKCE ในเบราว์เซอร์ที่ขอ ลิงก์ recovery เก่าที่ไม่มี nonce ต้องขอใหม่ การล้าง cookie ไม่ใช่ atomic replay ledger และ global sign-out ไม่ยกเลิก JWT เดิมทันที การส่งอีเมลจริงยังไม่ถือว่าผ่านจนทดสอบ SMTP แล้ว

หาก deploy ไม่พร้อมให้ย้อน deployment แอปตามขั้นตอนของ Vercel พร้อมพิจารณาค่าที่เปลี่ยนเป็นชุดเดียวกัน เก็บ additive counter schema ไว้ก่อน ไม่ลบตารางหรือแก้ ledger เพื่อ rollback โค้ด และไม่ใช้การแก้ข้อมูลบัญชีจริงเป็นการทดสอบ
