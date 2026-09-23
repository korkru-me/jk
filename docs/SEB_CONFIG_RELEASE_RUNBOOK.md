# SEB v1 — versioned config, key enrollment และ rollback

อัปเดต: 22 กันยายน 2026

เอกสารนี้เป็น runbook ของเฟส S2 ห้ามใส่ CK, BEK, Quit/Admin Password, access token
หรือค่า secret ใด ๆ ลง Git, issue, screenshot หรือแชต ให้กรอกค่าเหล่านี้ใน secret manager
โดยเจ้าของผลิตภัณฑ์โดยตรงเท่านั้น

## สถานะ candidate ที่ตรวจได้จาก repository

- config id: `korkru-production-v1`
- immutable revision:
  `korkru-production-v1-ce946d68df1f9a127b63a8cd16ad3f04a1d93c5e2c82c3b77b09174ae6e14cec`
- public path ที่คาดหวัง: `/exam/korkru-production-v1.seb`
- SHA-256 ของไฟล์ 8,813 bytes ใน repository:
  `ce946d68df1f9a127b63a8cd16ad3f04a1d93c5e2c82c3b77b09174ae6e14cec`
- canonical start URL ที่คาดหวัง: `https://www.korkru.com/assignments`

ข้อมูลนี้พิสูจน์ว่า repository อ้างถึงไฟล์ bytes ชุดใด แต่ **ยังไม่พิสูจน์ค่าภายในไฟล์ที่
เข้ารหัส** จนกว่าเจ้าของจะเปิดไฟล์เดียวกันใน Config Tool/native SEB และตรวจรายการด้านล่าง
ห้ามบันทึกไฟล์ซ้ำระหว่างเก็บ CK/BEK เพราะการบันทึกใหม่ทำให้ revision/key เปลี่ยน

### Staging revision สำหรับ integration รอบปัจจุบัน

ไฟล์ที่เจ้าของผลิตภัณฑ์สร้างจาก Windows SEB 3.10.2 build 920 ถูกเก็บแยกจาก production
candidate เพื่อทดสอบบน `https://staging.korkru.com` เท่านั้น:

- config id: `korkru-staging-v1`
- immutable revision:
  `korkru-staging-v1-d85fd70bbdc53cbda9e3c1c19cb09479f277f3f507f5232c263c6810bc591f6a`
- public path: `/exam/korkru-staging-v1.seb`
- SHA-256: `d85fd70bbdc53cbda9e3c1c19cb09479f277f3f507f5232c263c6810bc591f6a`
- canonical start URL: `https://staging.korkru.com/assignments`

ไฟล์นี้เป็น password-encrypted SEB settings (`pswd`) ไม่ใช่ plaintext XML แต่ policy,
Windows build approval, BEK registration, mock exam และ physical UAT ยังเป็น `pending` จนกว่า
จะเปิด bytes ชุดนี้โดยไม่บันทึกซ้ำและทดสอบ native flow สำเร็จ ห้ามนำผลจาก revision นี้ไปนับเป็น
production evidence และ top-level `candidateRevision` ยังคงชี้ production candidate เดิม

Staging runtime สามารถผูก `SEB_CONFIG_REVISION` กับ revision นี้และลงทะเบียนเฉพาะ Windows BEK
เพื่อทำ native integration ทีละ platform ได้ แต่ teacher publish gate จะยังไม่ READY เพราะ policy,
build matrix และ BEK coverage ยังไม่ครบทุก target ตามที่ออกแบบไว้

`config/seb-release-registry.json` เป็น fixed-schema metadata ที่ไม่เก็บ secret ส่วน
`config/seb-platform-evidence.json` เก็บสถานะหลักฐานและอ้าง `buildId` จาก revision เดียวกัน
ตัวตรวจจะไม่ยอมรวมหลักฐานเก่าที่มีเพียง config id หรือรุ่นแบบกว้าง ๆ

## 1. จุดที่เจ้าของต้องยืนยันบน native SEB

ทำตอนที่ไม่มีห้องสอบกำลังใช้งาน และเริ่มจากไฟล์ candidate ที่ดาวน์โหลด/คัดลอกมาจาก bytes
ชุดเดียวกับ checksum ด้านบน:

1. เปิดไฟล์โดยไม่แก้หรือบันทึกซ้ำ แล้วตรวจว่า Start URL ตรง canonical URL
2. ตรวจ navigation/content filters ว่าอนุญาตเฉพาะ KorKru และ endpoint Supabase ของ environment
   ที่ต้องใช้; ห้ามอนุญาต wildcard กว้างเกินความจำเป็น
3. ตรวจว่า upload เปิดเฉพาะกรณีโจทย์แนบรูป/ไฟล์ และ file picker/camera ใช้ได้ตาม platform
4. ยืนยันว่ามี Quit Password และ Admin Password แยกกัน ผู้คุมสอบถือไว้ และนักเรียนไม่เห็น
5. ยืนยันช่องทางแจกไฟล์: ลิงก์ HTTPS ของ KorKru หรือช่องทางโรงเรียนที่ควบคุมสิทธิ์ได้
6. ในแต่ละ platform/build ที่จะประกาศจริง ให้จดเฉพาะ OS, `versionString`, `buildNumber`
   และ `buildId` ลง registry จากนั้นเปลี่ยน `approval` เป็น `approved`
7. คัดลอก production CK และ BEK จาก native tool ไป secret manager โดยตรง ห้ามส่งค่ามาให้ Agent
8. เปลี่ยน policy ทั้งหกรายการใน registry เป็น `approved` เฉพาะสิ่งที่ตรวจจริงแล้ว

iPhone และ iPad แยก physical UAT กัน แต่ JavaScript API รายงาน runtime platform เป็น `iOS`
จึงใช้ `runtimePlatform: "ios"` ทั้งคู่ หาก version/build เหมือนกัน entry ใน secret registry
อาจใช้ BEK เดียวกันได้ แต่ต้องยืนยันจากไฟล์ final และ build จริง ห้ามอนุมานจากชื่อรุ่น

## 2. Environment contract ใหม่

ระบบไม่ใช้ `SEB_BROWSER_EXAM_KEYS` แบบรายการรวมอีกต่อไป เพราะรูปแบบนั้นพิสูจน์ไม่ได้ว่า
BEK ตรง config revision/platform/build ที่ประกาศ ให้ตั้งค่าต่อไปนี้เป็นชุดเดียวกัน:

```dotenv
SEB_SESSION_SECRET=<สุ่มอย่างน้อย 32 ตัวอักษร>
SEB_CONFIG_KEY=<CK 64 hex ของไฟล์ final>
SEB_CONFIG_REVISION=<revision จาก release registry>
SEB_BROWSER_EXAM_KEY_REGISTRY=<JSON หนึ่งบรรทัด>
NEXT_PUBLIC_SITE_URL=https://www.korkru.com
NEXT_PUBLIC_SEB_CONFIG_URL=https://www.korkru.com/exam/korkru-production-v1.seb
```

โครง JSON ใน secret manager (แทนค่าตัวอย่างด้วยค่าจริงในหน้าจอ secret manager เท่านั้น):

```json
{
  "schemaVersion": 1,
  "configRevision": "revision-from-registry",
  "entries": [
    {
      "platform": "windows",
      "versionString": "3.10.2",
      "buildNumber": "920",
      "key": "64-hex-BEK"
    }
  ]
}
```

ค่าที่รองรับของ `platform` คือ `windows`, `macos`, `ios` ระบบเลือก BEK หลังอ่าน
`SafeExamBrowser.version` แบบ exact platform + versionString + buildNumber และ session ที่ออกใหม่
จะผูก `configRevision` ด้วย รุ่นหรือ revision อื่นจึงไม่ผ่านแม้ BEK นั้นเคยอยู่ในรายการเก่า

ก่อน deploy ให้ฉีด environment เข้า shell/CI โดยไม่พิมพ์ค่า แล้วรัน:

```bash
npm run check:seb-readiness
npm run check:seb-registry
npm run check:seb-platforms
```

สองคำสั่งหลังจะยังรายงาน `NOT READY` จนกว่าจะยืนยัน policy/build/BEK/UAT ตามจริง

## 3. การแจกไฟล์

