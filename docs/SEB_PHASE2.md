# SEB รายข้อสอบ — เฟส 2: SEB Server lab

อัปเดต: 5 กันยายน 2026

งานต่อเนื่อง: ผู้ใช้อนุญาตเลื่อน manual test เพื่อทำ [เฟส 3ก — password/revision core](SEB_PHASE3.md) ที่ไม่ต่อ runtime ก่อน ไม่ได้ทำให้ผล native/server test ที่ค้างอยู่ถือว่าผ่าน

## สถานะและขอบเขตที่อนุมัติ

ผู้ใช้อนุมัติให้สำรวจ SEB Server **แยกจากเว็บจริง** เพื่อรองรับรหัสออกแยกครู/ข้อสอบโดยไม่ต้องคัดลอก BEK ใหม่ทุก config/build ห้ามเช่าบริการ เปลี่ยน production หรือเปิด native SEB ในงานนี้

**ทำแล้วเฉพาะ lab harness และตัวตรวจ API แบบอ่านอย่างเดียว ยังไม่ใช่ integration ที่ครูใช้งานได้** เครื่องนี้ไม่มี Docker CLI/Compose/engine จึงยังไม่ได้รัน SEB Server หรือทดสอบ native client ไม่มีผลจริงให้อนุมานว่ารหัสรายครู/ASK/server-driven BEK ใช้งานผ่านแล้ว

- `infra/seb-phase2/compose.json`: เตรียม SEB Server + MariaDB เท่านั้น ไม่มี screen proctoring เปิด port เฉพาะ `127.0.0.1:18080`; DB ไม่ publish port, network เป็น internal, named volume/project ใหม่แยกต่อชุด และไม่ restart เอง
- `scripts/seb-phase2/prepare.mjs`: สร้างรหัสสุ่มใหม่ใน `.local/seb-phase2-*` ที่ git ignore; directory `0700`, `.env`/`connection.json` เป็น `0600` ไม่พิมพ์รหัส ไม่อ่าน production env ไม่เริ่ม container/app และไม่เขียนทับชุดเดิม
- `client.mjs`/`probe.mjs`: discovery → admin OAuth scope `read` → optional GET exact exam; จำกัด literal loopback, ไม่ตาม redirect, จำกัดเวลาต่อ request และ JSON 128 KiB ไม่ส่ง token/รหัส/BEK/raw exam ในผลลัพธ์
- `doctor.mjs`: ตรวจ Docker CLI/Compose/engine แบบอ่านอย่างเดียว ไม่เปิด ไม่ติดตั้ง ไม่ pull/run
- Tests 58 ข้อผ่าน รวม HTTP loopback จริงกับ **synthetic stub ไม่ใช่ SEB Server จริง**

ไม่เปลี่ยน `app/`, `lib/`, Supabase/schema/RLS, Vercel/env, CK + BEK gate, session cookie หรือ `.seb` production ไม่มี migration และไม่ได้เพิ่มหน้าครูตั้งรหัสหรือทางออกหลังส่ง

## ข้อค้นพบจากซอร์สทางการ

ตรึง SEB Server **v2.2.3**, commit `3a417abff04b42094bb83f0e622879e1cb751700`; อ่าน setup v2.2.2, commit `f5d17915e701fee8254fb72f930ce1583b4f11a7` ประกอบ ไม่ใช้ public demo/รหัสตัวอย่างของ upstream

