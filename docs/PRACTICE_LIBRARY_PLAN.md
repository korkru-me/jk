# แผนพัฒนา “คลังฝึก” แบบไม่มีคะแนน

อัปเดตล่าสุด: 13 ตุลาคม 2026
สถานะ: Phase 1–7 implementation candidate หลัง feature flag; เปิด Production ได้เมื่อ migration/RLS/Staging UAT และ owner sign-off ใน `SELF_PRACTICE_UAT.md` ผ่านเท่านั้น

## ข้อสรุปการออกแบบ

ฟีเจอร์นี้ใช้ทางเข้าและชิ้นส่วนบางส่วนร่วมกับระบบสร้างแบบฝึกหัดเดิมได้ แต่ต้องเป็นโดเมนแยกชื่อ **“คลังฝึก”** ไม่ใช่แบบฝึกหัดเดิมที่ตั้งคะแนนเป็นศูนย์

- ครูเริ่มสร้างจากจุดเดียวกับแบบฝึกหัด/ข้อสอบ เพื่อไม่เพิ่มภาระการเรียนรู้
- ใช้คลังโจทย์ แท็ก ตัวแสดงโจทย์ และ evaluator ที่ปลอดภัยของระบบเดิมร่วมกัน
- ไม่สร้าง `assignment`, `submission` หรือ `submission_answer` สำหรับการฝึกชนิดนี้
- แยกการตั้งค่า การมอบให้ห้อง และตัวนับความคืบหน้าออกจากระบบคะแนน
- ครูเห็นเพียงว่านักเรียนคนใดเคยกดตอบโจทย์ข้อใดและกี่ครั้ง
- นักเรียนเห็นผลตรวจของคำตอบตัวเองได้ทันที แต่ผลนั้นไม่กลายเป็นคะแนนและไม่ถูกส่งให้ครู
- คลังฝึกที่เผยแพร่แล้วเปลี่ยนชนิดเป็นแบบฝึกหัดหรือข้อสอบไม่ได้ หากอนาคตต้องการนำโจทย์ไปให้คะแนน ให้สร้างงานใหม่จากรายการโจทย์โดยไม่ย้ายประวัติการฝึกตามไป

เหตุผลที่ต้องแยกโดเมนคือระบบงานเดิมผูกกับ attempt, answer snapshot, คะแนนเต็ม, การส่ง, กำหนดเวลา และผลการเรียนหลายจุด การใช้แถวงานเดิมแล้วซ่อนคะแนนเฉพาะหน้า UI ยังเสี่ยงให้ข้อมูลไปปรากฏในสมุดคะแนน รายงาน export analytics หรือ query อื่นในอนาคต

## คำศัพท์ที่ใช้ในแผน

- **คลังฝึก** — ชุดโจทย์ไม่มีคะแนนที่ครูเปิดให้นักเรียนในห้องใช้ฝึกเอง
- **การลองตอบ** — การที่นักเรียนส่งคำตอบที่ไม่ว่างผ่านปุ่ม “ตรวจคำตอบ” หนึ่งครั้ง
- **จำนวนข้อที่เคยตอบ** — จำนวนโจทย์ไม่ซ้ำที่นักเรียนเคยลองตอบอย่างน้อยหนึ่งครั้ง
- **จำนวนครั้งที่ตอบ** — จำนวนการลองตอบของนักเรียนต่อโจทย์หนึ่งข้อ ไม่ใช่จำนวนครั้งที่ตอบถูก
- **ผลตรวจส่วนตัว** — feedback ชั่วคราวที่ตอบกลับให้นักเรียนใน request นั้นและไม่อยู่ในรายงานของครู

## Invariants ที่ห้ามเปลี่ยนระหว่างพัฒนา

### ไม่มีคะแนนโดยโครงสร้าง ไม่ใช่แค่ซ่อนด้วย UI

- ไม่มีคะแนน คะแนนเต็ม เปอร์เซ็นต์ผ่าน เกรด ลำดับ หรือสถานะผ่าน/ไม่ผ่าน
- ไม่มี due date, late band, time limit, access code, score strategy หรือจำนวน attempt สูงสุด
- ไม่เขียนข้อมูลเข้า gradebook, assignment analytics, question statistics หรือ homeroom score summary
- ไม่ส่ง event ที่ทำให้ระบบภายนอกตีความการลองตอบเป็นการส่งงานหรือผลการเรียน
- ห้ามมีปุ่ม export เป็นคะแนนหรือแปลง progress เป็นคะแนน
- คำว่า “ตอบแล้ว” หมายถึงเคยกดตรวจคำตอบเท่านั้น ไม่ได้แปลว่าตอบถูกหรือทำสำเร็จ

### ครูต้องไม่เห็นข้อมูลคุณภาพคำตอบ

- ครูเห็นเฉพาะนักเรียน, โจทย์ที่เคยตอบ และจำนวนครั้งที่ตอบ
- ครูไม่เห็นข้อความ/ไฟล์คำตอบ คำตอบที่เลือก ความถูกต้อง คะแนน ผลตรวจ เหตุผลที่ผิด หรือจำนวนครั้งที่ตอบถูก
- หน้า overview อาจสรุปจำนวนข้อไม่ซ้ำที่เคยตอบเทียบกับจำนวนข้อในคลังเพื่อบอกความคืบหน้า แต่ต้องไม่ใช้สีหรือถ้อยคำที่สื่อเป็นเกรด
- ไม่มี leaderboard, การจัดอันดับ, “นักเรียนอ่อน/เก่ง”, accuracy rate หรือการเปรียบเทียบกับเพื่อน
- เวลาเชิงเทคนิคที่ระบบจำเป็นต้องมีเพื่อดูแลข้อมูลต้องไม่แสดงในหน้าครูรุ่นแรก และต้องไม่ถูกใช้สร้าง timeline การเรียนโดยปริยาย

