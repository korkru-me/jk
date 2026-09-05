# รหัสออก SEB รายครู/ข้อสอบ — เตรียมระบบและทดสอบ

อัปเดต 5 กันยายน 2026 · คู่มือนี้ไม่ใช่การยืนยันว่าพร้อมใช้สอบจริง

## สถานะและขอบเขต

ระบบสอบ SEB เดิมที่ใช้ CK + BEK และไฟล์ production เดิมยังทำงานตาม [SEB_SETUP.md](SEB_SETUP.md) ไม่ได้เปลี่ยนเป็นรหัสรายครูในรอบนี้

สิ่งที่เพิ่มแล้วคือหน้าเจ้าของข้อสอบบันทึก/แทนที่/ลบ **ร่างรหัส** พร้อม encrypted storage, revision กันเขียนทับจากหลายแท็บ และ metadata audit ฟีเจอร์ปิดโดย default; ยังไม่ apply migration, ตั้ง keyring จริง หรือ deploy ไม่ใช่การแก้ Quit Password ของไฟล์ `.seb` ที่แจกแล้ว

เฟส 4–5 ยังไม่ได้ implement: SEB Server integration, verified native/student connection mapping, published config รายข้อสอบ, ดาวน์โหลดไฟล์ราย revision และออกหลังส่ง/ครูอนุญาตออก งานที่เหลือไม่ใช่แค่ทดสอบแอป ผู้ใช้จะทดสอบ native SEB ด้วยตนเองเมื่อ implementation พร้อม ห้าม agent เปิดแอป SEB เพื่อทดสอบแทน

## สิ่งที่ต้องตัดสินใจก่อนต่อเฟส 4

ต้องทราบว่าจะใช้ SEB Server ที่มีอยู่แล้วหรือจัดเตรียมเครื่องใหม่ รวมถึงผู้ดูแล/สถานที่โฮสต์/ขอบเขต staging และ production ไม่มีการอนุมัติเช่าบริการ ลง Docker เปิด port หรือ deploy production ในงานนี้

หากมี server แล้ว ขอเฉพาะ URL และข้อมูลรุ่น/ผู้ดูแลก่อน ไม่ส่งรหัส admin/token ในแชต หากยังไม่มี ใช้ [lab เฟส 2](SEB_PHASE2.md) เป็นจุดเริ่มต้นหลังตกลงเครื่องเป้าหมาย เครื่องที่ทำงานรอบนี้ไม่มี Docker; loopback lab `127.0.0.1:18080` ไม่สามารถใช้ทดสอบจาก iPad หรือเครื่องนักเรียนได้ ต้องออกแบบ TLS/network ทดลองก่อน

ห้ามปิด BEK, ยอมรับ unknown ASK, รับผล crowd heuristic เป็น trusted build หรือใช้สถานะ server `Active` แทนหลักฐาน เพื่อทำให้ขั้นตอนดูเหมือนเสร็จ รายละเอียด protocol ที่ต้องพิสูจน์อยู่ใน [เฟส 2](SEB_PHASE2.md)

มีเครื่องมืออ่าน exact connection ใน lab เตรียมไว้เพิ่มแล้ว พร้อม tests ปฏิเสธ wrong exam/organization/connection และไม่เปิดเผย token/ข้อมูลเครื่อง ดูขั้นตอน 3ก ในเอกสารเฟส 2 ยังไม่ใช่ runtime integration และไม่ต้องเปิด SEB เพื่อใช้หน้าเว็บร่างรหัส

## เปิดทดสอบเฉพาะร่างบน staging — สำหรับผู้ดูแลระบบ

ขั้นตอนนี้ **ยังไม่เปิดให้สอบด้วยรหัสใหม่** และต้องตกลงฐาน/deployment เป้าหมายก่อน:

1. ตรวจ branch/commit, environment เป้าหมาย และ `supabase migration list` อีกครั้ง ก่อนสร้าง migration รอบนี้ local/remote ตรงกัน หลังสร้างจะมี `20260905072556_add_exam_seb_password_drafts.sql` pending หนึ่งไฟล์ ถ้าพบ gap อื่นให้หยุดตรวจ ไม่ใช้ reset/repair หรือ push เพื่อ replay history เก่า
2. ตรวจ backup/rollback และ apply เฉพาะ migration ที่ตรวจแล้วด้วย workflow ของโปรเจกต์ ต้องมี `pg_cron` ตาม migrations เดิม ไม่ใช้ฐานนักเรียนจริงเป็น fixture และไม่ replay migrations ทั้งชุดเพื่อสร้างฐานใหม่ เพราะ history ไม่ใช่ clean rebuild script
3. รัน `npm run seb:password:prepare-keyring` บนเครื่องผู้ดูแล จะได้ path `.local/seb-password-…/keyring.env` ไม่พิมพ์ secret ไฟล์ permission 0600 และ directory 0700 ถูก git ignore สคริปต์ไม่แก้ `.env.local`, ไม่ตั้งค่า Vercel, ไม่ rotate key เดิม และไม่เปิดฟีเจอร์
4. เก็บไฟล์ในที่จำกัดสิทธิ์และ backup keyring แยกจาก DB จากนั้นนำค่า `SEB_PASSWORD_ACTIVE_KEY_ID` และ `SEB_PASSWORD_KEYRING` เข้า secret manager ของ staging แบบ server-only บน Vercel ใส่ KEYRING เป็น JSON object ตามเนื้อหา **ไม่รวมเครื่องหมาย single quote ครอบค่าของ dotenv** ห้ามใช้ `NEXT_PUBLIC_*` และห้ามแทนด้วย CK/BEK/SEB_SESSION_SECRET
5. ยังเก็บ `SEB_PASSWORD_DRAFTS_ENABLED=false` จน schema/keyring พร้อม ทดสอบ backup/restore กับข้อมูลสมมติแล้วจึงเปิดเป็น string `true` และ deploy staging ตาม workflow ที่อนุมัติ ฟีเจอร์นี้ไม่ใช่ readiness flag ของ SEB Server
6. ตรวจสิทธิ์จริงด้วย teacher A, teacher B, student และ session หมดอายุ ตรวจว่า cron job `purge-expired-exam-seb-password-drafts` ลงทะเบียนและทำงานจริง ไม่มี plaintext/envelope/SQL parameter ใน app/DB error logs

ไม่ได้รันขั้นตอน apply/enable/deploy เหล่านี้ในงานรอบนี้ การมีโค้ดหรือ build ผ่านไม่ยืนยันว่าฐานจริงมีตารางแล้ว

### Rollback และ key recovery

ปิด `SEB_PASSWORD_DRAFTS_ENABLED=false` และ deploy กลับเพื่อหยุดการใช้งานร่าง โดยไม่ reset DB หรือแก้ระบบสอบเดิม เก็บ keyring และ schema ไว้ตาม retention/recovery plan ไม่ลบ key ขณะยังมี encrypted drafts หรือ backups ที่ต้องกู้คืน

การหมุน master key ใช้ active ID ใหม่และเก็บ old keys (รวมไม่เกิน 5) จนพ้น retention/backup recovery ต้องตรวจ restore ใน staging; ไม่มี automatic rotation ในโค้ดนี้ หาก key หาย ร่างที่เข้ารหัสด้วย key นั้นกู้ไม่ได้ ให้ผู้ดูแลแก้ readiness แล้วเจ้าของตั้งร่างใหม่ ห้าม fallback รหัสกลาง

Secret อายุ 30 วัน (ล้างจริงตาม job รายวัน) และ audit 90 วัน การ purge ไม่ได้ตามลบ DB backups หรือไฟล์ keyring ส่วนตัว ต้องมี retention สำหรับสำเนาเหล่านี้ด้วย

## ทดสอบหน้าครู — หลัง staging พร้อม

ใช้บัญชีและข้อสอบสมมติที่ได้รับอนุญาต ไม่ปรับข้อสอบที่มีนักเรียนกำลังทำอยู่เพื่อทดสอบ:

1. เข้าสู่ระบบครู A → **ห้องเรียน** → เลือกห้อง → **งานที่มอบหมาย** → เปิดข้อสอบออนไลน์ของครู A ที่ตั้งให้ใช้ SEB แล้ว
2. กด **ร่างรหัสออก SEB** หน้าใหม่ต้องบอกว่า **ยังไม่ใช้กับการสอบจริง** ถ้าไม่เห็นปุ่ม ให้ตรวจว่าเป็นเจ้าของเองและเป็นข้อสอบออนไลน์ที่เปิด SEB ไม่ใช่แบบฝึกหัด/ครูร่วม
3. ถ้ายังไม่ตั้ง schema/keyring/feature flag จะเห็นข้อความระบบยังไม่พร้อม ต้องไม่มีฟอร์มที่อ้างว่าบันทึกสำเร็จ
4. กรอกรหัสสมมติใน **รหัสออกใหม่สำหรับข้อสอบนี้** และ **ยืนยันรหัสออกใหม่** ใช้ ASCII 12–64 ตัว ไม่มีช่องว่าง ไม่ใช้รหัสเข้าสู่ระบบ KorKru กด **บันทึกร่างรหัส**
5. ต้องเห็นข้อความบันทึก *ร่าง* สำเร็จ เลขเวอร์ชันเพิ่มและช่องรหัสว่าง กด **โหลดข้อมูลล่าสุด** แล้วยังเห็น metadata เดิม โดยไม่มีช่องเปิดดูรหัส/envelope ปุ่มนี้โหลดหน้าใหม่ทั้งหน้า
6. ลองยืนยันไม่ตรง/รหัสสั้น/มีช่องว่าง ต้องไม่บันทึก ลองบันทึกใหม่ทันทีต้องเจอ cooldown 10 วินาที ถ้าเครือข่ายขาดหรือผลไม่แน่ชัดต้องให้โหลดข้อมูลล่าสุดก่อน ไม่ retry เขียนทับเงียบ ๆ
7. เปิดสองแท็บจาก revision เดียวกัน บันทึกแท็บแรก รอพ้น cooldown แล้วบันทึกจากแท็บที่สอง ต้องเจอข้อมูลเปลี่ยนจากอีกแท็บ ไม่แทนที่ร่างแรกอัตโนมัติ
8. กด **ลบร่างรหัส** → ลองยกเลิก (ข้อมูลต้องคงเดิม) → กดอีกครั้งและยืนยัน ต้องเพิ่ม revision และแสดงลบร่าง ไฟล์ SEB ที่แจกแล้ว/คำตอบ/คะแนนไม่เปลี่ยน ลบร่างแล้วกู้ plaintext ไม่ได้
9. ครู B แม้อยู่โรงเรียนเดียวกันและ student เปิด URL เดียวกันต้องไม่ได้สิทธิ์ ทดลอง action หลัง logout/ถูกพักบัญชี/ถูกถอดสมาชิกใน staging ต้องถูกปฏิเสธเช่นกัน
10. ผู้ดูแลตรวจ response ว่ามีเฉพาะ metadata ไม่มีกุญแจ/envelope/plaintext; รหัสอยู่ใน authenticated save request เท่าที่ต้องใช้ ห้ามบันทึก HAR, screenshot รหัส, raw SQL parameters หรือข้อมูลผู้ใช้จริงลงเอกสารทดสอบ

รอบนี้ตรวจ local browser แบบอ่านอย่างเดียวแล้วเฉพาะกรณีข้อสอบไม่ได้เปิด SEB: ไม่แสดงปุ่มและเข้าหน้ารหัสถูกปฏิเสธ ยังไม่ได้ทดสอบ save/discard บน Supabase จริง

## การทดสอบ SEB ที่ผู้ใช้จะทำภายหลัง — ยังไม่ให้เริ่มตอนนี้

เมื่อ implementation เฟส 4–5 และ server staging พร้อมแล้ว จึงนัดทดสอบพร้อมเตรียมรหัส/ทางออกฉุกเฉินเฉพาะชุดทดสอบก่อนทุกครั้ง ขั้นตอน native A/B อยู่ใน [SEB_PHASE1.md](SEB_PHASE1.md) รายการตรวจรับที่ต้องทำเพิ่ม:

- Mac, iPad และ Windows ที่ประกาศรองรับ: import config A/B ได้, CK ตรงไฟล์, BEK ตรง native build และรหัสออกของ A/B ไม่ใช้แทนกัน ไม่ถือว่าผลเครื่องหนึ่งยืนยันอีกระบบ
- ครู A/B คนละองค์กร: ไฟล์และรหัสไม่ข้ามครู/ข้อสอบ/องค์กร ตรวจ exact config revision + student attempt + SEB connection ฝั่ง server ไม่รับ mapping จาก browser
- เปลี่ยนรหัส: ต้องอธิบายชัดว่าไฟล์เก่า/session เก่าใช้ revision ไหน การเปลี่ยนรหัสบนเว็บไม่สามารถเปลี่ยนค่าที่ฝังอยู่ในไฟล์ที่ดาวน์โหลดไปแล้วทันที ต้องมี publish/reissue/retirement policy และ immutable release records
- ส่งข้อสอบสำเร็จแล้วจึงอนุญาตออก; ส่งไม่สำเร็จ/ยังไม่ส่ง/replay คำขอ/ครูคนอื่น ต้องไม่ออก การซ่อนปุ่มหรือ static Quit URL ไม่เพียงพอ เพราะ native อาจ intercept ก่อน HTTP ไปถึงเว็บ
- ขอออกกลางคันต้องผูกครูเจ้าของกับนักเรียน/attempt/connection เดียว มีการหมดอายุ/ใช้ครั้งเดียวตาม protocol ที่ยืนยันแล้ว ไม่ใช่เผยรหัสกลางทั้งระบบ
- Server ล่ม, connection stale/reconnect, ASK ไม่รู้จัก/ยังไม่ได้อนุมัติ, BEK ผิด หรือไม่มีหลักฐานต้องไม่ถูกยอมรับเป็น verified และต้องมี recovery ที่ไม่ทำคำตอบหาย

จนผ่านขั้นตอนเหล่านี้ ห้ามเปิดบริการรหัสรายครูให้การสอบจริงหรือเขียนว่าเฟสทั้งหมดเสร็จแล้ว
