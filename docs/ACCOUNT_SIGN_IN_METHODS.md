# วิธีเข้าสู่ระบบบัญชีเดียวกัน — 17 ตุลาคม 2026

สถานะ: เตรียมโค้ดในเครื่อง **ยังไม่ deploy หรือเปลี่ยน hosted Auth/SMTP/ฐานข้อมูล** ปุ่มเชื่อม Google ปิดด้วย `GOOGLE_ACCOUNT_LINKING_ENABLED=false` จนผ่าน Staging การสมัคร Resend ยังพักไว้ตามคำขอเดิม ผลตรวจในเครื่องอยู่ท้ายเอกสาร ไม่ยกผล mock เป็นหลักฐานว่าผู้ให้บริการจริงผ่าน

## ประสบการณ์ของครูและนักเรียน

- ใช้ `SignInMethodsSection` ร่วมกัน แสดงอีเมล/สถานะยืนยันและสถานะ Google จาก identities ของ `getUser` ที่ตรวจแล้ว ไม่อนุมานว่ามีรหัสผ่านจาก provider หรือ metadata
- Google แยกสถานะเชื่อมแล้ว/ยังไม่เชื่อม/ข้อมูลขัดแย้ง/อ่านไม่ได้ ไม่แสดงข้อมูลขัดแย้งเป็นเชื่อมสำเร็จ
- เชื่อม Google ด้วยอีเมลเดียวกัน: ยืนยันรหัสปัจจุบันก่อนเลือก Google มี error ประจำช่อง แสดง/ซ่อนรหัส ยกเลิก และหมดอายุแล้วให้ยืนยันใหม่
- แถว “อีเมลและรหัสผ่าน” ใช้ปุ่ม “ตั้งหรือเปลี่ยนรหัสผ่าน” เสมอ ส่งคำขอถึงอีเมลบัญชีที่ server ยืนยัน ไม่รับอีเมลหรือ user ID จากฟอร์มนี้ ไม่ข้ามรหัสเดิมในฟอร์มเปลี่ยนรหัสเพราะเป็นบัญชี Google
- ข้อความอีเมลระบุการส่งแบบมีเงื่อนไขพร้อม cooldown ไม่รับประกันการเข้ากล่องจดหมาย ไม่มี unlink, merge บัญชีต่าง ID หรือ 2FA เพิ่มในรอบนี้

## เส้นทางเชื่อม Google

1. `startGoogleAccountLink` ตรวจ flag/client ID, `getUser`, อีเมลยืนยันแล้ว, identities และ session ปัจจุบัน แล้วตรวจรหัสผ่านกับอีเมลของผู้ใช้นั้นผ่าน Supabase client แยกที่ไม่เก็บ session เปรียบเทียบ user ID และยุติเซสชันตรวจรหัสชั่วคราวก่อนออก challenge
2. HMAC challenge อายุ 5 นาทีผูก user ID, อีเมล และ hash ของ exact access token เดิม เก็บ raw nonce ใน HttpOnly cookie ส่งเพียง nonce hash/client ID/เวลาหมดอายุให้ UI
3. หลังยืนยันรหัสสำเร็จจึงโหลด `https://accounts.google.com/gsi/client` และ render ปุ่ม GIS ทางการแบบ `outline`, `large`, `continue_with`, ภาษาไทย โดยส่ง nonce hash ปิด automatic selection และ One Tap ใช้ FedCM สำหรับปุ่ม Credential ส่งตรงเข้า Server Action ไม่เข้า URL, log หรือ browser storage
4. Server ใช้ `jose` ตรวจ RS256 กับ Google JWKS URL คงที่ ตรวจ issuer, audience ตรง `GOOGLE_ACCOUNT_LINK_CLIENT_ID`, `iat`/`exp` และอายุ token ไม่เกิน 5 นาที, nonce, `email_verified === true` และอีเมลเดียวกับบัญชี **ก่อน** เรียก Supabase `signInWithIdToken`
5. การ sign-in เพื่อให้ Supabase automatic linking ใช้ client แยกที่ไม่ถือ session เดิม ไม่แทน cookies ปัจจุบัน ตรวจผล user ID/อีเมลและ Google subject identity ตรงบัญชีเดิมก่อนตอบสำเร็จ จากนั้นยุติเฉพาะ session ชั่วคราว หากยุติไม่ได้รายงานคำเตือน ไม่อ้างว่ายุติสำเร็จ
6. การยกเลิกและการเริ่มยืนยันใหม่หลัง challenge หมดอายุเรียก `cancelGoogleAccountLink` เพื่อล้าง challenge cookie ฝั่ง server UI ล้างรหัส/challenge และ unmount GIS ทันทีเพื่อไม่รับ callback ที่มาช้า แล้วรอผล cleanup ก่อนปิดหรือกลับให้กรอกรหัสใหม่ หาก cleanup ล้มเหลวแสดงข้อผิดพลาดพร้อมปุ่มลองยกเลิกอีกครั้ง ไม่เปิดเริ่ม challenge ใหม่ก่อน cleanup สำเร็จ

