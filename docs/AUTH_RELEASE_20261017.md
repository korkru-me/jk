# แผนปล่อยระบบบัญชี — 17 ตุลาคม 2026

สถานะ checkpoint นี้: **เตรียม release source, environment และ counter schema บน Staging แล้ว ยังไม่ deploy รุ่นนี้ขึ้น Production** เจ้าของอนุมัติเฉพาะการเพิ่ม secret/migration/URL/current-password policy แล้ว การสมัคร Resend ยังพักไว้ การเปิดความสามารถที่ต้องใช้ SMTP/Google จริงต้องรายงานแยกจากการนำโค้ดขึ้นเว็บ

## Source และขอบเขต

- Release branch: `codex/auth-production-release-20261017` เริ่มจาก Production `origin/master` ที่ `e1ccfc0`
- Cherry-pick งานแชท 13 commits โดยไม่รวมสาม commits ประวัติ/synchronization ก่อนหน้า Source แอปที่ตรวจใน release `e20540a` ตรงกับ chat head `a2512d1`
- รวมหน้า signup/login/ยืนยันอีเมล/เอกสารติดต่อและนโยบาย, การเปลี่ยนรหัสครูและนักเรียน, โค้ดเชื่อมวิธีเข้าใช้บัญชีเดียวกัน, recovery safeguards, quota alerts และขนาดแบรนด์บนหน้าบัญชี
- ไม่รวม `20261009142610_atomic_seb_exam_start.sql` และไม่เปิด native SEB เพิ่ม ไม่แก้ไฟล์งาน local ที่พักไว้นอก release นี้

## สิ่งที่ตรวจแล้ว

- Full unit suite ผ่าน 286 ไฟล์ / 3,656 cases หลังรองรับ error codes `current_password_mismatch`/`current_password_required` เพิ่มจาก provider; token lint และ production webpack build ของชุดรวมก่อนปรับ error mapping ผ่าน
- Node.js ของ Vercel project `jk` เป็น 24 ซึ่งผ่านข้อกำหนด Node ≥22 ของ `svix@2.8.0`
- Production ปัจจุบันยังเป็น deployment **Ready ของ `master` `e1ccfc0`** ไม่ใช่ release ใหม่นี้
- ผล local/mock เดิมไม่ยืนยันการส่ง SMTP, Google linking หรือ recovery ผ่านอีเมลจริงบน hosted environment รายละเอียดอยู่ใน `AUTH_SIGNUP_ROLLOUT.md` และ `ACCOUNT_SIGN_IN_METHODS.md`

## Hosted configuration ที่อ่านพบ

ค่าต่อไปนี้เป็น snapshot ก่อนเริ่มเตรียมระบบในรอบ release:

- **Production:** Site URL เป็น `http://localhost:3000` และ redirect allowlist เป็น localhost; email autoconfirm เปิด, Google provider ปิด, ไม่มี custom SMTP และ Require current password ปิด
- **Staging:** Site URL เป็น `https://staging.korkru.com`, ต้องยืนยันอีเมล, Google provider ปิด, ไม่มี custom SMTP และ Require current password ปิด

การไม่มี custom SMTP ไม่ใช่หลักฐานว่าอีเมลบัญชีส่งถึงผู้ใช้ทั่วไปได้ การเข้าสู่ระบบ Google ยังต้องตั้ง provider ให้พร้อม ไม่ถือว่าปุ่มหรือโค้ดที่ deploy แล้วแปลว่าบริการภายนอกเปิดใช้งานแล้ว

## แผนฐานข้อมูลเฉพาะงานนี้

มี migration ใหม่ที่วางแผนปล่อยเพียงไฟล์เดียว: `20261017111034_auth_email_request_limits.sql` สำหรับ HMAC email/IP counters, service-only RPC/grants, RLS และ cleanup ของ counters ไม่มีการเปลี่ยน profile/role/ownership หรือข้อมูลการเรียน

Production ยังมี backlog SEB เดิม 13 รายการ และ Staging ยังมีความต่างของ retention migration `20261015132234` ต้องบันทึก/ตรวจ ledger ของเป้าหมายจริงก่อนดำเนินการ ไม่ใช้ broad `db push`, ไม่ replay backlog, ไม่แก้ไฟล์ migration ที่ apply แล้ว และไม่ rewrite ประวัติเพื่อทำให้ตัวเลขตรงกัน การปล่อยรอบนี้ไม่รวมการสะสาง backlog เหล่านั้น

สถานะ migration ใหม่ ณ checkpoint นี้: **Staging apply SQL ของไฟล์นี้และ record version 20261017111034 แล้ว; Production ยังรอ** Catalog ตรวจ RLS เปิด, anon/authenticated อ่านตารางหรือเรียก RPC ไม่ได้, service role เขียนได้, RPC เป็น invoker และมี local counter-cleanup schedule ไม่เปลี่ยน version เก่า การทดสอบ runtime บน Staging ยังอยู่ระหว่างตรวจ