- แจกเฉพาะไฟล์ `.seb` ที่เข้ารหัสและ checksum ตรง revision
- ห้ามส่ง CK, BEK, Quit/Admin Password ไปกับไฟล์หรือข้อความนักเรียน
- ก่อนวันสอบให้นักเรียนติดตั้ง SEB และดาวน์โหลดไฟล์ไว้ล่วงหน้า แล้วทำ system check ใหม่ในวันสอบ
- ถ้าใช้ public HTTPS link ให้ทดสอบจากอุปกรณ์จริงว่าได้ไฟล์ revision เดียวกัน ไม่ถูก cache เป็นไฟล์เก่า
- เมื่อออก revision ใหม่ ให้เปลี่ยนชื่อ/URL หรือควบคุม cache ให้ชัด ห้ามเขียนทับไฟล์เดิมแล้วใช้หลักฐานเดิม
- ครูต้องมีไฟล์สำรองที่ checksum ตรง พร้อมเครื่องสำรองและช่องทางติดต่อผู้ดูแล

## 4. Rotation และ maintenance window

CK, BEK registry, config revision, ไฟล์ `.seb` และ session secret เป็นหนึ่ง release unit:

1. หยุดการเปิดข้อสอบ SEB ใหม่และยืนยันว่าไม่มี attempt กำลังทำ
2. freeze ไฟล์ final, คำนวณ checksum, สร้าง revision ใหม่ และเก็บ build matrix ใหม่
3. ลงทะเบียน CK/BEK ใหม่ใน secret manager โดยยังไม่ลบค่ารุ่นเดิม
4. deploy code + artifact + environment ไป Staging และทำ mock exam/physical UAT
5. ล็อก source revision + deployment + config revision เป็น candidate เดียวกัน
6. เมื่อได้รับอนุมัติ Production จึงสลับ artifact/environment พร้อมกันและสุ่ม
   `SEB_SESSION_SECRET` ใหม่ เพื่อยกเลิก session revision เก่า
7. เก็บ revision เก่าเป็น rollback target จน pilot ผ่าน แล้วจึง mark `retired`

ห้าม rotate กลางการสอบ การเปลี่ยน session secret จะบังคับให้ผู้ใช้ตรวจ SEB ใหม่ และการเปลี่ยน
CK/BEK โดยไม่เปลี่ยนไฟล์/registry พร้อมกันจะปฏิเสธนักเรียนทั้งห้อง

## 5. Rollback

ก่อน rollout ต้องจดเฉพาะ deployment id, revision id และชื่อ secret version ของชุดเดิม
(ไม่จดค่า secret) หาก pilot ล้มเหลว:

1. หยุดเปิด attempt ใหม่และแจ้งผู้คุมสอบ
2. restore deployment + `.seb` artifact + CK + BEK registry ของ rollback revision เป็นชุดเดียว
3. ตั้ง `SEB_CONFIG_REVISION` กลับให้ตรง rollback revision
4. สุ่ม session secret ใหม่อีกครั้ง แทนการนำ secret เก่ากลับมาใช้ เพื่อยกเลิก session ที่ปะปน
5. ให้ทุกเครื่องเปิดไฟล์ rollback และทำ system check ใหม่ก่อน resume
6. เก็บ revision ที่ล้มเหลวเป็น `retired`; ห้ามลบหลักฐานหรือแก้ประวัติให้ดูเหมือนผ่าน

revision แรกใน registry ยังไม่มี `rollbackRevision` จึงต้องถือว่า **ยังไม่พร้อม Production**
จนกว่าจะบันทึก production snapshot/target ที่กู้คืนได้หรือผ่าน pilot ที่ได้รับอนุมัติ

## 6. เกณฑ์ออกจาก S2

- checksum ของ artifact ตรง registry
- policy ทั้งหกได้รับการยืนยันจาก native config
- target macOS/iPadOS/iOS/Windows มี exact versionString/buildNumber และ approval
- CK/BEK ถูกกรอกใน secret manager แบบ revision-bound โดยไม่มีค่าใน Git/chat/log
- Quit/Admin policy และช่องทางแจกไฟล์ได้รับการยืนยัน
- มี production snapshot/rollback target ที่ผู้คุมสอบทำตามได้
- `npm run check:seb-registry` ผ่าน; platform evidence ยังต้องผ่าน mock/physical gate ใน S5–S6