ไม่เขียน profile, role หรือ ownership ของข้อมูลเพื่อรวมบัญชี และไม่ใช้ `linkIdentity`/Supabase Manual Linking การล้าง challenge cookie ช่วยจบ flow ในเบราว์เซอร์ ไม่ใช่ atomic single-use ledger

## ตั้งหรือเปลี่ยนรหัสผ่านผ่านอีเมล

`sendAccountPasswordEmail` ตรวจผู้ใช้และอีเมลยืนยันแล้วฝั่ง server ก่อนเรียก recovery ที่ผูกอีเมลกับ user ID เดิม ใช้ limiter ร่วมกับคำขออีเมลอื่น บัญชี Google จึงตั้งรหัสผ่านสำหรับบัญชีเดิมผ่านหลักฐานในอีเมล แทนการเปิดให้ session ที่ล็อกอินอยู่ตั้งรหัสโดยข้ามหลักฐาน

Recovery มี HMAC intent อายุ 1 ชั่วโมง เก็บอีเมล, nonce hash และ expected user ID เมื่อคำขอมาจากบัญชีที่ล็อกอินไว้ใน HttpOnly cookie ส่วน raw nonce อยู่เฉพาะ `recovery_nonce` ใน redirect ของอีเมล ไม่ส่งกลับผ่านผล Server Action Callback ต้องมี intent/nonce ตรงเบราว์เซอร์เดิม, แลก PKCE code สำเร็จ, อีเมลผู้รับตรง และ user ID ตรงเมื่อผูกไว้ จึงออก recovery grant 10 นาทีสำหรับ user/access token ที่แลกได้ หน้าและ action ตั้งรหัสตรวจ grant ซ้ำ

ลิงก์ recovery เก่าที่ไม่มี nonce ใช้ไม่ได้ ต้องขอลิงก์ใหม่และเปิดในเบราว์เซอร์ที่ขอ หลังตั้งรหัสสำเร็จล้าง grant และพยายาม global sign-out พร้อมแยกรายงานเมื่อ revocation ล้มเหลว การล้าง intent/grant cookie ไม่ใช่ atomic replay ledger และ JWT เดิมอาจยังใช้ได้จนหมดอายุ

## ตั้งค่าก่อนเปิดใช้

1. จัดลำดับ migration parity, shared email limiter, `AUTH_FLOW_SECRET` แยก environment, hosted email confirmation/current-password policy และ custom SMTP ตาม `AUTH_SIGNUP_ROLLOUT.md` ก่อน การเชื่อม Google รอบนี้ไม่มี migration ใหม่
2. ใช้ OAuth client ชนิด **Web application** ของ Google เดียวกับที่ Supabase Google provider ยอมรับเป็น audience ตั้ง `GOOGLE_ACCOUNT_LINK_CLIENT_ID` ให้ตรง client ID นั้น ตัวระบุนี้เป็นข้อมูลสาธารณะ ไม่ใช่ client secret และไม่ต้องเพิ่ม OAuth secret สำหรับ UI นี้
3. ใน Google Cloud เพิ่ม **Authorized JavaScript origins** ของ environment ที่จะเปิดใช้ เช่น origin ของ Staging/Production ที่ถูกต้อง ไม่ใส่ path หากทดสอบ local เพิ่ม localhost และ port ที่ใช้ตามคู่มือ Google คง Supabase OAuth callback/redirect allowlist เดิมสำหรับการเข้าสู่ระบบปกติ
4. คง Supabase **Manual Linking ปิดไว้** และ `GOOGLE_ACCOUNT_LINKING_ENABLED=false` ระหว่างเตรียม ทดสอบ Google client/audience, popup/FedCM, cookies และกรณีด้านล่างกับบัญชีสังเคราะห์บน Staging ก่อนตั้ง flag เป็น `true` เฉพาะ environment ที่ผ่าน
5. หากมี CSP/COOP ต้องตรวจว่าอนุญาต GIS script/frame/connect และ popup ตามคู่มือ Google ไม่ปรับ header หรือเปิดบริการจริงโดยอ้างว่ารอบนี้ได้ตรวจแล้ว

