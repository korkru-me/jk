# Safe Exam Browser — คู่มือติดตั้งและใช้งานเฟส 1–7

SEB รองรับ **Windows, macOS, iPhone และ iPad** ด้วยเว็บ KorKru เดิม ไม่รองรับ Android และไม่ต้องติดตั้ง SEB Server ระบบตรวจ Config Key (CK) และ Browser Exam Key (BEK) ที่ KorKru โดยตรง แล้วแสดงสถานะในห้องคุมสอบเดิม เฟส 3 เพิ่ม Android monitored mode แยกต่างหากซึ่งความมั่นใจต่ำกว่าและต้องให้ครูตรวจเครื่องต่อหน้า ดู `docs/ANDROID_EXAM_MODE.md` เฟส 4 เพิ่มเสียง/Browser Notification แบบ opt-in และคิวรับทราบเหตุการณ์ร่วมกันระหว่างครู เฟส 5 เพิ่ม roster เช็กอิน SEB ก่อนสอบจาก system check ที่ผ่านจริง เฟส 6 เพิ่มรายงานสัญญาณย้อนหลังแบบอ่านอย่างเดียวกับ CSV ที่จำกัดขนาด และเฟส 7 เป็นการทำ production readiness: ตรวจ migration, environment, ไฟล์ `.seb`, platform/build ที่อนุญาต และขั้นตอนทดสอบจริงก่อนเปิดใช้

> การ merge โค้ดอย่างเดียวยังไม่ทำให้ SEB พร้อมใช้ ต้อง apply migration, ตั้ง environment, สร้างไฟล์ `.seb` และทดสอบเครื่องจริงก่อนเปิดสวิตช์ให้ข้อสอบ

เฟส 2 เพิ่มหน้าตรวจความพร้อมสำหรับครู, การกันเผยแพร่เมื่อระบบยังตั้งค่าไม่ครบ และ system check สำหรับนักเรียนที่ไม่สร้าง attempt หรือเริ่มจับเวลา

## 1. สร้างไฟล์ตั้งค่าด้วย SEB Config Tool