### เก็บข้อมูลให้น้อยที่สุด

- ข้อมูลถาวรของการฝึกเก็บเท่าที่จำเป็นต่อความสัมพันธ์ `student + practice library + question + answer count`
- ไม่เก็บ payload คำตอบ ผลถูก/ผิด คะแนนย่อย หรือ answer key ในตารางความคืบหน้า
- การตรวจคำตอบต้องเกิดฝั่ง server ผ่าน evaluator ที่มีอยู่ โดยตอบผลกลับเฉพาะนักเรียนคนนั้น
- log, error monitoring และ analytics ห้ามบันทึกคำตอบหรือผลถูก/ผิด
- request ซ้ำจาก double click, retry หรือ reconnect ต้องไม่เพิ่มจำนวนครั้งซ้ำ ใช้ idempotency key ต่อการกดหนึ่งครั้ง
- การเปิดโจทย์ เลื่อนอ่าน พิมพ์ร่าง หรือ reload หน้าไม่นับเป็นการตอบ
- นับเมื่อ server รับ payload ของคำตอบที่ไม่ว่างและผ่านการตรวจรูปทรงข้อมูลแล้วเท่านั้น

### สิทธิ์และขอบเขตข้อมูล

- นักเรียนเห็นคลังฝึกได้เฉพาะเมื่อเป็นสมาชิกห้องที่คลังนั้นเผยแพร่ให้ และเห็น progress ของตนเองเท่านั้น
- ครูเห็น progress เฉพาะห้องที่ตนมีสิทธิ์ดูรายชื่อนักเรียนตาม permission matrix ของห้องเรียนเดิม
- สิทธิ์สร้าง แก้ เผยแพร่ หรือปิดคลังฝึกต้องเข้มกว่าสิทธิ์อ่าน progress และตรวจฝั่ง server ทุกครั้ง
- `org_id` และ classroom membership เป็น security boundary ไม่ใช่เพียงตัวกรอง UI
- RLS และ Server Action ต้องมีทั้งกรณีอนุญาตและปฏิเสธข้าม organization, ข้ามห้อง และข้ามนักเรียน
- browser ต้องไม่ได้รับ answer key, solution หรือข้อมูลของนักเรียนคนอื่นเพียงเพราะ component ซ่อนไว้

## ขอบเขต MVP

- ครูสร้าง แก้ไข ทำสำเนา เผยแพร่ ปิด และลบคลังฝึกตาม lifecycle ที่กำหนด
- ตั้งชื่อ คำชี้แจง ห้องเรียนเป้าหมาย และเลือกโจทย์จากคลังโจทย์เดิม
- ใช้แท็กของโจทย์เดิมและแก้แท็กหลายข้อพร้อมกันจาก flow จัดการโจทย์
- นักเรียนค้นหาจากชื่อ/ข้อความโจทย์ และเลือกแท็กได้หลายค่า สูงสุด 20 แท็กต่อการค้นหา; UI ต้องแจ้งเพดานและจำนวนแท็กที่ไม่ถูกใช้ ห้ามตัดทิ้งเงียบ ๆ
- หลายแท็กใช้ความหมาย **ตรงทุกแท็ก (AND)** เป็นค่าเริ่มต้น เช่น `สอวน. ค่าย 1` + `ไฟฟ้า`
- แสดงแท็กที่เลือกเป็น chip ที่ลบทีละรายการและล้างทั้งหมดได้ พร้อมเก็บ filter ใน URL เพื่อย้อนกลับมาได้
- ผลลัพธ์แบ่งหน้า หรือใช้การโหลดเพิ่มแบบมีเพดาน ไม่ส่งโจทย์ร้อยกว่าข้อทั้งหมดพร้อม answer-bearing data ตั้งแต่เปิดหน้า
- รองรับเฉพาะชนิดโจทย์ที่ evaluator ปัจจุบันตรวจอัตโนมัติได้อย่างปลอดภัย
- นักเรียนกดตรวจคำตอบรายข้อ เห็น feedback ส่วนตัว และลองตอบใหม่ได้
- บันทึก event หนึ่งรายการเมื่อกดตรวจคำตอบที่ไม่ว่าง แล้วคำนวณจำนวนครั้งจาก event; หนึ่ง logical request สร้าง event ได้ไม่เกินหนึ่งรายการ
- นักเรียนเห็นเครื่องหมายว่าเคยตอบแล้วและจำนวนครั้งของตนเอง
- ครูมีหน้าภาพรวมนักเรียนและหน้ารายละเอียดรายคน โดยไม่มีข้อมูลคะแนน
- มี loading, empty, error และ permission-denied state ที่แยกจากกัน

## สิ่งที่อยู่นอก MVP

