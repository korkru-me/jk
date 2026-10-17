# ระบบสมัครและความน่าเชื่อถือของบัญชี — 17 ตุลาคม 2026

สถานะ: เตรียมโค้ดและทดสอบในเครื่องแล้ว **ยังไม่ deploy, ยังไม่ apply migration และยังไม่เชื่อม SMTP/ส่งอีเมลจริง** งานนี้ต่อจาก `codex/resend-quota-alert` จึงมีระบบเตือน 80/90/97% เดิมรวมอยู่ด้วย การสมัคร Resend พักไว้ตามคำขอเจ้าของ

## ข้อตกลงที่เจ้าของยืนยัน

- ชื่อช่องทางติดต่อ: **ผู้ดูแล KorKru** เป็นชื่อแสดงสำหรับการติดต่อ ไม่ได้อ้างว่าเป็นชื่อนิติบุคคล
- อีเมลสาธารณะ: `korkru.me@gmail.com`
- นักเรียนสมัครบัญชีเองได้ ไม่เพิ่มวันเกิด เลขบัตร โทรศัพท์ หรือบังคับคำเชิญ
- ชื่อที่แสดง อีเมล และประเภทบัญชียังเป็นข้อมูลหลัก ไม่มีโรงเรียน/กลุ่มสาระกลับมาในหน้าสมัคร
- คำขอเพิ่มเติมวันที่ 17 ตุลาคม: เพิ่มช่อง “ยืนยันรหัสผ่าน” เฉพาะสมัครด้วยอีเมล ไม่เพิ่มช่องอีเมลซ้ำ และยังคงการกดลิงก์ยืนยันอีเมล

## สิ่งที่โค้ดรองรับ

1. `/terms`, `/privacy`, `/contact` และลิงก์จริงจากหน้าสมัคร/หน้าหลัก; ถอดคำอ้าง ISO 27001/PDPA ที่ไม่มีหลักฐานจาก footer component เดิม (หน้าแรกใช้ LegalLinks แบบกระชับ ไม่เปิด footer การตลาดเดิม)
2. หน้าสมัครเรียงบทบาท → รับทราบนโยบาย → Google → แบบฟอร์มอีเมล ใช้ shared validation, inline errors, password manager, ปุ่มแสดงรหัส และชื่อที่บอกขอบเขตการมองเห็น
   ช่องยืนยันรหัสผ่านต้องไม่ว่างและตรงกับรหัสเดิมทุกตัว รวมตัวพิมพ์/ช่องว่าง ตรวจซ้ำฝั่ง server ก่อนนับคำขอส่ง ไม่ส่ง confirmation ต่อไป Supabase มีปุ่มแสดง/ซ่อนแยกและตรวจใหม่เมื่อแก้รหัสหลังกรอกยืนยันแล้ว
