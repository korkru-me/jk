# รูปข้อย่อยและปุ่มเฉลยถูก–ผิด — 20 พฤศจิกายน 2026

เจ้าของอนุมัติให้นำการแก้ในแชทนี้ขึ้นเว็บจริง โดยแยกจากงานอื่นที่ค้างใน primary checkout

## ขอบเขต

- ทุกข้อความย่อยของถูก–ผิดเพิ่มรูปประกอบได้ ข้อหลักเก็บรูปในช่องเดิม ข้อย่อยใช้ optional `extra_data.statements[].image_urls` โดยไม่มี migration
- ปุ่มเฉลยข้อหลักและข้อย่อยสูง 44px กว้างตามข้อความ มีสถานะและ focus สำหรับคีย์บอร์ด
- รูปติดกับข้อความย่อยในตัวอย่าง หน้าทำข้อสอบ คลังฝึก และหน้าตรวจครู Safe DTO เก็บรูปและตัด answer key เหมือนเดิม
- Word อ่านรูปในย่อหน้าข้อความย่อย หรือย่อหน้าที่มีแต่รูปต่อจากข้อความนั้น คู่มือและไฟล์ตัวอย่างพร้อม round-trip test รองรับแล้ว ไม่ใช้พิกัด floating เพื่อเดาความสัมพันธ์
- ไม่มี auth/RLS/Storage policy หรือ scoring change ใช้ตัวอัปโหลดเดิม

## Candidate และ primary

- Release branch `codex/true-false-images-release-20261120` ตั้งจาก Production `71bdee02eeec931be0728c85e706b10754c45eac`
- Primary `/Users/korkusonmasaen/Korkru/korkru` branch `codex/student-classroom-cards` เป็น shared dirty checkout จึงแยกเฉพาะ scope ไม่ reset/stash/stage งานอื่น
- Local ก่อนปล่อยผ่าน TypeScript, token lint, production build, 4,947 tests และ 226 targeted tests หลังแก้ parser รอบสุดท้าย
- Browser local ที่ 390px ปุ่มสูง 44px ทุกข้อ เพิ่มข้อย่อยแล้วมีช่องรูปครบ ไม่ล้นแนวนอน เก็บ URL ในร่างและแสดงรูปในตัวอย่างได้ Next.js MCP ไม่มี runtime/compilation error
- Candidate ใช้ค่า public จำลองสำหรับ local build ไม่มีการนำ Production credentials หรือข้อมูลจริงไปทดสอบ

## Candidate validation

ผ่าน TypeScript, token lint, production build ด้วยค่า public จำลอง และ full test suite ของ candidate 349 suites / 4,906 tests โดยไม่มีการเรียกฐานข้อมูลจริง

## สถานะ

- Staging PR [#144](https://github.com/korkru-me/jk/pull/144) merge `3e7af764bbe4e9a265da6fb8b9fdcdaaf11bff23` และ Vercel `dpl_3BANheDLJFGdCY93T6JYehXHAM1b` READY พร้อม alias `staging.korkru.com`
- ยืนยันป้าย STAGING และตรวจ hosted synthetic form: เพิ่มข้อย่อยแล้วช่องรูปเพิ่มครบ ปุ่ม 44px เลือกเฉลยเปลี่ยนได้ ร่างเก็บ URL ของรูปครบ และแสดงรูปในตัวอย่างทั้งสองโหมดการตอบ ใช้ข้อมูลจำลอง ไม่มี Auth/Storage/database writes
- Production PR [#145](https://github.com/korkru-me/jk/pull/145) merge `5bb741b3840f922f69d68972d6c334abe2127296` หลัง Staging ผ่าน Vercel `dpl_6qZEFa28EgvmvebwJLTkEVo1bKVS` READY พร้อม canonical domain `www.korkru.com` / `korkru.com`
- Primary scoped source ผ่าน reverse-patch parity check ครบทุก application path รวม lab งานอื่นคงอยู่ทั้งหมด หลัง Production READY ตรวจร่างและรูปในตัวอย่างบน primary localhost:3000 แล้ว
- ยังไม่ได้ทดสอบการอัปโหลด Storage จริงหรือบันทึกโจทย์จริงในการปล่อยรอบนี้ ตัวอัปโหลดและ server action ใช้ของเดิม ไม่มี migration

## ผลหลัง Production READY

- เปิดหน้าสร้างจริง เพิ่มข้อย่อยใน state ของฟอร์ม พบปุ่มแทรกรูป 2 ชุดและปุ่มเฉลยสูงประมาณ 44px ทั้ง 4 ปุ่ม ไม่กดบันทึกหรืออัปโหลด ไม่สร้าง/แก้/ลบข้อมูล Production
- Primary process PID 5498 บน port 3000 ให้บริการ checkout `/Users/korkusonmasaen/Korkru/korkru`; ตรวจร่างเก็บ URL และตัวอย่างแสดงรูปหลัง deploy โดยใช้ fixture
- จอ local 390px เพิ่มข้อย่อยแล้วปุ่มแทรกรูปครบ 3 ชุด ปุ่มเฉลยทั้ง 6 ปุ่มสูง 44px, document scrollWidth = 390px และ Next.js MCP get_errors ไม่มี config/session errors
- เอกสาร handoff push บน release branch แยก ไม่มี migration ใหม่หรือ blocker ค้าง Application ของ Production คือ merge commit `5bb741b3840f922f69d68972d6c334abe2127296`