เพิ่ม `AUTH_FLOW_SECRET` แบบ sensitive คนละค่าสำหรับ Vercel Production และ Preview เฉพาะ `staging`, ตั้ง Google linking/Resend flags เป็น false และระบุ tier Production แล้ว ยังไม่หมุนหรือคัดลอก secret เดิม เปิด Require current password บน Staging โดยคง confirmation/Google/provider settings เดิม การทดสอบจริงรอบแรกสร้าง/อ่านบทบาทบัญชีจำลองสำเร็จ แต่หยุดที่การตรวจ wrong-current-password; cleanup users/profiles/personal organizations และ sessions ครบ จึงยังไม่อ้างว่า hosted password verification ผ่าน

## ลำดับ rollout

1. เก็บ release source/แผนนี้เป็น commit ที่ตรวจสอบได้ และตรวจ upstream ของ branch โดยไม่ดึง SEB history กลับเข้ามา
2. เตรียม `AUTH_FLOW_SECRET` แบบสุ่มอย่างน้อย 32 ตัว **คนละค่าระหว่าง Staging และ Production** กับ service key/URL ของ environment ที่ถูกต้อง ไม่เขียน secret ใน Git หรือรายงานผล
3. ปล่อย counter migration ตามขอบเขตข้างต้นและตรวจบน Staging ก่อน deploy source ไป Staging ทดสอบบัญชีสังเคราะห์/ลิมิต/สิทธิ์/การเปลี่ยนรหัสและ callback ที่ทำได้จริง โดยไม่ใช้ข้อมูล Production
4. หลัง Staging verification ผ่าน จึงแก้ Production Site URL/redirects ให้เป็น canonical origin `https://www.korkru.com` ที่แอปใช้ และเปิด **Require current password** ตามผลที่ตรวจ เก็บรายการค่าที่เปลี่ยนเพื่อ rollback ได้ ไม่เปลี่ยน config ส่วนอื่นโดยพ่วงมา
5. Apply/ตรวจเฉพาะ counter migration บน Production และตั้ง `AUTH_FLOW_SECRET` ให้พร้อม **ก่อน** deploy แอปรุ่นใหม่ มิฉะนั้น email actions จะ fail closed ทั้ง signup/ส่งซ้ำ/ลืมรหัส/ขอตั้งรหัสจาก settings
6. Deploy ผ่าน release workflow ของ `master` หลังตรวจ source/checks แล้ว ตรวจ deployment Ready, commit ที่ deploy และ alias จริง ก่อนทำ public smoke test แบบอ่านอย่างเดียว บันทึก hash/deployment และผลตรวจที่ทำจริง

ขั้นที่ยังรอ ณ checkpoint นี้: hosted Staging verification, migration ใหม่ทั้งสอง environment, secret/config ที่จำเป็น, การ merge/deploy Production และการตรวจเว็บหลัง deploy

## ค่าที่จะรักษาระหว่างการปล่อยโค้ด

- คง **Production email autoconfirm เปิด** เพื่อรักษาการสมัครเดิมจนเจ้าของกลับมาตั้ง SMTP ไม่อ้างว่าผู้สมัคร Production ต้องกดลิงก์ยืนยันอีเมลแล้ว Staging ยังคงต้องยืนยันอีเมล
- คง `GOOGLE_ACCOUNT_LINKING_ENABLED=false` และ `RESEND_QUOTA_ALERTS_ENABLED=false` ไม่เปิด Supabase Manual Linking ไม่สมัคร Resend/ตั้ง DNS/เปิด quota webhook ในรอบนี้
- อย่าเปิด CAPTCHA enforcement เพราะยังไม่มี widget/token ครบทุก flow การป้องกันในแอปไม่บังคับ direct Supabase Auth API ทุกเส้นทาง
- SMTP จริง, Google provider/client ID/origins, collision/email-change race และการเข้าได้สองวิธีด้วย user ID เดิมยังรอตั้งค่า/ทดสอบก่อนเปิดฟีเจอร์เหล่านั้น รายละเอียด setup แยกใน `ACCOUNT_SIGN_IN_METHODS.md` และ `RESEND_SETUP.md`

## ข้อจำกัดและการกู้คืน

Recovery รุ่นใหม่ต้องมี intent/nonce จากอีเมลและ PKCE ในเบราว์เซอร์ที่ขอ ลิงก์ recovery เก่าที่ไม่มี nonce ต้องขอใหม่ การล้าง cookie ไม่ใช่ atomic replay ledger และ global sign-out ไม่ยกเลิก JWT เดิมทันที การส่งอีเมลจริงยังไม่ถือว่าผ่านจนทดสอบ SMTP แล้ว

หาก deploy ไม่พร้อมให้ย้อน deployment แอปตามขั้นตอนของ Vercel พร้อมพิจารณาค่าที่เปลี่ยนเป็นชุดเดียวกัน เก็บ additive counter schema ไว้ก่อน ไม่ลบตารางหรือแก้ ledger เพื่อ rollback โค้ด และไม่ใช้การแก้ข้อมูลบัญชีจริงเป็นการทดสอบ