3. ถ้า Supabase ยังไม่มี session หลังสมัคร จะไป `/check-email` พร้อมอีเมลจาก HttpOnly cookie อายุ 30 นาที ไม่มีอีเมลใน query string/localStorage; ปุ่มส่งซ้ำอิงเวลาคำขอเดิม ไม่เริ่ม 60 วินาทีใหม่ทุก reload และเซิร์ฟเวอร์เป็นผู้ตัดสินลิมิต
4. กรอกอีเมลใหม่ในหน้าเช็กอีเมลเป็นการขอลิงก์ยืนยันของที่อยู่นั้น **ไม่เปลี่ยนอีเมลของบัญชีเดิม** หากกรอกผิดตอนสมัคร ต้องสมัครด้วยที่อยู่ที่ถูกต้องโดยกรอกชื่อ/รหัสผ่านใหม่
5. signup และ Google complete-profile ตรวจการยอมรับข้อกำหนด/รับทราบ privacy ซ้ำฝั่ง server แล้วบันทึก `terms_version`, `privacy_version`, `terms_acknowledged_at` ใน Auth user metadata ใช้เป็นบันทึกประกอบเท่านั้น **ไม่ใช่ immutable consent audit หรือแหล่ง authorization** บัญชีเดิมไม่ถูกบังคับยอมรับใหม่ในรอบนี้
6. settings ครู/นักเรียนใช้ `PasswordSettingsSection`/`PasswordSettingsForm` ร่วมกัน มีรหัสปัจจุบัน/ใหม่/ยืนยัน พร้อม validation แยกช่องทั้ง client/server ปฏิเสธรหัสใหม่ที่เท่ารหัสเดิมแบบ raw ก่อน Auth และไม่ trim รหัสผ่าน ยังคงตรวจ exact session/email และยืนยันรหัสเดิมด้วย client แยกที่ไม่เก็บ session ก่อนส่ง `current_password` พร้อมรหัสใหม่ ใช้ policy เดียวกับสมัคร/รีเซ็ต (8 ตัวขึ้นไป มีอักษรอังกฤษและตัวเลข) แสดงผลผ่านเงื่อนไขจริงขณะพิมพ์ มีปุ่มแสดง/ซ่อนอิสระ เตือน Caps Lock และทางกู้คืนผ่านอีเมลเมื่อลืมรหัสหรือบัญชี Google ยังไม่มีรหัส ข้อผิดพลาดมีชนิดและช่องที่เกี่ยวข้องสำหรับรหัสเดิมผิด/ติดลิมิต/บริการขัดข้อง/ต้องยืนยันตัวตนใหม่ หากรหัสเปลี่ยนแล้วแต่ global revocation ไม่สำเร็จ ไป `/login?password_changed=1&sessions_revoked=0` เพื่อคงคำเตือน ไม่บอกว่าออกทุกอุปกรณ์สำเร็จ รอบปรับ settings ไม่เปลี่ยน schema/config/remote/deploy; ขั้นเตรียม SMTP/migration parity/hosted current-password ด้านล่างยังต้องทำ
7. reset-password ต้องมี HMAC grant อายุ 10 นาที ผูก user และ access token จาก code exchange ที่เพิ่งสำเร็จ การล็อกอินอยู่แล้วหรือเปลี่ยน `next` อย่างเดียวไม่พอ หลังตั้งรหัสสำเร็จล้าง grant และ global sign-out; หาก revocation ล้มเหลว แสดงว่ารหัสเปลี่ยนแล้วพร้อมคำแนะนำ ไม่บอกว่ารหัสยังไม่เปลี่ยน JWT ที่ออกไปแล้วอาจยังใช้ได้จนหมดอายุ
8. ถอดสวิตช์ 2FA/ประวัติ IP จำลอง/Export ที่กดไม่ได้ใน settings เปลี่ยนเป็นสถานะความสามารถจริงและช่องทางติดต่อ
9. `/login` แสดง Google ก่อนอีเมล/รหัสผ่าน ถอดปุ่ม Magic Link เพื่อลดตัวเลือก ใช้ inline errors และสถานะกำลังส่งที่ปิดช่อง/ปุ่มร่วมกัน ใช้ shared `loginSchema` โดยรหัสผ่านต้องไม่ว่าง แต่ไม่บังคับ policy ของรหัสใหม่กับการเข้าสู่ระบบเพื่อรองรับบัญชีเดิม `sendMagicLink` และ callback เดิมยังคงอยู่ พร้อม `shouldCreateUser: false`, limiter และคำตอบที่ไม่เปิดเผยว่ามีบัญชีหรือไม่ รอบปรับหน้า login ไม่เปลี่ยน schema, config หรือ deployment

## ข้อจำกัดการส่งฝั่งเซิร์ฟเวอร์

`register`, `resendSignupConfirmation`, `sendMagicLink`, `forgotPassword` ต้องผ่าน `reserveAuthEmail` ร่วมกันก่อนเรียก Auth:

