# Safe Exam Browser — คู่มือติดตั้งและใช้งานเฟส 1–3

SEB รองรับ **Windows, macOS, iPhone และ iPad** ด้วยเว็บ KorKru เดิม ไม่รองรับ Android และไม่ต้องติดตั้ง SEB Server ระบบตรวจ Config Key (CK) และ Browser Exam Key (BEK) ที่ KorKru โดยตรง แล้วแสดงสถานะในห้องคุมสอบเดิม เฟส 3 เพิ่ม Android monitored mode แยกต่างหากซึ่งความมั่นใจต่ำกว่าและต้องให้ครูตรวจเครื่องต่อหน้า ดู `docs/ANDROID_EXAM_MODE.md`

> การ merge โค้ดอย่างเดียวยังไม่ทำให้ SEB พร้อมใช้ ต้อง apply migration, ตั้ง environment, สร้างไฟล์ `.seb` และทดสอบเครื่องจริงก่อนเปิดสวิตช์ให้ข้อสอบ

เฟส 2 เพิ่มหน้าตรวจความพร้อมสำหรับครู, การกันเผยแพร่เมื่อระบบยังตั้งค่าไม่ครบ และ system check สำหรับนักเรียนที่ไม่สร้าง attempt หรือเริ่มจับเวลา

## 1. สร้างไฟล์ตั้งค่าด้วย SEB Config Tool