## ขอบเขตและกรณีที่ต้องตรวจบน Staging

การตรวจรหัสและ token ข้างต้นคุมเส้นทางใหม่ในแอป ไม่บังคับ Supabase Auth API สาธารณะทุกเส้นทาง การ login ด้วย Google อีเมลเดียวกันยังใช้ automatic linking เดิม จึงไม่อ้างว่าการเชื่อมทุกกรณีต้องผ่านปุ่มและรหัสปัจจุบันนี้

การตรวจในแอปกับ Supabase automatic linking ไม่ใช่ transaction เดียวกัน หากอีเมลบัญชีเปลี่ยนระหว่างตรวจและ sign-in อาจเกิด Auth identity ที่คาดไม่ถึง แม้แอปปฏิเสธผลที่ user ID ไม่ตรงและไม่ merge profile/ข้อมูล ต้องตรวจ collision และ email-change race บน Staging ก่อนเปิด flag ไม่อ้างว่าป้องกันการสร้าง identity ผิดกรณีได้ทุกเส้นทาง

ตรวจทั้งครู/นักเรียน: อีเมลเดียวกันสองวิธีเข้าได้ user ID เดิม, อีเมลต่าง/ยังไม่ยืนยัน/identity ขัดแย้งถูกปฏิเสธ, รหัสเดิมผิดไม่โหลด GIS, challenge หมดอายุหรือ session เปลี่ยน, token/signature/audience/nonce ไม่ตรง, ปิด picker/โหลด script ไม่สำเร็จ, cleanup ชั่วคราวล้มเหลว และการตั้งรหัสผ่านอีเมลที่ยังคง ID/role/ข้อมูลเดิม รวม recovery nonce หาย/ผิด/เปิดต่างเบราว์เซอร์/recipient หรือ ID ไม่ตรง/ลิงก์เก่า

Native controls ใช้พื้นที่กดอย่างน้อย 44px ปุ่ม GIS ทางการขนาด `large` อาจสูงประมาณ 40px; wrapper 44px ไม่ได้ทำให้ปุ่มของ Google สูง 44px และไม่ยืด iframe เพื่อสร้างผลตรวจที่คลาดเคลื่อน

## ผลตรวจในเครื่องที่ยืนยันแล้ว

- Full `npm test` ผ่าน 286 ไฟล์ / 3,654 cases; TypeScript และ token lint ผ่าน
- Browser ที่ใช้ provider/mock actions ในเครื่องตรวจฟอร์มว่างและรหัสปัจจุบันผิดแล้วไม่โหลด GIS, focus/ล้างรหัสถูกต้อง, ปฏิเสธอีเมล Google ต่าง, ยกเลิกแล้วไม่รับ callback ที่มาช้า, หมดอายุแล้วเริ่มยืนยันใหม่, เชื่อมสำเร็จแล้ว refresh เป็นสถานะเชื่อมแล้ว และคำขออีเมลพร้อม cooldown ผ่าน หน้าทดสอบชั่วคราวถูกนำออกก่อน build
- ตรวจ React tree/props ของหน้าครูและนักเรียนว่าใช้ shared section และ preview actions เท่านั้น ภาพนักเรียนที่ 390px และครูที่ 1200px ไม่ล้นแนวนอน; native controls ใน section ที่ตรวจบนมือถือสูง 44px (ไม่มีผลขนาดปุ่ม GIS จริง)
- Production build แบบ webpack ด้วย synthetic environment/โฟลเดอร์แยกผ่าน; Next dev MCP ไม่พบ compilation/runtime errors ไม่มีผลยืนยัน Google/SMTP จริง, Staging หรือ Production จากการตรวจ mock ข้างต้น รอบนี้ไม่มี migration ใหม่หรือ remote deployment

อ้างอิง: [Google GIS setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Google GIS JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference), [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [Supabase signInWithIdToken](https://supabase.com/docs/reference/javascript/auth-signinwithidtoken)