- อีเมลเดียวกัน: เว้น 60 วินาที, ไม่เกิน 5 คำขอ/ช่วง 1 ชั่วโมง และ 10 คำขอ/ช่วง 24 ชั่วโมง
- IP เดียวกัน: ไม่เกิน 120 คำขอ/ช่วง 1 ชั่วโมง เผื่อห้องเรียนที่แชร์เครือข่าย
- นับการจองส่งแม้ผู้ให้บริการส่งล้มเหลว; ไม่คืนโควตาทันทีให้ยิงซ้ำได้
- รับเฉพาะ `x-vercel-forwarded-for` ที่ platform จัดให้ และตรวจรูปแบบ IP ไม่เชื่อ header ที่ browser เลือกเอง; hosted ที่ไม่ใช่ Vercel ต้องเพิ่ม trusted proxy adapter ก่อน ไม่ข้าม IP limit เงียบ ๆ
- RPC ใน migration `20261017111034_auth_email_request_limits.sql` ใช้ transaction/row locks, ตรวจ IP ก่อนสร้างแถวผู้รับ, กำหนดเพดานใน SQL ไม่รับค่าลิมิตจาก client
- ตารางเปิด RLS, ถอนสิทธิ์ PUBLIC/anon/authenticated และไม่มี browser policies; RPC เป็น SECURITY INVOKER ให้เฉพาะ service_role เซิร์ฟเวอร์อนุญาตเฉพาะการจองอีเมลแบบ anonymous ที่กำหนดตายตัว ไม่อ่าน profile หรือรับชื่อ table/RPC จากผู้ใช้
- เก็บเฉพาะ HMAC ของ email/IP ที่แยก domain ของคีย์ ไม่เก็บค่าตรงในตาราง Counter หมดอายุหลัง 48 ชั่วโมง และ cron ลบรายชั่วโมงเมื่อมี pg_cron; หากไม่มีต้องตั้งการเรียก purge เอง
- `AUTH_FLOW_SECRET` ต้องเป็นค่าสุ่มอย่างน้อย 32 ตัว แยก Staging/Production ใช้ HMAC คนละ prefix สำหรับ counter และ recovery grant การหมุน secret จะรีเซ็ต bucket identity และยกเลิก grant เดิม
- ไม่มี secret/schema หรือ RPC ล้มเหลว: ปฏิเสธคำขอส่งพร้อมข้อความระบบยังไม่พร้อม ไม่ส่งแบบไม่จำกัด

ลิมิตนี้คุม **เส้นทางในแอป** ไม่สามารถบังคับ request ที่เรียก Supabase Auth API โดยตรงด้วย public key ต้องตั้ง hosted Auth rate limits และ Require current password ด้วย หากจะเปิด CAPTCHA ต้องเพิ่ม widget และส่ง `captchaToken` ให้ครบทุก flow รวมการยืนยันรหัสเดิมก่อน แล้วทดสอบ Staging; รอบนี้ยังไม่ได้ต่อ CAPTCHA และไม่ควรเปิด enforcement แล้วอ้างว่า flow พร้อมใช้งาน

## ก่อนนำขึ้น Staging