- โจทย์ `essay`, `file_upload` หรือชนิดใดที่ต้องให้ครูตรวจ
- การส่งคำตอบให้ครูอ่านหรือให้ feedback รายคน
- การนำ progress ไปคิดคะแนน เกรด เกณฑ์ผ่าน หรือใบประกาศ
- leaderboard, streak เชิงแข่งขัน, badge, gamification และการเปรียบเทียบระหว่างนักเรียน
- การ export รายละเอียดการฝึกเป็นคะแนนหรือส่งเข้า spreadsheet/ระบบภายนอก
- AI แนะนำโจทย์ วิเคราะห์จุดอ่อน หรือสร้าง learning path อัตโนมัติ
- bookmark, รายงานโจทย์ผิด, playlist ส่วนตัว และ “สุ่ม N ข้อจากผลค้นหา” — เป็นตัวเลือกหลัง MVP
- การค้นหาแบบ OR, boolean query ซับซ้อน, semantic search หรือ synonym search
- การทำงาน offline ข้ามอุปกรณ์; ร่างคำตอบอาจอยู่ใน browser ของเครื่องปัจจุบันเท่านั้น
- การเปลี่ยนคลังฝึกเป็นแบบฝึกหัด/ข้อสอบโดยตรง
- การรวมความคืบหน้าคลังฝึกเข้า homeroom, dashboard คะแนน หรือ question statistics
- การรับประกัน performance ระดับหลายหมื่นข้อก่อนมีข้อมูลใช้งานจริงและ index ที่วัดได้

## กติกาด้านการออกแบบที่ต้องประหยัดพื้นที่แกน Y

ภาพต้นแบบเป็น reference ของ flow, เนื้อหา และลำดับความสำคัญ ไม่ใช่ pixel specification เมื่อพัฒนาจริงให้ยึดกติกาต่อไปนี้เหนือสัดส่วน Card ในภาพ

- ไม่ใช้ Card ใหญ่ครอบทั้งหน้าเมื่อ section และ divider ธรรมดาสื่อโครงสร้างได้
- Card แต่ละใบควรมีงานหลักหนึ่งอย่าง หลีกเลี่ยง Card ซ้อน Card และหัว Card ที่กินสองถึงสามบรรทัด
- บน desktop ให้หัวหน้าสูงโดยประมาณไม่เกิน 72–88 px, toolbar ค้นหา/กรองไม่เกินประมาณ 96 px, แถวโจทย์ 64–72 px และแถวตารางความคืบหน้า 44–48 px ก่อนเปิดรายละเอียด
- ใช้ความหนาแน่นระดับหน้าตั้งค่าเดิม: padding ระดับ `md`, gap สั้น, heading/label ขนาด `text-sm` เมื่อเหมาะสม
- ข้อมูลสั้นที่เกี่ยวข้องกันต้องเรียงหลายคอลัมน์บน desktop และซ้อนเป็นคอลัมน์เดียวบนจอเล็ก
- ตัวกรองชื่อและแท็กอยู่ใน toolbar เดียวกัน ไม่แยกเป็นกรอบสูงหลายใบ
- chip ของแท็กแสดงไม่เกินสองบรรทัดใน viewport ปกติ ส่วนที่เกินใช้ “+N” หรือพื้นที่เลื่อนแนวนอนที่เข้าถึงด้วยคีย์บอร์ดได้
- รายการคลังโจทย์ใช้ compact list/row เป็นค่าเริ่มต้น ไม่ใช้การ์ดสูงหนึ่งใบต่อข้อ; เนื้อโจทย์ยาวเปิดดูใน Dialog, Drawer หรือหน้ารายละเอียด
- metadata เช่นแท็ก สถานะเคยตอบ และจำนวนครั้งอยู่บรรทัดเดียวเท่าที่พื้นที่พอ และตัดข้อความด้วยวิธีที่ยังเปิดอ่านเต็มได้
- หน้าครูใช้ตารางหรือ list row กะทัดรัด ไม่ใช้สถิติกล่องใหญ่หลายใบเรียงลงมา
- ส่วนควบคุมหลักและตัวกรองอาจ sticky ภายใน scroll container เพื่อไม่ต้องสร้างหัวซ้ำระหว่างเลื่อน
- helper text ที่ไม่จำเป็นต่อการตัดสินใจทันทีใช้ tooltip หรือ disclosure; validation และ warning ที่มีผลต้องมองเห็นเสมอ
- รักษา touch target อย่างน้อย 44×44 px แม้ตัวพื้นผิวภาพจะกะทัดรัด และต้องใช้งานได้ด้วยคีย์บอร์ด
- ที่ 320px ต้องไม่มี horizontal overflow และ action สำคัญต้องไม่ถูกตัดออกนอก viewport
- การขยายรายละเอียดหนึ่งแถวต้องไม่ทำให้ทุกแถวสูงขึ้นตาม และเมื่อย้อนกลับต้องคืน search/filter/page เดิม
- ที่ 1440×900 หน้านักเรียนต้องเห็นรายการโจทย์อย่างน้อย 5 แถว และหน้าครูต้องเห็น roster อย่างน้อย 7 แถวเหนือ fold; หน้าตั้งค่าต้องเห็นข้อมูลพื้นฐานกับจุดเริ่มเลือกโจทย์โดยไม่เลื่อนผ่าน Card สรุปหลายชั้น

## ภาพต้นแบบอ้างอิง