ใช้ Config Tool/Preferences จาก [Safe Exam Browser รุ่นล่าสุด](https://safeexambrowser.org/download_en.html) และสร้างไฟล์สำหรับ **เริ่มสอบ (exam config)** ไม่ใช่ไฟล์ตั้งค่าผู้ดูแลทั่วไป

ค่าขั้นต่ำที่แนะนำ:

- Start URL เป็น URL ของ KorKru production เช่น `https://example.school/assignments`
- ใช้ modern browser engine / JavaScript API; macOS/iOS ต้องไม่บังคับ classic WebView
- เปิด JavaScript และ cookies
- อนุญาต navigation เฉพาะโดเมน KorKru และโดเมน Supabase ของโปรเจกต์ที่ Realtime/Storage ใช้
- ไม่เปิด URL **content filter** ที่บังคับ classic WebView บน macOS/iOS; ใช้ navigation URL filter แทน
- ปิด app switching, screen sharing/mirroring, Print Screen, clipboard ภายนอก, developer console และ task manager ตามความสามารถของแต่ละ OS
- จำกัดหนึ่งจอ ปิด VM/remote session ตามนโยบายโรงเรียน
- เปิด file upload เฉพาะเมื่อข้อสอบมีรูปวิธีทำหรือข้อส่งไฟล์
- ตั้ง Quit Password และ Admin Password ที่ผู้คุมสอบถือไว้ ห้ามแจกนักเรียน
- iOS/iPadOS ต้องตั้ง Quit Password เพื่อเข้า secure mode

KorKru ใช้ SEB JavaScript API (`SafeExamBrowser.security.*`) จึงไม่ต้องเปิดการส่ง CK/BEK ผ่าน HTTP header แต่ต้องใช้ SEB อย่างน้อยรุ่นที่รองรับ API: Windows 3.3.2+, macOS/iOS 3.0+ แนะนำให้กำหนดเฉพาะรุ่นล่าสุดที่โรงเรียนทดสอบแล้ว

## 2. เก็บ CK และ BEK

หลังตั้งค่าเสร็จให้บันทึกไฟล์ก่อน แล้วคัดลอกค่าจาก Exam preferences:

- **Config Key** เหมือนกันข้าม Windows/macOS/iOS เมื่อใช้ config เดียวกัน แต่จะเปลี่ยนเมื่อแก้และบันทึก config ใหม่
- **Browser Exam Key** เปลี่ยนตาม platform/build ของ SEB ต้องเก็บทุก BEK ที่โรงเรียนยอมรับ
- ทั้งสองค่าเป็นเลขฐานสิบหก SHA-256 จำนวน 64 ตัว ให้คัดลอกตรงตามที่ Config Tool แสดงรวมถึงตัวพิมพ์เล็ก/ใหญ่ และเป็น secret ฝั่ง server ห้ามใส่ใน source code, หน้าเว็บ หรือ `NEXT_PUBLIC_*`

ทุกครั้งที่แก้ไฟล์ `.seb` ต้องคัดลอก CK/BEK ใหม่และ deploy environment พร้อมกัน ไม่เช่นนั้นนักเรียนทุกคนจะถูกปฏิเสธ

## 3. ตั้ง environment

```dotenv
# URL production ที่ browser เปิดจริง ต้องตรง origin ทุกตัวอักษร
NEXT_PUBLIC_SITE_URL=https://example.school

# สุ่มอย่างน้อย 32 ตัวอักษร เก็บใน secret manager
SEB_SESSION_SECRET=...

# CK หนึ่งค่า (64 hex)
SEB_CONFIG_KEY=...

# BEK หลายค่า คั่นด้วย comma/space/newline
SEB_BROWSER_EXAM_KEYS=windows_bek_64_hex,macos_bek_64_hex,ios_bek_64_hex

# URL สาธารณะของไฟล์ .seb ที่เข้ารหัสแล้ว; เว้นว่างได้ถ้าครูแจกไฟล์เอง
NEXT_PUBLIC_SEB_CONFIG_URL=https://example.school/exam/korkru-production.seb
```

สร้าง `SEB_SESSION_SECRET` ด้วย secret generator ของระบบ deploy ห้ามใช้ access code ของข้อสอบหรือ Quit Password ซ้ำ ตัว session เป็น HttpOnly, SameSite=Strict, มีอายุ 12 ชั่วโมง และผูกกับ student + assignment เดียว

ไฟล์ `.seb` ที่เผยแพร่ต้องเข้ารหัสและห้ามมีรหัสผ่านเป็น plain text ชื่อ URL ของไฟล์ไม่ถือเป็น secret แต่ CK/BEK และรหัสผู้ดูแลถือเป็น secret

## 4. Apply migration และ deploy

Migration: `20260830062722_add_seb_secure_exam_mode.sql`

ลำดับ rollout ที่ปลอดภัย:

1. Apply migration ก่อน (ค่าเดิมทุกข้อสอบเป็น `browser` จึงไม่กระทบนักเรียน)
2. Deploy code + environment ทั้งหมด
3. เปิดไฟล์ `.seb` บน staging และยืนยันว่า login, Realtime, autosave, รูปวิธีทำ/ไฟล์แนบ และ submit ทำงาน
4. ทดสอบอย่างน้อย Windows, macOS และ iPhone/iPad รุ่นที่โรงเรียนจะอนุญาต
5. ทำ mock exam พร้อมกันหลายเครื่องบน Wi-Fi ห้องจริง
6. เปิด “บังคับใช้ Safe Exam Browser” เฉพาะข้อสอบนำร่องที่ยังไม่มี submission

หลัง deploy ให้ครูเปิด **การตั้งค่า → ตั้งค่าข้อสอบเริ่มต้น** ระบบจะแสดง readiness checklist โดยส่งไปหน้าเว็บเฉพาะสถานะและจำนวน BEK ที่ไม่ซ้ำ ไม่ส่งค่า secret, CK หรือ BEK ออกจาก server

รายการที่เป็นตัวบล็อกการเผยแพร่ข้อสอบ SEB:

- migration ยังไม่ถูก apply
- `NEXT_PUBLIC_SITE_URL` ไม่ใช่ origin ที่ถูกต้อง หรือไม่ใช่ HTTPS ใน production
- `SEB_SESSION_SECRET` สั้นกว่า 32 ตัวอักษร
- `SEB_CONFIG_KEY` ไม่ใช่ 64 hex
- ไม่มี BEK ที่เป็น 64 hex อย่างน้อยหนึ่งค่า

ลิงก์ `NEXT_PUBLIC_SEB_CONFIG_URL` ไม่ใช่ตัวบล็อก เพราะโรงเรียนอาจแจกไฟล์ `.seb` เอง แต่หน้า readiness จะแจ้งเตือนหากลิงก์มีรูปแบบไม่ถูกต้อง ระบบตรวจเฉพาะความพร้อมของค่า environment ไม่ทดสอบว่า URL ปลายทางดาวน์โหลดไฟล์ได้จริง จึงต้องเปิดไฟล์จากเครื่องทดสอบด้วย

ข้อสอบแบบร่างสามารถเลือก SEB ไว้ก่อนได้ แต่ server จะไม่ยอมเปลี่ยนเป็น `published` จนกว่ารายการตัวบล็อกจะผ่านทั้งหมด หากข้อสอบถูกเผยแพร่อยู่แล้ว การแก้ให้บังคับ SEB จะใช้กฎเดียวกัน

## 5. System check ของนักเรียน

ข้อสอบที่บังคับ SEB จะแสดงลิงก์ **ตรวจเครื่อง SEB โดยไม่เริ่มจับเวลา** ในรายการข้อสอบและหน้าเปิดข้อสอบ เส้นทางคือ:

```text
/assignments/{assignment-id}/system-check
```

System check ทำสิ่งต่อไปนี้:

1. ยืนยันว่าผู้ใช้เป็นนักเรียนในห้องที่ได้รับข้อสอบ โดยไม่สนวันเริ่มสอบ จึงตรวจล่วงหน้าได้
2. ไม่โหลดคำถาม ไม่ตรวจ access code ไม่สร้าง submission และไม่เริ่ม timer
3. ใช้ challenge อายุ 5 นาทีชนิด `system_check` ซึ่งนำไปใช้แทน challenge หน้า `take` ไม่ได้
4. ตรวจ JavaScript API, SEB version, CK, BEK, origin/path และการเชื่อมต่อ server
5. เมื่อผ่าน จะออก secure session ที่ผูกกับนักเรียนและข้อสอบเดียว อายุไม่เกิน 12 ชั่วโมง

ผลผ่านยืนยันเฉพาะเครื่อง, รุ่น SEB, ไฟล์ตั้งค่า, บัญชี และเครือข่ายที่ใช้ตรวจครั้งนั้น ถ้าเปลี่ยนเครื่อง อัปเดต SEB หรือบันทึกไฟล์ `.seb` ใหม่ต้องตรวจซ้ำ และควรตรวจซ้ำในวันสอบแม้เคยผ่านล่วงหน้า

## 6. บัญชีนักเรียนและวันสอบ

- ให้นักเรียนติดตั้งและทำ system check ก่อนวันสอบ ไม่ดาวน์โหลดพร้อมกันหน้าห้อง
- แนะนำ email/password สำหรับวันสอบ Google OAuth และ magic link อาจออกนอก URL filter หรือเปิดแอปอื่น จึงต้องทดสอบแยกก่อนอนุญาต
- มีเครื่องสำรองและขั้นตอนออกจาก SEB ด้วย Quit Password สำหรับเหตุขัดข้อง
- ครูเปิด “ห้องคุมสอบสด” และตรวจป้าย “SEB ยืนยันแล้ว · Windows/macOS/iOS” ก่อนเริ่มจับเวลา
- อย่าตัดสินทุจริตอัตโนมัติจาก event เดียว ใช้เหตุการณ์เป็นหลักฐานประกอบกับการสังเกตในห้อง

### Runbook ก่อนวันสอบ

1. ครูยืนยันว่า readiness เป็น “พร้อมเผยแพร่ข้อสอบ SEB”
2. แจกไฟล์ `.seb` และให้นักเรียนทุกคนทำ system check ด้วยอุปกรณ์จริง
3. บันทึกรายชื่อเครื่องที่ไม่ผ่านและแก้ปัญหาก่อนวันสอบ ไม่แจก Quit/Admin Password
4. ทำ mock exam ที่มี autosave, Realtime, upload และ submit บน Wi-Fi ห้องสอบจริง
5. เตรียมเครื่องสำรอง ไฟล์ `.seb` สำรอง และช่องทางแจ้งผู้ดูแลเมื่อ key mismatch

### Runbook วันสอบ

1. ให้นักเรียนปิดโปรแกรมอื่นและเปิดไฟล์ `.seb` ที่กำหนด
2. ให้นักเรียนทำ system check อีกครั้งก่อนแจก access code
3. ครูเปิดห้องคุมสอบสด ตรวจจำนวนนักเรียนและป้าย OS/SEB ที่ยืนยันแล้ว
4. จึงแจก access code และให้นักเรียนกดเริ่มสอบ
5. หากเครื่องหลุด ห้ามสั่งสร้าง attempt ใหม่ทันที ให้เปิด SEB เดิมแล้ว resume; session หมดอายุจะบังคับตรวจใหม่
6. เหตุฉุกเฉินให้ครูเป็นผู้ใช้ Quit Password และจดเหตุการณ์ประกอบ ไม่ให้นักเรียนรู้รหัส

## 7. การทำงานและ rollback

เมื่อข้อสอบตั้ง `seb_required`:

1. KorKru ออก challenge อายุ 5 นาที ผูกกับผู้ใช้และข้อสอบ
2. SEB ส่ง CK/BEK request hashes สำหรับ URL challenge ปัจจุบันผ่าน JavaScript API
3. Server ตรวจ origin, path, challenge, CK, BEK และรูปแบบ version แล้วออก HttpOnly session
4. Server ตรวจ session ซ้ำตอนเริ่ม/resume, อ่านข้อสอบ, autosave, แนบรูป/ไฟล์, heartbeat และ submit
5. attempt เก็บเฉพาะเวลา, platform และ version ที่ยืนยัน ไม่เก็บ raw key, request hash, IP, user-agent หรือ device fingerprint

หากต้อง rollback ให้ปิดสวิตช์เป็น `browser` ได้เฉพาะข้อสอบที่ยังไม่มีผู้เริ่มทำ สำหรับข้อสอบที่เริ่มแล้วให้ปิด/ทำสำเนาข้อสอบใหม่แทน ระบบตั้งใจล็อกการเปลี่ยนโหมดกลาง attempt เพื่อไม่ทำให้นักเรียนถูกกันออกจากคำตอบของตน

## ข้อจำกัดเฟส 1–2

- ไม่มี Android
- ไม่มี remote quit/control จาก SEB Server
- ไม่สามารถป้องกันกล้องจากอุปกรณ์อื่นได้ (สถานการณ์ใช้งานจึงต้องมีครูเดินคุม)
- ความปลอดภัยขึ้นกับไฟล์ `.seb`, รุ่น OS/SEB, นโยบายเครื่อง และการทดสอบจริง ไม่ใช่สวิตช์ใน KorKru เพียงอย่างเดียว
- การรองรับ accessibility, keyboard ภาษาไทย, PDF, file picker และ assistive technology ต้องทดสอบตามกลุ่มนักเรียนจริงก่อนสอบ
- System check ไม่สามารถพิสูจน์ว่านักเรียนจะไม่เปลี่ยนเครือข่ายภายหลัง และไม่ได้จำลอง Realtime/upload/submit แบบครบวงจร จึงยังต้องมี mock exam
- เว็บปกติไม่มี API ที่เชื่อถือได้สำหรับตรวจว่า OS แคปหน้าจอสำเร็จหรือไม่ การปิด screenshot/app switching ต้องมาจากนโยบายในไฟล์ `.seb` และความสามารถของแต่ละ OS

เอกสารเทคนิคทางการ: [SEB Config Key และ JavaScript API](https://safeexambrowser.org/developer/seb-config-key.html)