1. เทียบ migration ใหม่อีกครั้ง: การตรวจวันที่ 17 ตุลาคมพบ `20261015132234_retain_proctor_evidence_until_assignment_deletion.sql` เป็น local-only ใน Staging; **ไม่ push/replay/repair migration เดิมอัตโนมัติ** ต้องให้ผู้รับผิดชอบจัดลำดับ rollout เดิมให้เรียบร้อยก่อน migration ใหม่ รอบนี้ไม่มีการเขียนฐานข้อมูล remote
2. Commit migration กับ code ที่พึ่งพากัน แล้ว apply เฉพาะ Staging ตาม workflow ตรวจ RLS/grants/RPC/cron และทดสอบ concurrent connections จริงก่อน Production
3. ตั้ง `AUTH_FLOW_SECRET`, server service key และ canonical `NEXT_PUBLIC_SITE_URL` ของแต่ละ environment ตรวจ redirect allowlist ให้มี `/auth/callback` และ `/auth/confirm`
4. เปิด hosted **Confirm email** และ **Require current password when changing password**; `supabase/config.toml` ที่แก้เป็น confirmation=true มีผลเฉพาะ local ไม่ได้เปลี่ยน Dashboard ให้แล้ว
5. ต่อ custom SMTP ตาม `docs/RESEND_SETUP.md` เมื่อเจ้าของพร้อม สมัคร/ยืนยัน/ส่งซ้ำ/กู้คืนด้วยบัญชีสังเคราะห์บน Staging โดยไม่ใช้ข้อมูล Production
6. ค่าเริ่มต้น email link แบบ PKCE ต้องเปิดในเบราว์เซอร์เดิม (verifier cookie) ถ้าต้องการข้ามอุปกรณ์ ให้ตั้ง **signup template** หลัง custom SMTP พร้อมเป็น `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` และทดสอบ click/expired/reused link จริง `/auth/confirm` รองรับเฉพาะ email/signup ไม่ใช้แทน recovery template ในรอบนี้
7. Recovery template ยังคง callback แบบ PKCE; เปิดลิงก์แล้วตั้งรหัสภายใน 10 นาที ไม่เปลี่ยนเป็น token-hash recovery โดยไม่มี code รองรับ

## เอกสารกับข้อมูลที่ยังต้องกำหนด

Terms/privacy อธิบายฟังก์ชันและช่องทางติดต่อที่มีหลักฐานในโค้ด ไม่มีราคา/SLA/ระยะลบที่สมมติขึ้น และการรับทราบไม่รวม marketing หรือ sensitive-data blanket consent เอกสารนี้ยังไม่ใช่การยืนยันความครบถ้วนตามกฎหมาย ก่อนเปิดบริการสาธารณะต้องตรวจตัวบุคคล/บริษัทที่รับผิดชอบข้อมูล ระยะเก็บ/ลบจริง บทบาทโรงเรียน และฐานการใช้ข้อมูลผู้เยาว์/สุขภาพกับผู้รับผิดชอบ ไม่ถือว่า checkbox อย่างเดียวแก้เรื่องเหล่านี้ครบแล้ว

## การตรวจในเครื่อง