1. [ครูสร้างและตั้งค่าคลังฝึก](practice/mockups/01-teacher-create-practice-library.png) — อ้างอิง flow การตั้งชื่อ เลือกห้อง และเลือกโจทย์; implementation ต้องย่อ section และไม่วางทุกตัวเลือกใน Card สูง
2. [นักเรียนค้นหาโจทย์ด้วยหลายแท็ก](practice/mockups/02-student-practice-library.png) — อ้างอิง search + multi-tag AND + สถานะการฝึก; implementation ใช้ toolbar และ compact rows
3. [นักเรียนทำโจทย์และเห็นผลตรวจส่วนตัว](practice/mockups/03-student-practice-question-feedback.png) — อ้างอิงจังหวะตอบ/ตรวจ/ลองใหม่; ผลตรวจไม่ถูกส่งไปหน้าครู
4. [ครูดูภาพรวมความคืบหน้า](practice/mockups/04-teacher-practice-progress.png) — อ้างอิง overview โดยไม่มีคะแนน; implementation ใช้ตารางกะทัดรัด
5. [ครูดูรายละเอียดนักเรียนรายคน](practice/mockups/05-teacher-student-practice-detail.png) — อ้างอิงรายชื่อโจทย์และจำนวนครั้ง; ห้ามเพิ่ม accuracy หรือคำตอบ
6. [ครูจัดการโจทย์และแท็กหลายข้อ](practice/mockups/06-teacher-bulk-tag-management.png) — อ้างอิง bulk tagging; ใช้แท็กชุดเดียวกับคลังโจทย์เดิม

## แผนพัฒนา 7 เฟส

แต่ละเฟสต้องผ่าน acceptance gate ก่อนเริ่มเฟสถัดไป หาก gate ไม่ผ่านให้แก้ในเฟสนั้น ไม่พ่วงหนี้ไปซ่อนใน UI ของเฟสหลัง

### เฟส 1 — ล็อกสัญญาผลิตภัณฑ์และสำรวจจุดเชื่อมต่อเดิม

เป้าหมายคือทำให้ทีมใช้คำนิยามเดียวกันก่อนแตะ schema หรือ scoring flow

สถานะปัจจุบัน: เริ่มแล้ว โดย `lib/practice-library.ts` ล็อกกติกา tag AND, ขอบเขตการนับหนึ่งการลองตอบ และ metadata allowlist ที่ไม่มีคำตอบ/ความถูกต้อง/คะแนน ส่วน permission matrix, question-type allowlist, route/DTO map และการยืนยัน flow ยังต้องจบก่อนปิดเฟสนี้

งานหลัก:

- ยืนยันชื่อ “คลังฝึก”, ข้อความ “ไม่มีคะแนน” และความหมายของหนึ่งการลองตอบ
- ทำ data-flow map ตั้งแต่ครูเลือกโจทย์ → นักเรียนค้นหา → ตรวจคำตอบ → append event แบบ idempotent → ครูอ่านผลรวม progress
- ทำรายการ component/evaluator/query ที่นำกลับมาใช้ได้ และจุดที่ต้องแยกจาก assignment/submission
- กำหนด route, lifecycle และ permission matrix ของเจ้าของห้อง/ครูร่วม `admin`, `manage`, `view`/นักเรียน
- กำหนด allowlist ของ question type สำหรับ MVP จากความสามารถ evaluator จริง: เริ่มจาก `written` แบบตรวจอัตโนมัติ, `mcq`, `true_false`, `ordering`, `matching`, `classify`, `image_label`; `fill_blank` และ `composite` ใช้ได้เมื่อทุกส่วนตรวจอัตโนมัติ ส่วน `essay`, `file_upload` และช่องข้อความที่ต้องครูตรวจไม่รองรับ
- เขียน DTO contract แยก student view และ teacher progress view โดยไม่มี field คะแนนหรือคำตอบ
- ตัดสินพฤติกรรมเมื่อโจทย์ถูกแก้ ลบ หรือนำออกจากคลัง โดยไม่ทำให้ progress ถูกตีความผิด
- วาง feature flag เพื่อไม่ให้ UI ที่ยังไม่ครบปรากฏใน production navigation

Acceptance gate:

- ทุกเส้นทางข้อมูลระบุ source of truth และผู้มีสิทธิ์อ่าน/เขียนครบ
- ไม่พบกรณีที่ต้องใช้ `assignments`, `submissions` หรือ `submission_answers` เพื่อให้ MVP ทำงาน
- DTO ของครูไม่มี answer, correctness, score, answer key หรือ solution
- รายการ question type ที่รองรับ/ไม่รองรับได้รับการยืนยันและ UI มีข้อความสำหรับชนิดที่เลือกไม่ได้
- เจ้าของผลิตภัณฑ์ยืนยัน flow จากภาพทั้งหกและกติกา compact-Y

การตรวจที่คาดหวัง:

- อ่าน route, Server Action, evaluator, type, migration และ RLS ที่เกี่ยวข้องแบบ read-only
- บันทึก dependency map และ threat/permission checklist ในเอกสารก่อนแก้โค้ด
- รัน baseline `npm test`, `npx tsc --noEmit`, `npm run lint:tokens` และ `npm run build` เพื่อรู้สถานะเดิม โดยไม่อ้างว่าปัญหาเดิมเกิดจากฟีเจอร์ใหม่

### เฟส 2 — สร้างฐานข้อมูลความคืบหน้าและขอบเขตสิทธิ์

เป้าหมายคือให้ระบบเก็บได้เฉพาะข้อมูลที่สัญญาไว้ และปฏิเสธการอ่านข้ามขอบเขตตั้งแต่ชั้นฐานข้อมูล

งานหลัก:

- เพิ่ม `practice_libraries` โดยหนึ่งแถวคงผูกหนึ่งห้อง, `practice_library_questions` สำหรับสมาชิกโจทย์ตามลำดับ และ `practice_answer_attempts` สำหรับ accepted-check event โดยไม่ผูกกับตารางคะแนน; หน้าสร้างเลือกหลายห้องได้เหมือน assignment แต่ atomic RPC จะสร้างคลังที่ตั้งค่าเหมือนกันแยกหนึ่งชุดต่อห้อง เพื่อไม่รวม roster/progress ข้ามห้อง
- `practice_answer_attempts` เก็บเฉพาะ `library_id`, `student_id`, `question_id`, `checked_at`, `idempotency_key`; บังคับ unique อย่างน้อยที่ `(library_id, student_id, idempotency_key)` แล้ว derive จำนวนครั้งด้วย `count(*)` แทนการมี aggregate counter เป็น source of truth ชุดที่สอง
- `checked_at` มาจากฐานข้อมูล ไม่รับเวลาจาก browser และ RPC สำหรับ append event เรียกได้จาก server boundary เท่านั้น; browser ห้าม insert/update/delete event โดยตรง
- Server Action ต้องตรวจ auth, รูปทรงและความไม่ว่างของคำตอบก่อนเรียก RPC; RPC ตรวจ published status, roster, library membership และ actor ซ้ำอีกชั้น โดยไม่รับหรือเก็บ payload คำตอบ
- เพิ่ม index ตาม query จริง ได้แก่คลังต่อห้อง, โจทย์ต่อคลัง, progress ต่อนักเรียน และ progress ต่อโจทย์
- เขียน RLS/RPC/Server Action แบบ least privilege พร้อม fixed `search_path` และ execute grants ที่เจาะจงหากใช้ `SECURITY DEFINER`
- รองรับช่วง deploy ที่ code และ schema อาจอยู่คนละเวอร์ชันโดย feature flag ยังปิด

Acceptance gate:

- นักเรียนสร้าง accepted-check event ได้เฉพาะผ่าน server boundary ของตนเองและเฉพาะโจทย์ที่อยู่ในคลังของห้องที่ตนเป็นสมาชิก
- นักเรียนอ่าน progress ของคนอื่นไม่ได้ ครูนอกห้องและคนต่าง organization อ่านไม่ได้
- ครูที่มีสิทธิ์อ่านได้เฉพาะ aggregate ที่กำหนด และไม่มี query path ไปถึงคำตอบ/ผลถูกผิดเพราะตารางนี้ไม่มีข้อมูลดังกล่าว
- request id เดิมยิงซ้ำหลายครั้งเกิด event เพียงรายการเดียว; request id ใหม่เกิด event ใหม่และทำให้ผลรวมเพิ่มตามจำนวนครั้งจริง
- migration ใช้ชื่อจาก Supabase CLI, local/remote ledger ตรงก่อนเริ่ม และมีทางถอยกลับที่ไม่ทำลาย assignment เดิม
- ก่อนเขียน migration ต้องยืนยันนโยบายประวัติโจทย์ รุ่นแนะนำสำหรับ MVP คือ freeze สมาชิกรายการหลังเผยแพร่และใช้ `ON DELETE RESTRICT`; หากต้องยอมให้ลบโจทย์ต้นทาง ต้องออกแบบ stable membership + title snapshot ก่อน ไม่เพิ่ม snapshot เข้า event ห้าฟิลด์ภายหลัง

การตรวจที่คาดหวัง:

- `supabase migration list` ก่อนสร้าง migration และตรวจ project ref ให้ตรง environment
- SQL/RLS tests ครบ owner, co-teacher แต่ละระดับ, student เจ้าของข้อมูล, student คนอื่น, ต่างห้อง, ต่าง org และ anon
- concurrency test สำหรับ increment/idempotency
- `supabase db lint --linked --level error` ใน environment ที่ได้รับอนุญาต
- unit tests ของ validation และ DTO allowlist

### เฟส 3 — หน้าครูสร้าง/ตั้งค่าและจัดแท็ก

เป้าหมายคือให้ครูสร้างคลังฝึกได้จากทางเข้าคุ้นเคย โดยไม่มี control ของคะแนนหลงเข้ามา

route หลักของเฟสนี้คือ `/practice`, `/practice/new?classroom=<uuid>` และ `/practice/[id]/edit`; ทางเข้าสร้างเป็นลิงก์ไปโดเมนนี้โดยตรง ไม่เพิ่มค่าชนิดที่สามใน `AssignmentType`

งานหลัก:

- เพิ่มตัวเลือก “คลังฝึก” ในทางเข้าสร้างงานภายในห้องเรียน แต่พาไป route/domain เฉพาะ และไม่เพิ่มทางเข้าใน sidebar หลัก
- ทำหน้าตั้งค่าแบบ compact: ชื่อ, คำชี้แจง, ห้องเป้าหมาย, สถานะ และรายการโจทย์; เมื่อมาจากห้องเรียนให้ตรึงห้องหลักและใช้ disclosure เลือกห้องเพิ่มเติมแบบเดียวกับ assignment ส่วนทางเข้ากลางเลือกหลายห้องในข้อมูลพื้นฐาน
- ใช้ selector ของคลังโจทย์เดิมโดยกรองเฉพาะชนิดที่รองรับและโหลด preview ตามคำขอ
- รองรับเลือก/เอาออกหลายข้อ จัดลำดับเมื่อจำเป็น และเตือนก่อนทิ้ง draft ที่ยังไม่บันทึก
- เพิ่ม flow bulk tag ตามภาพอ้างอิง โดยเขียนแท็กกลับที่โจทย์ต้นทาง ไม่สร้างแท็กสำเนาเฉพาะคลัง
- แสดง badge “ไม่มีคะแนน” ในรายการและหน้ารายละเอียดทุกจุดที่อาจสับสนกับแบบฝึกหัด