1. มี [URL exam โดยไม่ต้องมี LMS adapter](https://github.com/SafeExamBrowser/seb-server/blob/3a417abff04b42094bb83f0e622879e1cb751700/docs/exam_with_url.rst) และ [quit password รายข้อสอบ](https://github.com/SafeExamBrowser/seb-server/blob/3a417abff04b42094bb83f0e622879e1cb751700/docs/exam_quit_password.rst) แต่ไม่ได้เพิ่ม CK/BEK validation ให้ KorKru อัตโนมัติ หรือรับรองการ rotate รหัสในไฟล์/session ที่แจกไปแล้ว
2. [Discovery](https://github.com/SafeExamBrowser/seb-server/blob/3a417abff04b42094bb83f0e622879e1cb751700/src/main/java/ch/ethz/seb/sebserver/webservice/weblayer/api/ExamAPIDiscoveryController.java) `/exam-api/discovery` บอก Exam API `v1` ไม่ใช่หลักฐานเวอร์ชันเซิร์ฟเวอร์หรือ integrity นักเรียน ตัว probe ไม่ส่ง credentials ตาม URL ที่ discovery เสนอ
3. Admin OAuth ใช้ `/oauth/token`, Basic `guiClient:<client secret>` และ **password grant ของบัญชี admin/user** ไม่ใช่ `client_credentials` ของ native client connector ขอ/ยอมรับเฉพาะ scope `read` และไม่เก็บ/refresh token ดู [AuthorizationServerConfig](https://github.com/SafeExamBrowser/seb-server/blob/3a417abff04b42094bb83f0e622879e1cb751700/src/main/java/ch/ethz/seb/sebserver/webservice/weblayer/oauth/AuthorizationServerConfig.java)
4. `GET /admin-api/v1/exam/{id}` ต้องส่ง `Content-Type: application/x-www-form-urlencoded` ตาม [EntityController](https://github.com/SafeExamBrowser/seb-server/blob/3a417abff04b42094bb83f0e622879e1cb751700/src/main/java/ch/ethz/seb/sebserver/webservice/weblayer/api/EntityController.java); Start URL อยู่ใน `additionalAttributes.quiz_start_url` **ไม่ใช่ `externalId`** ตาม [Exam model](https://github.com/SafeExamBrowser/seb-server/blob/3a417abff04b42094bb83f0e622879e1cb751700/src/main/java/ch/ethz/seb/sebserver/gbl/model/exam/Exam.java) ตรวจ id/institutionId/Start URL ให้ตรง และรับเฉพาะ URL exam ที่ไม่มี LMS setup
5. [ASK](https://github.com/SafeExamBrowser/seb-server/blob/3a417abff04b42094bb83f0e622879e1cb751700/docs/exam_ask.rst) ตรวจเป็น batch หลังเชื่อมต่อ ไม่ใช่ admission gate ของ KorKru; `Active` หรือเปิด ASK อย่างเดียวไม่พิสูจน์ explicit trusted-build grant
6. Threshold `0` **ไม่ใช่การปิด heuristic**: [SecurityKeyServiceImpl](https://github.com/SafeExamBrowser/seb-server/blob/3a417abff04b42094bb83f0e622879e1cb751700/src/main/java/ch/ethz/seb/sebserver/webservice/servicelayer/institution/impl/SecurityKeyServiceImpl.java) เทียบ `matches > threshold` และไม่ระบุค่า fallback เป็น `1` ห้ามใช้จำนวนเครื่องแทน trusted build policy probe ไม่ grant ASK และคืน `explicitClientGrantVerified: false`, `policyNeedsReview: true` เสมอ
7. `/lms-api/v1/*` เป็น full LMS integration ที่อาศัย adapter/configuration ของ LMS ที่รองรับ ไม่ใช่ส่ง KorKru assignment UUID แล้วใช้ได้ทันที งานนี้ไม่เรียก endpoint เหล่านั้นหรือจำลอง native handshake เป็นหลักฐาน

## ข้อจำกัดความปลอดภัย

- ใช้ข้อมูลสมมติเท่านั้น ไม่เชื่อม LMS จริง ไม่มีชื่อ/บัญชี/คำตอบนักเรียน
- HTTP loopback เหมาะกับเครื่องที่เชื่อถือได้ ไม่ป้องกัน process อื่นที่ยึด port เดียวกัน ห้ามใช้รหัสจริง เปิด router port/tunnel หรือเปลี่ยน host เป็น `0.0.0.0`
- CLI รับเฉพาะ `connection.json` ใน directory lab ที่ private ปฏิเสธ path อื่น/symlink/สิทธิ์เปิดกว้าง ไม่รับ password/token เป็น command-line argument
- `.env`, Docker environment และ volume มี credentials ทดลอง ผู้มีสิทธิ์ Docker/บัญชีเครื่องเดียวกันอ่านได้ `docker compose config` ที่ไม่ใส่ `--quiet` และ `docker inspect` อาจพิมพ์ secrets ห้ามแชร์ output
- ปิด INFO logger `ch.ethz.seb.SEB_SERVER_INIT` เพราะ upstream initializer พิมพ์รหัสเริ่มต้นระดับ INFO ยังต้องตรวจ log redaction กับ server จริงก่อนใช้ข้อมูลอื่นนอกจาก lab
- DB user `seb_lab` แยกจาก root; profile `bundled` ไม่มี demo seed; ไม่ mount host directory/docker socket/volume production
- Exam API อาจคืน quit password/BEK connector จึงเลือกเฉพาะ boolean/enum/numeric policy ที่อนุญาต ไม่ log raw response/exception ไม่ dump token
- บัญชี lab-admin เป็นผู้ดูแล **lab เท่านั้น** read scope + ตรวจ institution ใน response ไม่ใช่ KorKru teacher/org authorization ห้าม import helper เข้า app หรือออก session นักเรียนด้วยผล probe

## อิมเมจ — ยังไม่ผ่าน runtime test

- `anhefti/seb-server:v2.2.3`: index digest `sha256:bc95eef01fbcbe1f8fe672d56944cbed96196845e5924b50fce9d87800f3a0a8` จาก [Docker Hub metadata](https://hub.docker.com/v2/repositories/anhefti/seb-server/tags/v2.2.3) เป็น image family ที่ official setup ใช้ มี Linux amd64; Compose ระบุ `linux/amd64` ต้องใช้ emulation บน Apple Silicon
- `mariadb:11.4.10`: index digest `sha256:3b4dfcc32247eb07adbebec0793afae2a8eafa6860ec523ee56af4d3dec42f7f` จาก [official MariaDB image metadata](https://hub.docker.com/v2/repositories/library/mariadb/tags/11.4.10) เป็น multiarch index ไม่ใช้ demo MariaDB 10.5 เดิม
- ตรวจ metadata วันที่ 5 กันยายน 2026 **ยังไม่ได้ pull, ตรวจ vulnerability หรือพิสูจน์ startup/compatibility** ระหว่างสอง image นี้
- Java heap 256–1024 MiB, container limits รวมประมาณ 2 GiB เป็นค่าเริ่มต้นทดลอง ไม่ใช่ production sizing

## วิธีทดลองรอบถัดไป

รันที่ repository `korkru/` ชั้นใน ตรวจ branch/upstream ตาม AGENTS.md ก่อน นัดผู้ใช้ก่อนเริ่มบริการ

### 1. เตรียมโดยไม่เปิดบริการ

```sh
npm run seb:phase2:doctor
npm run seb:phase2:prepare
npm run seb:phase2:test
```

`doctor` exit 1 ถ้า CLI/Compose/engine ไม่พร้อม ไม่เปิด Docker เอง การติดตั้ง Docker ต้องได้รับอนุมัติแยก prepare แสดง path เท่านั้น ไม่พิมพ์รหัส ชุดใหม่ไม่ rotate รหัสใน DB volume ชุดเดิม

### 2. เริ่ม lab หลัง Docker พร้อมและผู้ใช้อนุญาต

แทน `REPLACE` ด้วย suffix จาก prepare ใช้ชุดเดียวตลอด ก่อนเริ่มตรวจว่า port 18080 ไม่มีบริการอื่นและไม่มี lab อีกชุดรันพร้อมกัน

```sh
docker compose --env-file .local/seb-phase2-REPLACE/.env -f infra/seb-phase2/compose.json config --quiet
docker compose --env-file .local/seb-phase2-REPLACE/.env -f infra/seb-phase2/compose.json up -d
docker compose --env-file .local/seb-phase2-REPLACE/.env -f infra/seb-phase2/compose.json ps
npm run seb:phase2:probe -- .local/seb-phase2-REPLACE/connection.json
```

`up` อาจดาวน์โหลด image และสร้าง schema ของ **MariaDB lab ใหม่เท่านั้น** คำสั่ง Docker ข้างบนยังไม่ได้รัน หาก startup ล้มเหลวให้ตรวจ config/log แบบปกปิด secrets ไม่เอารหัส production มาแทน

เมื่อ server พร้อม เปิด browser ธรรมดาที่ `http://127.0.0.1:18080/gui` เอง ไม่เปิด native SEB บัญชี `lab-admin` ใช้ `password` จากไฟล์ private `connection.json` ห้ามคัดลอกไฟล์/รหัสเข้าแชตหรือ git หากเปลี่ยน admin password ใน GUI ให้แก้ password ในไฟล์ private นี้ให้ตรง; `.env` เป็น bootstrap password ไม่ใช่ตัว rotate บัญชีที่มีใน DB แล้ว

ผลคาดหวังคือ `adminReadAuthenticated: true` และ **`studentIntegrityVerified: false`**; exit 0 คือ read probe ผ่าน ไม่ใช่ไฟเขียวเปิดสอบ

### 3. อ่านข้อสอบสมมติแบบ exact

สร้าง URL exam A/B ใน GUI ตามคู่มือ upstream โดยใช้ Start URL `https://example.invalid/lab-a` และ `https://example.invalid/lab-b` เท่านั้น ไม่เลือก LMS/KorKru จริง ไม่เริ่ม native session จด exam id และ institution id ของ lab แล้วเพิ่ม object `exam` ใน `connection.json` ด้วย text editor คง credentials เดิมและ permissions `0600` ตัวอย่างเลขสมมติ:

```json
"exam": {
  "id": 12,
  "institutionId": 3,
  "startUrl": "https://example.invalid/lab-a"
}
```

รัน probe ซ้ำ จากนั้นทดสอบ ID ของ B คู่กับ URL ของ A และ institution ผิดว่าตอบ `EXAM_BINDING_MISMATCH` โดยไม่แสดง password/BEK การอ่านผ่าน lab-admin ยังไม่ใช่การทดสอบ tenant ACL ของ KorKru

### 4. หยุดโดยเก็บข้อมูลทดลอง

```sh
docker compose --env-file .local/seb-phase2-REPLACE/.env -f infra/seb-phase2/compose.json stop
```

เก็บ private credentials กับ named volume ของชุดเดียวกัน ไม่ใช้ `down -v`, ลบโฟลเดอร์กว้าง หรือ reset DB เพื่อแก้ error การล้าง lab ต้องยืนยัน project/volume ที่แน่นอนและขออนุมัติก่อน ไม่มี cleanup ทำลายข้อมูลอัตโนมัติ

## สิ่งที่ยังต้องพิสูจน์ก่อนต่อเว็บจริง

1. รัน Compose จริง ตรวจ GUI/discovery/read-scope token/exact exam/error cases และ DB/port/log isolation บันทึก image/architecture/version/pass/fail โดยไม่มี secrets
2. Native import/CK/password A/B ของ [เฟส 1](SEB_PHASE1.md) ที่ยังค้าง และ server-connected sessions บน Mac/iPad/Windows ที่ประกาศรองรับ นัดและเตรียมทางออกก่อนทุกครั้ง loopback lab นี้เข้าไม่ได้จาก iPad/เครื่องอื่น ต้องออกแบบ TLS/network ทดลองแยกและขออนุมัติก่อน
3. Authoritative mapping `KorKru org + teacher + assignment + config revision + student/attempt` ↔ `SEB institution + exam + client connection` พร้อม ownership checks และ cross-tenant/replay tests ไม่รับ mapping/status จาก browser
4. Explicit trusted-build ASK grant และ server-driven BEK ของ exact connection ไม่ใช้ heuristic/Active/no-ASK/unknown-key/stale connection เป็นหลักฐาน ปฏิเสธเมื่อ server unavailable หรือจับคู่ session ไม่ได้
5. Config/password revision + encrypted secret storage/retention/audit ก่อนเพิ่มช่องครูตั้งรหัส รวมผลต่อไฟล์ที่แจกแล้ว/session ที่เปิดอยู่ ไม่อ้างว่า rotation ยกเลิกรหัสเก่าทันที
6. แยก “ส่งแล้วออก/ครูอนุญาตออก” พร้อม native Quit URL tests: ซ่อนปุ่มหรือเช็ก HTTP handler ของ static Quit URL ไม่พอเพราะ native SEB อาจ intercept ก่อนเว็บ ต้องทดสอบส่งไม่สำเร็จ/กดก่อนเวลา/ข้ามครู/reconnect

**ห้ามลด gate เป็น CK-only** หรือเพิ่ม flag เปิด production โดยไม่มี proof ไม่สร้าง ASK/BEK ปลอม การเช่าบริการ/เปิด network/แก้ production/เพิ่ม DB และ UI ครูยังต้องกำหนดขอบเขตงานถัดไป

## ผลทดสอบรอบนี้

- Unit/filesystem/Compose-contract + HTTP stub: 58 ผ่าน ครอบคลุม wrong origin/redirect, scope, malformed/oversized/timeout response, wrong exam/institution/URL, redaction และ private permissions
- Sandbox ปฏิเสธ bind port ด้วย `EPERM`; รัน HTTP tests อีกครั้งด้วยสิทธิ์ loopback แล้วผ่าน ไม่ skip แล้วอ้างว่าเป็น network test
- `doctor`: Docker CLI/Compose/engine `UNAVAILABLE`; ไม่ได้เปิดแอปหรือ container
- Full repository tests: 811 ข้อ / 70 files ผ่าน; `node --check` ของ CLI/connector และ `git diff --check` ผ่าน ไม่มี TypeScript/app/UI change จึงไม่รัน tsc/build/lint:tokens สำหรับ patch lab-only
- สร้าง private lab bundle แล้วโดยไม่แสดง secrets; probe ขณะไม่มี server ตอบ `CONNECTION_FAILED` และ exit 1 ตามคาด ไม่ใช่ผลทดสอบ server จริง
- Compose parse/startup กับ engine, SEB Server จริง, native Mac/iPad/Windows, deployment และ teacher/student flow: **ยังไม่ได้ทดสอบ**