- TypeScript, token lint, unit tests และ production webpack build ใช้ env จำลอง ไม่มี credential จริง
- ผลตรวจ: full suite 281 ไฟล์ / 3,499 cases ผ่านก่อนเพิ่ม unsupported-host guard; หลังแก้รอบสุดท้าย auth suite 6 ไฟล์ / 58 cases ผ่าน (รวม guard ใหม่นั้น), TypeScript/token lint/build ผ่าน และ Next MCP `issues`, `configErrors`, `sessionErrors` ว่าง
- PGlite รัน SQL migration ใหม่ในฐานชั่วคราว ตรวจ cap/reset/grants/RLS/cleanup/การไม่สร้างแถวผู้รับหลัง IP เต็ม ไม่ได้พิสูจน์ race หลาย connection บน hosted Postgres
- Next.js Turbopack MCP และ browser จริง ตรวจ signup/validation/check-email/cooldown/ลิงก์ผิด/เอกสารที่จอ 1440 และ 390px โดย intercept provider และบล็อก fetch ภายนอก ไม่ใช่หลักฐานว่า SMTP/Google/อีเมลข้ามอุปกรณ์ผ่านแล้ว
- รอบก่อนเพิ่มช่องยืนยันรหัสผ่าน: ฟอร์มพร้อม policy acknowledgement สูงใกล้เคียงเดิมบนมือถือ (~704px รวม card เทียบเดิม ~703px) และต่ำลงเล็กน้อยบน desktop (~704px เทียบเดิม ~721px) หลังเพิ่มช่องยืนยัน card บนมือถือสูง ~782px ช่อง/ปุ่มใหม่ยังอย่างน้อย 44px และไม่ล้นแนวนอน
- รอบเพิ่ม confirmation: full suite 281 ไฟล์ / 3,502 cases, TypeScript, token lint และ production webpack build ผ่าน ตรวจ browser กรณีไม่ตรง/แก้ให้ตรง/แก้รหัสเดิม/ว่างแล้วกดสมัคร/แสดงซ่อน/สำเร็จไป check-email และ Google ผ่าน mock redirect โดยไม่กรอกรหัส ไม่มีอีเมลจริงหรือ migration เพิ่มในรอบนี้
- รอบปรับหน้า login: TypeScript, token lint และ production webpack build ผ่าน; Next MCP ไม่พบ compilation/config/runtime errors ตรวจ browser ที่ 390×844 และ 1200×900px ไม่ล้นแนวนอน card ลดจาก ~580.8 เป็น ~487.6px (~16%) ช่อง/ปุ่ม/ลิงก์อย่างน้อย 44px ตรวจฟอร์มว่าง/focus/aria errors, รหัสเดิม 6 ตัวถึง mock Auth, ข้อผิดพลาดและการคืนสถานะปุ่ม, แสดง/ซ่อนรหัส, Google ไป mock redirect แม้ฟอร์มว่าง และแถบแจ้ง callback/password_changed ผ่าน React DevTools ยืนยัน LoginForm ใหม่ ไม่รัน full unit suite ซ้ำเพราะไม่มี lib เปลี่ยน และไม่ทดสอบ provider/SMTP/Staging/Production จริง

- รอบเติมระบบเปลี่ยนรหัสใน settings: full suite 281 ไฟล์ / 3,532 cases, TypeScript, token lint และ production webpack build ผ่าน; Next MCP ไม่พบ compilation/config/session errors ตรวจ browser ผ่าน helper จริงกับ provider จำลองสำหรับรหัสเดิมผิด, provider ปฏิเสธรหัสใหม่ (ข้อความคงอยู่จนแก้ช่องนั้นและคืน focus หลังปลด disabled), reauth, success และ revocation failure ที่แสดงต่อบนหน้า login พร้อมตรวจ client กรอกว่าง/รหัสซ้ำ/ยืนยันไม่ตรง/แก้รหัสแล้วตรวจซ้ำ/ปุ่มแยก/Caps Lock จาก keyboard event จำลอง และ React DevTools ของ shared form ไม่มีการเปลี่ยนบัญชีหรือส่งอีเมลจริง
- ตรวจหน้าครูและนักเรียนจริงผ่าน `/exam-screen-lab/student-profile` ที่ใช้ action จำลองทั้งคู่ (`?scenario=teacher-shell` ใช้ ProfileSettings จริงแล้ว) ไม่มีทางเรียก Auth/DB จากฟอร์มตัวอย่าง จอ 390/1200px ไม่ล้นและตัวควบคุมรหัสอย่างน้อย 44px; fixture แยกที่ใช้เปรียบเทียบกรอบก่อน/หลังรอบนี้ลดจาก ~563.9 เป็น ~494.9px บนมือถือ และ ~547.9 เป็น ~396.4px บนจอใหญ่เมื่อเข้าเงื่อนไขสองคอลัมน์ ลบ fixture เฉพาะกิจออกก่อน build/commit แล้ว ยังไม่ทดสอบ hosted Auth/SMTP/Staging/Production และไม่มี migration/config remote เพิ่ม

อ้างอิงที่ตรวจ: [Supabase resend](https://supabase.com/docs/reference/javascript/auth-resend), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Password security](https://supabase.com/docs/guides/auth/password-security), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Vercel request headers](https://vercel.com/docs/headers/request-headers)