Acceptance gate:

- สร้าง แก้ ทำสำเนา เผยแพร่ ปิด และลบได้ตามสิทธิ์โดยไม่สร้าง assignment/submission ใด ๆ
- ไม่มีช่องคะแนน คะแนนเต็ม เกณฑ์ผ่าน เวลา หรือวิธีเก็บคะแนนใน payload และ UI
- การแก้แท็กสะท้อนกลับใน search ของคลังโจทย์และคลังฝึกโดยไม่ทำลาย question set เดิม
- ครูนอกขอบเขตเปิด URL ตรงแล้วได้ permission-denied/404 ตาม policy ไม่ใช่ข้อมูลว่างลวง
- หน้า desktop กะทัดรัดและหน้า 320px ไม่ล้นแนวนอน

การตรวจที่คาดหวัง:

- component/action tests ของ form state, validation, duplicate และ unsaved-change confirmation
- authorization tests ของทุก mutation
- browser QA เทียบภาพ 01 และ 06 ที่ 320, 390, 768 และ 1280 px
- ตรวจ keyboard, focus order, accessible name, loading/success/error feedback และ axe
- `npm test`, `npx tsc --noEmit`, `npm run lint:tokens` และ `npm run build`

### เฟส 4 — หน้านักเรียนค้นหาและกรองคลังโจทย์

เป้าหมายคือค้นหาจากโจทย์มากกว่าร้อยข้อได้เร็ว เข้าใจง่าย และไม่โหลดข้อมูลเกินจำเป็น

route หลักของเฟสนี้คือหน้ารอ `/practice/[id]` และรายการโจทย์ `/practice/[id]/library`; รายการใช้ URL state `q`, `tag` ซ้ำได้หลายค่า และ `page` ที่ validate แล้ว ค่าเริ่มต้นโหลด 24 ข้อต่อหน้า ส่วนหน้ารอไม่มี input คำตอบและไม่สร้าง event

งานหลัก:

- ทำหน้า student library ด้วยช่องค้นหาข้อความและ multi-select tag ที่แยกความหมายชัดเจน
- ใช้ AND สำหรับทุกแท็กที่เลือก พร้อมแสดงจำนวนผลลัพธ์และปุ่มล้างตัวกรอง
- เก็บ `query`, `tags`, sort และ page/cursor ใน URL ด้วยค่าที่ validate แล้ว
- ทำ server-side filtering/pagination และเลือกเฉพาะ field ที่รายการต้องใช้
- แสดง compact row พร้อมชื่อโจทย์ แท็ก สถานะเคยตอบ และจำนวนครั้งของนักเรียนคนนั้น
- รองรับ loading skeleton, ไม่มีโจทย์ในคลัง, ไม่พบผลค้นหา, error และไม่มีสิทธิ์เป็นคนละ state
- เมื่อกลับจากหน้าทำโจทย์ ต้องคืน filter และตำแหน่งรายการเดิม

Acceptance gate:

- `สอวน. ค่าย 1` + `ไฟฟ้า` คืนเฉพาะข้อที่มีทั้งสองแท็ก และเพิ่มแท็กที่สามแล้วยิ่งกรองแคบลงอย่างถูกต้อง
- search ชื่อ/ข้อความทำงานร่วมกับแท็กและ pagination โดยผลไม่ซ้ำหรือหายระหว่างหน้า
- นักเรียนไม่สามารถเปลี่ยน query เพื่อเห็นคลัง ห้อง หรือ progress ของคนอื่น
- หน้าแรกไม่ส่ง answer-bearing field หรือโจทย์ทั้งหมดให้ browser
- 100–1,000 รายการยังตอบสนองได้ตาม budget ที่กำหนดจากการวัดจริง และ UI ไม่กินพื้นที่แกน Y เกินกติกา

การตรวจที่คาดหวัง:

- unit tests ของ normalize/search/tag AND/query-string codec และ pagination boundary
- integration test ของ query กับข้อมูลหลายแท็ก ชื่อซ้ำ และโจทย์ที่ถูกนำออก
- inspect RSC/network payload ว่าไม่มี answer key/solution/ข้อมูลนักเรียนอื่น
- browser QA เทียบภาพ 02 รวม empty/error/permission state และ back-navigation
- accessibility, keyboard-only, 320/390/768/1280 px และไม่มี horizontal overflow

### เฟส 5 — ประสบการณ์ทำโจทย์และผลตรวจส่วนตัว

เป้าหมายคือให้นักเรียนฝึกได้จริงโดย reuse renderer/evaluator แต่ไม่สร้างร่องรอยคะแนน

route หลักของเฟสนี้คือ `/practice/[id]/questions/[questionId]`; ห้าม reuse action `checkAnswer` ของ submission เพราะ action นั้นเขียนข้อมูลการตรวจลง `submission_answers`

งานหลัก:

- เปิดโจทย์จากผลค้นหาโดยใช้ renderer เดิมเฉพาะชนิดที่ผ่าน allowlist
- แสดงปุ่ม “ตรวจคำตอบ” และ “ลองอีกครั้ง” โดยไม่ใช้คำว่า “ส่งงาน” หรือ “คะแนน”
- ตรวจคำตอบฝั่ง server และส่ง feedback กลับเฉพาะ session นักเรียนเจ้าของ request
- หลังตรวจรูปทรงคำตอบและประเมินผลบน server ให้ append accepted-check event ผ่าน RPC แบบ idempotent; ครูนับจาก event และไม่มีตาราง counter แยก
- ไม่ retry mutation แบบเพิ่มจำนวนโดยไม่มี idempotency key
- รองรับโจทย์สุ่มด้วย snapshot/receipt เฉพาะการฝึกที่ตรวจสอบฝั่ง server ได้ โดยไม่ส่ง answer key และไม่เขียนลง submission tables
- เก็บร่างระหว่างพิมพ์แบบ local-only หากทำ โดยแจ้งขอบเขตให้ชัดและไม่ถือเป็นการตอบ
- แสดง feedback โดยไม่ใช้คะแนน เช่น “ตรวจแล้ว”, “ยังไม่ตรง ลองอีกครั้ง” และคำตอบที่ถูกเฉพาะนโยบายที่เจ้าของอนุมัติ

Acceptance gate:

- เปิดโจทย์หรือพิมพ์ร่างไม่สร้าง event; กดตรวจคำตอบว่างไม่สร้าง event
- กดหนึ่งครั้งแล้ว client retry ด้วย idempotency key เดิมเพิ่มเพียงหนึ่งครั้ง
- ตอบถูกและตอบผิดต่างเพิ่ม “จำนวนครั้งที่ตอบ” เหมือนกัน แต่ครูแยกสองกรณีไม่ได้จากข้อมูลถาวร
- refresh หรือเปิด DevTools ไม่พบ answer key ใน initial payload
- ไม่มีแถวใหม่ใน assignment/submission/score analytics และไม่มีคำตอบใน log
- question type ทุกชนิดที่เปิดใช้ผ่าน test matrix ของ blank, valid, invalid-shape, correct, incorrect และ randomized case

การตรวจที่คาดหวัง:

- unit tests ของ evaluator adapter, non-empty validation, idempotency และ feedback DTO
- integration tests ของ authorization + idempotent event append + no-answer persistence
- browser/network inspection และ database assertion หลังตอบทั้งถูกและผิด
- browser QA เทียบภาพ 03 ด้วย keyboard, touch, reload และ network retry
- `npm test`, `npx tsc --noEmit`, `npm run lint:tokens` และ `npm run build`

### เฟส 6 — หน้าครูดูความคืบหน้าและรายละเอียดรายคน

เป้าหมายคือให้ครูเห็นการมีส่วนร่วมเท่าที่ขอ โดยไม่เลื่อนไปเป็นการประเมินผล

route หลักของเฟสนี้คือ `/practice/[id]/progress` และ `/practice/[id]/progress/[studentId]`; DTO หน้ารวมและรายคนแยกจาก DTO นักเรียนและใช้ allowlist คนละชุด

งานหลัก:

- ทำ overview แบบ compact table/list: นักเรียน, จำนวนข้อไม่ซ้ำที่เคยตอบ, จำนวนครั้งรวม และทางเปิดรายละเอียด
- ทำหน้ารายคน: ชื่อโจทย์/รหัสโจทย์, แท็ก และจำนวนครั้งที่ตอบ
- เพิ่ม search/filter ที่ช่วยหานักเรียนหรือโจทย์ แต่ไม่เพิ่ม filter ถูก/ผิดหรือคะแนน
- แสดง denominator ของจำนวนข้อในคลังปัจจุบันอย่างระวังเมื่อโจทย์ถูกเพิ่ม/นำออก และใช้ถ้อยคำว่า “เคยตอบ”
- ให้ student view ดู progress ของตนเองจาก DTO แยก ไม่ reuse DTO ครู
- ทำ empty state แยก “ยังไม่มีนักเรียน”, “ยังไม่มีใครลองตอบ” และ “ไม่มีสิทธิ์”

Acceptance gate:

- ครูเห็นว่าคนใดตอบข้อใดและกี่ครั้งตรงกับผลรวม event ทุกกรณี รวม retry ที่ idempotent
- UI, API payload และ export path ไม่มีคำตอบ ความถูกต้อง คะแนน หรือเวลา activity
- ไม่มีการเรียงค่าเริ่มต้นแบบ ranking และไม่มีสีแดง/เขียวที่สื่อผลการเรียน
- ครูร่วมแต่ละระดับได้สิทธิ์ตรง permission matrix ที่อนุมัติ และคนนอกห้องถูกปฏิเสธ
- จำนวนข้อที่เคยตอบไม่ถูกตีความเป็นคะแนนเมื่อจำนวนโจทย์ในคลังเปลี่ยน

การตรวจที่คาดหวัง:

- DTO snapshot tests ที่ fail หากมี field ต้องห้ามเพิ่มเข้ามา
- integration/RLS tests ด้วยครูสองห้อง นักเรียนสองคน และ organization คนละชุด
- browser QA เทียบภาพ 04 และ 05 รวมข้อมูลมาก, ข้อมูลว่าง, โจทย์ถูกนำออก และ mobile
- inspect network/RSC payload และทดสอบเปิด URL รายคนโดยตรง
- accessibility, keyboard, responsive layout และ design-token lint

### เฟส 7 — Hardening, performance, rollout และเอกสารส่งมอบ

เป้าหมายคือพิสูจน์เส้นทางจริงครบวงก่อนเปิด production และป้องกันฟีเจอร์กลับไปปนกับคะแนนภายหลัง

งานหลัก:

- ทำ end-to-end flow ครูสร้าง → นักเรียนค้นหลายแท็ก → ตอบหลายครั้ง → ครูเห็นผลรวม event
- เพิ่ม regression tests ว่าคลังฝึกไม่ปรากฏใน gradebook, assignment dashboard, homeroom score และ question statistics
- ทดสอบ concurrency, rapid click, reconnect, stale page, question edit/remove และ membership ถูกถอน
- วัด query plan/index และ payload กับ fixture อย่างน้อย 1,000 ข้อและ progress หลายคน
- ตรวจ security/RLS ด้วยต่าง role, ต่างห้อง, ต่าง organization และ direct URL/API calls
- ตรวจ accessibility, responsive, focus, loading/error และ compact-Y ทุกหน้าที่เกี่ยวข้อง
- อัปเดต `docs/FEATURE_STATUS.md`, `docs/DOMAIN.md`, `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` และคู่มือผู้ใช้ตาม behavior ที่ทำจริง
- เปิดด้วย feature flag บน Staging ก่อน แล้ว rollout production แบบจำกัดหลัง UAT ผ่าน

Acceptance gate:

- เส้นทางหลักและ negative permission cases ผ่านทั้ง automated test และ browser UAT
- ไม่มี forbidden field ใน database progress schema, DTO, logs, analytics และ teacher UI
- query/payload อยู่ใน budget ที่บันทึกไว้ และไม่มี N+1 บนหน้ารายชื่อนักเรียนหรือรายการโจทย์
- ทุกหน้าผ่าน 320/390/768/1280 px โดยไม่มี horizontal overflow และ Card/list ไม่สูงเกินกติกา compact-Y
- migration ledger local/Staging/Production ตรงกันก่อน deploy และไม่มีการแก้ migration ที่ apply แล้ว
- owner ลงนาม UAT ว่า “ไม่มีคะแนน” และขอบเขตที่ครูเห็นตรงความตั้งใจ ก่อนเปิด navigation ให้ผู้ใช้ทั้งหมด

การตรวจที่คาดหวัง:

- full `npm test`, `npx tsc --noEmit`, `npm run lint:tokens` และ `npm run build`
- database/RLS integration suite, `supabase db lint` และ migration audit
- authenticated browser E2E สำหรับ teacher/student/co-teacher และ negative cross-tenant cases
- axe/keyboard/touch/responsive QA พร้อมบันทึก viewport และผลจริง
- production smoke test แบบ read-only หลัง deploy; การสร้าง/ตอบข้อมูลจริงต้องใช้บัญชี QA และ environment ที่อนุมัติ

## ลำดับการเปิดใช้งาน

- เฟส 1 จบแล้วจึงเริ่ม schema; ห้ามเริ่มจากหน้าจอที่ผูกกับข้อมูลสมมติ
- เฟส 2 เปิดเฉพาะหลัง RLS และ idempotency ผ่าน เพราะทุกเฟสหลังพึ่ง invariant นี้
- เฟส 3–5 อยู่หลัง feature flag จน student flow และ teacher flow เชื่อมครบ
- เฟส 6 ห้าม query ตาราง raw answer ของระบบเดิมเพื่อเติมข้อมูลที่ progress ไม่มี
- เฟส 7 เป็น release gate ไม่ใช่งานเก็บรายละเอียดที่ข้ามได้

## สถานะการส่งมอบรอบ Phase 1–7

- Phase 1: contract “ไม่มีคะแนน”, exact multi-tag AND, accepted-check/idempotency และภาพอ้างอิงถูกตรึงแล้ว
- Phase 2: schema/RLS/RPC contract กำหนดเป็น 3 ตารางแยกและ service-only accepted-check; สถานะ apply จริงต้องยืนยันจาก migration ledger ของ environment ไม่ใช่จากไฟล์ใน Git
- Phase 3: ทางเข้าครู, list/create/edit/lifecycle และตัวเลือกโจทย์อยู่หลัง server-only `PRACTICE_LIBRARY_ENABLED`; ไม่เพิ่ม `AssignmentType`
- Phase 4: student library มีหน้ารอก่อนเข้า แล้วใช้ search + tag AND + pagination ใน URL ที่ `/practice/[id]/library` และ list DTO ที่ไม่บรรทุกเฉลย
- Phase 5: หน้าทำโจทย์ใช้ server evaluator/feedback ส่วนตัวและ append event แบบ idempotent โดยไม่เขียน submission
- Phase 6: overview/detail progress ใช้ DTO allowlist และปฏิเสธ view-only co-teacher; ไม่มีคะแนน ความถูกต้อง ranking หรือ activity timeline
- Phase 7: automated/browser/database evidence, viewport QA, performance fixture และ owner sign-off บันทึกใน `docs/SELF_PRACTICE_UAT.md`; ถ้ารายการ release gate ใดยังไม่ผ่าน ให้คง flag ปิดใน Production แม้ code path จะ build ผ่าน

## Definition of done ของ MVP

MVP ถือว่าเสร็จเมื่อครูสร้างคลังฝึกจากโจทย์จริงและเผยแพร่ให้ห้องได้ นักเรียนค้นด้วยชื่อและแท็กหลายค่าแบบ AND แล้วกดตรวจคำตอบได้หลายครั้ง นักเรียนเห็น feedback ส่วนตัว ครูเห็นเพียงรายการข้อที่เคยตอบกับจำนวนครั้ง และหลักฐานจาก schema, RLS, payload, automated tests และ browser UAT ยืนยันว่าไม่มีคำตอบ ความถูกต้อง หรือคะแนนรั่วเข้าสู่มุมมองครูและระบบผลการเรียน