ใช้ Config Tool/Preferences จาก [Safe Exam Browser รุ่นล่าสุด](https://safeexambrowser.org/download_en.html) และสร้างไฟล์สำหรับ **เริ่มสอบ (exam config)** ไม่ใช่ไฟล์ตั้งค่าผู้ดูแลทั่วไป

ค่าขั้นต่ำที่แนะนำ:

- Start URL เป็น URL ของ KorKru production เช่น `https://example.school/assignments`
- ใช้ modern browser engine (WKWebView บน macOS/iOS) และ SEB JavaScript API; อย่าถอยไปใช้ classic WebView
- เปิด JavaScript และ cookies
- อนุญาต navigation เฉพาะโดเมน KorKru และโดเมน Supabase ของโปรเจกต์ที่ Realtime/Storage ใช้
- หากเปิด URL **content filter** บน macOS/iOS ให้กำหนด SEB 3.5+ ซึ่งรองรับ content filter ใน modern WKWebView แล้ว; custom regular expression ใช้ได้เฉพาะ subset ที่ WKWebView/Safari Content Filters รองรับ จึงต้องทดสอบทุกกฎบน build ที่โรงเรียนอนุญาต สำหรับ build เก่ากว่านั้นให้ปิด content filter และใช้ navigation URL filter แทน ไม่ควรแก้ด้วยการบังคับ classic WebView ดู [macOS release notes ของ SEB 3.5](https://safeexambrowser.org/macosx/mac_release_notes_en.html#new-in-seb-35)
- ปิด app switching, screen sharing/mirroring, Print Screen, clipboard ภายนอก, developer console และ task manager ตามความสามารถของแต่ละ OS
- จำกัดหนึ่งจอ ปิด VM/remote session ตามนโยบายโรงเรียน
- เปิด file upload เฉพาะเมื่อข้อสอบมีรูปวิธีทำหรือข้อส่งไฟล์
- ตั้ง Quit Password และ Admin Password ที่ผู้คุมสอบถือไว้ ห้ามแจกนักเรียน
- iOS/iPadOS ต้องตั้ง Quit Password เพื่อเข้า secure mode

KorKru ใช้ SEB JavaScript API (`SafeExamBrowser.security.*`) จึงไม่ต้องเปิดการส่ง CK/BEK ผ่าน HTTP header สำหรับ production matrix ให้กำหนดขั้นต่ำแบบ conservative เป็น **Windows 3.4+ และ macOS/iOS 3.0+** ตาม [ข้อกำหนด Config Key/JavaScript API หลัก](https://safeexambrowser.org/developer/seb-config-key.html) และอนุญาตเฉพาะรุ่นล่าสุดที่โรงเรียนทดสอบแล้วจริง

## 2. เก็บ CK และ BEK

หลังตั้งค่าเสร็จให้บันทึกไฟล์ก่อน แล้วคัดลอกค่าจาก Exam preferences:

- **Config Key** เหมือนกันข้าม Windows/macOS/iOS เมื่อใช้ config เดียวกัน แต่จะเปลี่ยนเมื่อแก้และบันทึก config ใหม่
- **Browser Exam Key** เปลี่ยนตาม platform/build ของ SEB ต้องเก็บทุก BEK ที่โรงเรียนยอมรับ
- ทั้งสองค่าเป็นเลขฐานสิบหก SHA-256 จำนวน 64 ตัว ให้คัดลอกตรงตามที่ Config Tool แสดงรวมถึงตัวพิมพ์เล็ก/ใหญ่ และเป็น secret ฝั่ง server ห้ามใส่ใน source code, หน้าเว็บ หรือ `NEXT_PUBLIC_*`

ทุกครั้งที่แก้ไฟล์ `.seb` ต้องคัดลอก CK/BEK ใหม่และ deploy environment พร้อมกัน ไม่เช่นนั้นนักเรียนทุกคนจะถูกปฏิเสธ ขั้นตอนเก็บ BEK ที่ถูกต้องคือบันทึกไฟล์สุดท้ายหนึ่งครั้ง แล้วเปิดไฟล์เดิม (ห้ามบันทึกซ้ำ) ในทุก platform/build ที่จะอนุญาตเพื่อคัดลอก BEK ของแต่ละรุ่น ตาม [คู่มือ SEB Integration](https://safeexambrowser.org/developer/seb-integration.html)

เมื่อเปลี่ยน CK หรือชุด BEK ให้ **rotate `SEB_SESSION_SECRET` ใน maintenance window เดียวกัน** เพื่อยกเลิก signed SEB session เก่าทันที หรือรอเกินอายุ session 12 ชั่วโมงก่อนถือว่า key เก่าถูกยกเลิกอย่างสมบูรณ์ การ rotate secret จะทำให้ session ที่กำลังใช้อยู่ต้องตรวจ SEB ใหม่ จึงห้ามทำกลางการสอบ

## 3. ตั้ง environment

```dotenv
# URL production ที่ browser เปิดจริง ต้องตรง canonical origin ทุกตัวอักษรและไม่มี / ท้าย
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

ก่อน deploy ให้รัน `npm run check:seb-readiness` ใน environment ที่จะใช้จริง คำสั่งนี้ตรวจรูปแบบ environment และ permission ของ `.env.local` แบบ read-only โดยไม่แสดงค่าจริงและไม่เรียก network/ฐานข้อมูล ค่า `NEXT_PUBLIC_SEB_CONFIG_URL` ที่เว้นว่างจะแจ้งเตือนเพื่อให้ยืนยันวิธีแจกไฟล์เอง แต่หากตั้งค่าไว้แล้วมีรูปแบบผิดจะเป็น blocker จนกว่าจะแก้หรือลบค่านั้น การผ่านคำสั่งนี้ยังไม่ยืนยันว่า URL ดาวน์โหลดได้หรือไฟล์ `.seb` มี policy ถูกต้อง จึงต้องทดสอบไฟล์จริงต่อ

## 4. Apply migration และ deploy

Migrations ตามลำดับ:

1. `20260830062722_add_seb_secure_exam_mode.sql`
2. `20260830072842_add_android_monitored_exam_access.sql`
3. `20260830082038_add_exam_proctor_event_review.sql`
4. `20260830085610_add_exam_seb_preflight_checkins.sql`
5. `20260830195151_harden_android_exam_approval_audit.sql`
6. `20260830200014_harden_exam_operational_table_privileges.sql`

ลำดับ rollout ที่ปลอดภัย:

1. Apply migrations ทั้งหกตามลำดับก่อน deploy code โดย migration เช็กอิน SEB ต้องตามหลังสามไฟล์แรก และ migrations hardening สองไฟล์ต้องอยู่ท้ายสุด เพราะแก้สิทธิ์กับ constraints ของตารางที่ migrations ก่อนหน้าสร้างไว้ (ค่าเดิมทุกข้อสอบเป็น `browser` จึงไม่กระทบนักเรียน และ migrations เฟส 4–5 เพิ่มข้อมูลที่ dashboard รุ่นใหม่อ่าน)
2. Deploy code + environment ทั้งหมด
3. เปิดไฟล์ `.seb` บน staging และยืนยันว่า login, Realtime, autosave, รูปวิธีทำ/ไฟล์แนบ และ submit ทำงาน
4. ทดสอบอย่างน้อย Windows, macOS และ iPhone/iPad รุ่นที่โรงเรียนจะอนุญาต
5. ทำ mock exam พร้อมกันหลายเครื่องบน Wi-Fi ห้องจริง
6. เปิด “บังคับใช้ Safe Exam Browser” เฉพาะข้อสอบนำร่องที่ยังไม่มี submission

ควร apply migration เฟส 4 นอกช่วงสอบ เพราะการสร้างดัชนีคิวรับทราบอาจรอ lock ของตาราง event หากมีข้อมูลจำนวนมากหรือกำลังรับ heartbeat/event อยู่

### สถานะ Phase 7 ณ วันที่ 2026-08-30

สิ่งที่ทำกับ production แล้ว:

- Apply migrations สี่ไฟล์แรกตามลำดับสำเร็จ และตรวจยืนยันว่าประวัติ migration ฝั่ง local/remote ตรงกัน
- Apply migrations hardening ลำดับที่ 5–6 กับ production สำเร็จเวลาประมาณ 20:00 น. (Asia/Bangkok) โดยใช้ `--skip-vault` จึงไม่แก้ Vault; ลำดับที่ 6 ถอนสิทธิ์ `MAINTAIN` ของ PostgreSQL 17 จาก role เว็บบนตาราง proctor/SEB และคืนเฉพาะ `SELECT` รวมเป็น migrations เฟสนี้ครบทั้งหกไฟล์แล้ว ทั้งนี้ทุก rollout ครั้งถัดไปยังต้องตรวจประวัติด้วย `supabase migration list --linked` ก่อน deploy

สิ่งที่ยังเป็น blocker และต้องจัดเตรียมก่อนเปิดข้อสอบ SEB จริง:

- canonical production URL ที่นักเรียนจะเปิดจริง ต้องมี origin เดียวชัดเจนและตรงกับ `NEXT_PUBLIC_SITE_URL` ทุกตัวอักษร โดยไม่มี credential หรือ `/` ท้าย รวมทั้งมีนโยบาย redirect ของ `www`/โดเมนสำรอง
- สิทธิ์เข้าถึงระบบ deploy/secret manager เพื่อกำหนด environment ฝั่ง production โดยไม่คัดลอก secret ลง repository
- CK จากไฟล์ `.seb` รุ่นสุดท้าย และ BEK แยกตามทุก platform/build ที่โรงเรียนจะอนุญาต
- ไฟล์ `.seb` ที่เข้ารหัสแล้ว พร้อม URL แจกไฟล์หรือขั้นตอนแจกแบบออฟไลน์
- supported build matrix ที่ระบุ Windows, macOS และ iOS/iPadOS รุ่นที่ทดสอบและอนุญาตอย่างชัดเจน
- staging ที่แยกจาก production พร้อมบัญชีครู/นักเรียนทดสอบและข้อสอบ fixture สำหรับทดสอบ login, Realtime, autosave, upload, reconnect และ submit โดยไม่สร้างข้อมูลทดสอบใน production

รายการนี้เป็น production-readiness gate ไม่ควรแทนที่ด้วยค่า CK/BEK ปลอมหรือทดสอบสร้าง submission บนฐานข้อมูลจริง เมื่อได้ข้อมูลครบแล้วให้ deploy environment และไฟล์ `.seb` ไป staging ก่อน ทำ automated integration test ที่ไม่แตะ production แล้วจึงทดสอบเครื่องจริงตาม platform/build matrix

หลัง deploy ให้ครูเปิด **การตั้งค่า → ตั้งค่าข้อสอบเริ่มต้น** ระบบจะแสดง readiness checklist โดยส่งไปหน้าเว็บเฉพาะสถานะและจำนวน BEK ที่ไม่ซ้ำ ไม่ส่งค่า secret, CK หรือ BEK ออกจาก server

รายการที่เป็นตัวบล็อกการเผยแพร่ข้อสอบ SEB:

- migration ยังไม่ถูก apply
- `NEXT_PUBLIC_SITE_URL` ไม่ใช่ origin ที่ถูกต้อง หรือไม่ใช่ HTTPS ใน production
- `SEB_SESSION_SECRET` สั้นกว่า 32 ตัวอักษร
- `SEB_CONFIG_KEY` ไม่ใช่ 64 hex
- ไม่มี BEK ที่เป็น 64 hex อย่างน้อยหนึ่งค่า

การ **เว้นว่าง** `NEXT_PUBLIC_SEB_CONFIG_URL` ไม่บล็อก server publish เพราะโรงเรียนอาจแจกไฟล์ `.seb` เอง และ Phase 7 CLI จะแจ้งเพียง warning แต่หากตั้งค่า URL ไว้แล้วรูปแบบผิด server readiness ยังแสดง warning ขณะที่ `npm run check:seb-readiness` จะ exit ไม่สำเร็จเพื่อหยุด deploy จนกว่าจะแก้หรือลบค่านั้น ทั้งสองส่วนตรวจเพียงรูปแบบ ไม่ทดสอบว่า URL ปลายทางดาวน์โหลดได้จริง จึงต้องเปิดไฟล์จากเครื่องทดสอบด้วย

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
6. เก็บเฉพาะผลที่ผ่านล่าสุดหนึ่งรายการต่อ assignment + นักเรียน ได้แก่เวลาผ่าน, เวลาหมดอายุไม่เกิน 12 ชั่วโมง, platform และ version; ไม่เก็บผลที่ไม่ผ่าน, raw CK/BEK/request hash, IP, user-agent หรือ device fingerprint

ห้องคุมสอบนำ roster มาจับคู่กับผลล่าสุดและแสดง **พร้อม / หมดอายุ / ยังไม่ตรวจ** โดยอ่านผ่าน RLS ทุก 10 วินาทีและทันทีเมื่อครูกลับเข้าแท็บ ไม่ publish ตารางนี้ผ่าน Postgres Changes เพราะ RLS ไม่ครอบคลุม payload ของ `DELETE` ครูจึงเห็นนักเรียนที่ยังต้องแก้เครื่องก่อนเริ่มสอบได้โดย system check ยังไม่สร้าง submission/attempt หรือเริ่ม timer หากเพิ่มหรือถอดนักเรียนขณะเปิดห้องคุมสอบ ให้กด **รีเฟรชรายชื่อ** บนการ์ดนี้

ผลผ่านยืนยันเฉพาะเครื่อง, รุ่น SEB, ไฟล์ตั้งค่า, บัญชี และเครือข่ายที่ใช้ตรวจครั้งนั้น ถ้าเปลี่ยนเครื่อง อัปเดต SEB หรือบันทึกไฟล์ `.seb` ใหม่ต้องตรวจซ้ำ และควรตรวจซ้ำในวันสอบแม้เคยผ่านล่วงหน้า สถานะนี้ไม่ใช่ตัวระบุเครื่อง ไม่พิสูจน์ว่ายังใช้เครื่องเดิม ไม่ใช่หลักฐานว่าปกติหรือทุจริต และไม่ได้เป็น hard gate ตอนเริ่มข้อสอบ—server ยังตรวจ signed SEB session ที่ใช้งานจริงทุก boundary ตามเดิม

## 6. บัญชีนักเรียนและวันสอบ

- ให้นักเรียนติดตั้งและทำ system check ก่อนวันสอบ ไม่ดาวน์โหลดพร้อมกันหน้าห้อง
- แนะนำ email/password สำหรับวันสอบ Google OAuth และ magic link อาจออกนอก URL filter หรือเปิดแอปอื่น จึงต้องทดสอบแยกก่อนอนุญาต
- มีเครื่องสำรองและขั้นตอนออกจาก SEB ด้วย Quit Password สำหรับเหตุขัดข้อง
- ครูเปิด “ห้องคุมสอบสด” และตรวจป้าย “SEB ยืนยันแล้ว · Windows/macOS/iOS” ก่อนเริ่มจับเวลา
- อย่าตัดสินทุจริตอัตโนมัติจาก event เดียว ใช้เหตุการณ์เป็นหลักฐานประกอบกับการสังเกตในห้อง

### Runbook ก่อนวันสอบ

1. ครูยืนยันว่า readiness เป็น “พร้อมเผยแพร่ข้อสอบ SEB”
2. แจกไฟล์ `.seb` และให้นักเรียนทุกคนทำ system check ด้วยอุปกรณ์จริง
3. เปิด roster ก่อนสอบ ตรวจสถานะ “พร้อม/หมดอายุ/ยังไม่ตรวจ” แล้วตามแก้เครื่องของนักเรียนที่ยังไม่มีสถานะพร้อมก่อนวันสอบ ไม่แจก Quit/Admin Password
4. ทำ mock exam ที่มี autosave, Realtime, upload และ submit บน Wi-Fi ห้องสอบจริง
5. เตรียมเครื่องสำรอง ไฟล์ `.seb` สำรอง และช่องทางแจ้งผู้ดูแลเมื่อ key mismatch

### Runbook วันสอบ

1. ให้นักเรียนปิดโปรแกรมอื่นและเปิดไฟล์ `.seb` ที่กำหนด
2. ให้นักเรียนทำ system check อีกครั้งก่อนแจก access code
3. ครูเปิดห้องคุมสอบสด ตรวจ roster เช็กอินก่อนสอบและป้าย OS/SEB ที่ยืนยันแล้ว ให้นักเรียนที่ “หมดอายุ/ยังไม่ตรวจ” ทำ system check จนผ่าน
4. ครูกด “เปิดเสียงแจ้งเตือน” และ “ทดสอบเสียง”; หากอนุญาต Browser Notification ระบบจะแจ้งนอกแท็บได้เฉพาะตราบใดที่หน้าห้องคุมสอบยังเปิดอยู่
5. จึงแจก access code และให้นักเรียนกดเริ่มสอบ
6. เมื่อพบสัญญาณให้ตรวจบริบทในห้องแล้วกด “รับทราบ” เพื่อแยกคิวที่ครูเห็นแล้ว การกดนี้ไม่ใช่คำตัดสินว่าปกติหรือทุจริต
7. หากเครื่องหลุด ห้ามสั่งสร้าง attempt ใหม่ทันที ให้เปิด SEB เดิมแล้ว resume; session หมดอายุจะบังคับตรวจใหม่
8. เหตุฉุกเฉินให้ครูเป็นผู้ใช้ Quit Password และจดเหตุการณ์ประกอบ ไม่ให้นักเรียนรู้รหัส

### หลังสอบและรายงานสัญญาณ

1. เปิด “รายงานสัญญาณคุมสอบ” แล้วกรองตามนักเรียน, attempt, ชนิดสัญญาณ หรือสถานะรับทราบ รายงานแบ่งหน้าที่ server และแสดงเฉพาะข้อมูลที่ครูผู้จัดการข้อสอบมีสิทธิ์อ่าน
2. ใช้เวลา server เป็นลำดับหลัก เวลาจากเครื่องนักเรียนเป็นเพียงข้อมูลประกอบที่เชื่อถือเป็น authority ไม่ได้ ตรวจสัญญาณร่วมกับสิ่งที่ครูสังเกตในห้องและบริบทของการ reconnect/เปลี่ยนหน้าต่าง การรับทราบหมายถึงครูเห็นรายการแล้ว ไม่ใช่คำตัดสินว่าปกติหรือทุจริต
3. ดาวน์โหลด CSV เฉพาะเมื่อมีวัตถุประสงค์จำเป็น ระบบจะ query ตามตัวกรองใหม่และตรึงขอบเขต event ใหม่ด้วย ID สูงสุดจาก query แรก หากข้อมูลเปลี่ยนจนจำนวน/ความสัมพันธ์ไม่ตรงหรือเกิน 10,000 แถว/2,000 attempts/4 MiB จะปฏิเสธทั้งไฟล์โดยไม่ตัดข้อมูลเงียบ ๆ กลไกนี้ไม่ใช่ transactional snapshot และไฟล์เป็นสำเนาที่แก้ไขได้ ไม่ใช่หลักฐานแบบ tamper-proof
4. ข้อมูลใน KorKru ถูกลบตามเพดาน 90 วันหรือเมื่อครูล้างก่อนกำหนด แต่ไฟล์ที่ดาวน์โหลดจะไม่ถูกลบตามไปด้วย ให้เก็บในพื้นที่จำกัดสิทธิ์ ไม่ส่งต่อเกินจำเป็น และลบเองเมื่อหมดวัตถุประสงค์

## 7. การทำงานและ rollback

เมื่อข้อสอบตั้ง `seb_required`:

1. KorKru ออก challenge อายุ 5 นาที ผูกกับผู้ใช้และข้อสอบ
2. SEB ส่ง CK/BEK request hashes สำหรับ URL challenge ปัจจุบันผ่าน JavaScript API
3. Server ตรวจ origin, path, challenge, CK, BEK และรูปแบบ version แล้วออก HttpOnly session
4. Server ตรวจ session ซ้ำตอนเริ่ม/resume, อ่านข้อสอบ, autosave, แนบรูป/ไฟล์, heartbeat และ submit
5. attempt เก็บเฉพาะเวลา, platform และ version ที่ยืนยัน ไม่เก็บ raw key, request hash, IP, user-agent หรือ device fingerprint
6. system check ที่ผ่าน upsert เฉพาะผลล่าสุดผ่าน service-role-only RPC หลังตรวจซ้ำว่า assignment เผยแพร่, บังคับ SEB และนักเรียนยังอยู่ใน roster; RLS ให้เฉพาะครูที่จัดการข้อสอบอ่าน และข้อมูลนี้ถูกลบอัตโนมัติเมื่อเกิน 90 วันหรือเมื่อครูใช้คำสั่งล้างข้อมูลคุมสอบรายข้อสอบ

หากต้อง rollback ให้ปิดสวิตช์เป็น `browser` ได้เฉพาะข้อสอบที่ยังไม่มีผู้เริ่มทำ สำหรับข้อสอบที่เริ่มแล้วให้ปิด/ทำสำเนาข้อสอบใหม่แทน ระบบตั้งใจล็อกการเปลี่ยนโหมดกลาง attempt เพื่อไม่ทำให้นักเรียนถูกกันออกจากคำตอบของตน

## ข้อจำกัด

- ตัว SEB ไม่มี Android; เครื่อง Android ใช้ monitored web mode แยกที่ความมั่นใจต่ำกว่าและต้องตรวจเครื่องต่อหน้า
- ไม่มี remote quit/control จาก SEB Server
- ไม่สามารถป้องกันกล้องจากอุปกรณ์อื่นได้ (สถานการณ์ใช้งานจึงต้องมีครูเดินคุม)
- ความปลอดภัยขึ้นกับไฟล์ `.seb`, รุ่น OS/SEB, นโยบายเครื่อง และการทดสอบจริง ไม่ใช่สวิตช์ใน KorKru เพียงอย่างเดียว
- การรองรับ accessibility, keyboard ภาษาไทย, PDF, file picker และ assistive technology ต้องทดสอบตามกลุ่มนักเรียนจริงก่อนสอบ
- System check ไม่สามารถพิสูจน์ว่านักเรียนจะไม่เปลี่ยนเครือข่ายภายหลัง และไม่ได้จำลอง Realtime/upload/submit แบบครบวงจร จึงยังต้องมี mock exam
- Roster preflight แสดงประวัติการตรวจล่าสุดเท่านั้น ไม่ใช่กลไกผูกตัวเครื่องและไม่ควรใช้ตัดสินการทุจริตหรือกันเริ่มสอบเพียงลำพัง
- เว็บปกติไม่มี API ที่เชื่อถือได้สำหรับตรวจว่า OS แคปหน้าจอสำเร็จหรือไม่ การปิด screenshot/app switching ต้องมาจากนโยบายในไฟล์ `.seb` และความสามารถของแต่ละ OS
- เสียงและ Browser Notification ไม่ใช่ Web Push: ต้องเปิดจากปุ่มของครูต่อการเปิดหน้า และหยุดทำงานเมื่อปิด dashboard หรือ browser

## เอกสารทางการที่ใช้อ้างอิง

- [SEB Downloads](https://safeexambrowser.org/download_en.html)
- [Config Key และ JavaScript API](https://safeexambrowser.org/developer/seb-config-key.html)
- [การเก็บ Config Key/Browser Exam Key เพื่อเชื่อมกับระบบสอบ](https://safeexambrowser.org/developer/seb-integration.html)
- [macOS release notes](https://safeexambrowser.org/macosx/mac_release_notes_en.html)
- [iOS/iPadOS release notes](https://safeexambrowser.org/ios/ios_release_notes_en.html)
