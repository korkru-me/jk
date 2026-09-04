# เครื่องมือคณิตศาสตร์ กระดาษทด และกระดานสอน

อัปเดตล่าสุด: 3 กันยายน 2026

สถานะ: **เฟส 8 — QA, accessibility, performance และ rollout audit เสร็จแล้ว**

เอกสารนี้กำหนดขอบเขตของแป้นคณิตศาสตร์ เครื่องคิดเลขวิทยาศาสตร์ กระดาษทดของนักเรียน การแนบวิธีทำ และกระดานสอนของครู เฟส 1 เพิ่ม schema, RLS, private Storage, Server Actions และสวิตช์ในหน้าสร้าง/แก้ไขงาน เฟส 2 เปิดแป้นคณิตศาสตร์และ DEG/RAD ในช่องคำตอบตัวเลข เฟส 3 เปิดเครื่องคิดเลข เฟส 4 เปิดกระดาษทด local-only เฟส 5 เปิดการแนบ/แก้/ส่ง artifact กับหน้าตรวจผล เฟส 6 เปิดโหมดสอนที่บันทึกกระดานกลับมาแก้ได้ เฟส 7 เพิ่ม scheduled orphan cleanup แบบ fail-closed และเฟส 8 ปิดงาน QA/accessibility/performance พร้อมตรวจเงื่อนไข rollout แล้ว

## เป้าหมาย

- ให้นักเรียนตอบค่าคณิตศาสตร์ที่พิมพ์ยากได้โดยไม่ต้องจำรูปแบบ `sqrt(...)` หรือชื่อค่าคงที่
- ให้ครูตัดสินใจแยกกันว่าแบบฝึกหัดหรือข้อสอบหนึ่งงานมีเครื่องคิดเลขและกระดาษทดหรือไม่
- ให้นักเรียนทดเลขด้วยปากกาหรือ touch บนหน้าเดียวกับโจทย์ โดยสิ่งที่ทดเฉย ๆ ไม่ออกจากอุปกรณ์และไม่กิน Storage ของระบบ
- ให้นักเรียนเลือกแนบกระดาษทดเป็นวิธีทำ หรือใช้รูปถ่ายจากมือถือได้ตามเดิม
- ให้สิ่งที่สร้างด้วยกระดาษทดกลับมาแก้ได้ก่อนส่ง เพราะเก็บ scene ต้นฉบับคู่กับภาพ preview
- ให้ครูเปิดโจทย์ในโหมดสอน เขียนคำอธิบาย และบันทึกกระดานได้ไม่เกิน 5 รายการต่อโจทย์ของงานนั้น

## คำที่ใช้ในผลิตภัณฑ์

- **แป้นคณิตศาสตร์** — ปุ่มช่วยกรอกตัวเลข ตัวดำเนินการ ฟังก์ชัน และค่าคงที่ในช่องคำตอบ ไม่ถือเป็นตัวช่วยหาคำตอบและไม่ถูกปิดตามกติกาข้อสอบ
- **เครื่องคิดเลข** — เครื่องคิดเลขวิทยาศาสตร์ที่คำนวณผลลัพธ์ได้ ครูเปิดหรือปิดเป็นรายงาน
- **กระดาษทด** — พื้นที่เขียนชั่วคราวของนักเรียนใน attempt ปัจจุบัน
- **วิธีทำที่แนบ** — กระดาษทดที่นักเรียนสั่งแนบ หรือรูปที่นักเรียนถ่าย/เลือกจากเครื่อง และถูกผูกกับ submission answer
- **กระดานสอน** — พื้นที่ที่ครูใช้เขียนอธิบายโจทย์ในโหมดสอนและเลือกบันทึกไว้ใช้ต่อ
- **พื้นที่เขียน** — คำกลางในโค้ดและเอกสารเมื่อกฎใช้ร่วมกันระหว่างกระดาษทดกับกระดานสอน

ห้ามใช้ “บอร์ดเขียน” เป็นคำหลักใน UI เพราะไม่บอกวัตถุประสงค์ชัดเท่า “กระดาษทด” หรือ “กระดานสอน”

## การตัดสินใจที่อนุมัติแล้ว

### ค่าเริ่มต้นและการควบคุม

- แป้นคณิตศาสตร์แสดงในช่องคำตอบตัวเลขเสมอ แม้ครูปิดเครื่องคิดเลข เพราะเป็น input accessibility ไม่ใช่เครื่องคำนวณ
- แบบฝึกหัดออนไลน์ที่สร้างใหม่เริ่มด้วยเครื่องคิดเลขและกระดาษทดเป็นเปิด
- ข้อสอบออนไลน์ที่สร้างใหม่เริ่มด้วยเครื่องคิดเลขและกระดาษทดเป็นปิด ครูเปิดเองได้
- งานโหมดพิมพ์ไม่มีเครื่องมือ browser เหล่านี้
- งานเดิมอ่านเป็นปิดทั้งสองค่าเพื่อไม่เปลี่ยนกติกาของงานที่แจกไปแล้ว
- “เปิดกระดาษทด”, “เปิดเครื่องคิดเลข” และ “บังคับแนบวิธีทำ” เป็นคนละการตั้งค่า
- เมื่อบังคับแนบวิธีทำ นักเรียนใช้กระดาษทดหรือรูปถ่ายก็ได้ จึงไม่มี configuration ที่ปิดกระดาษทดแล้วทำให้ส่งงานไม่ได้

### มุม DEG/RAD

- นักเรียนเลือก `DEG` หรือ `RAD` ได้จากช่องคำตอบตัวเลข
- โหมดต้องมองเห็นชัด ไม่ซ่อนอยู่ในเมนู
- โหมดถูกเก็บพร้อมช่องคำตอบหรือข้อย่อยที่เกี่ยวข้อง ไม่ใช้ global state ที่การสลับในข้อหลังจะเปลี่ยนความหมายของข้อก่อน
- คำตอบเก่าและคำตอบที่ไม่มี metadata อ่านเป็น `DEG` ตามพฤติกรรม evaluator ปัจจุบัน
- เครื่องคิดเลขใช้โหมดเดียวกับช่องคำตอบที่กำลัง active และปุ่ม “ใส่ผลลัพธ์ในคำตอบ” ใส่ค่าตัวเลขที่คำนวณแล้ว

### การบันทึกและแก้ไข

- กระดาษที่ยังไม่แนบ autosave เฉพาะใน IndexedDB ของอุปกรณ์เพื่อกู้จาก reload/browser crash และไม่อัปโหลดทุกเส้นขึ้น server
- local scene แยกอย่างน้อยด้วย user, submission, submission answer และ part/blank identity เพื่อไม่ไหลข้ามบัญชีหรือ attempt
- local scene ถูกลบเมื่อส่งสำเร็จ attempt ใช้งานต่อไม่ได้ หรือเกิน TTL ที่กำหนด
- การกด “แนบจากกระดาษทด” เท่านั้นที่สร้างภาพ preview (WebP หรือ PNG เมื่อเบราว์เซอร์เข้ารหัส WebP ไม่ได้) และ scene ต้นฉบับใน private Storage
- วิธีทำที่สร้างในระบบแก้ได้จน submission ถูกส่ง หลังส่งแล้วเป็น read-only เพื่อรักษาหลักฐานของ attempt
- รูปถ่ายเดิมแก้เส้นภายในภาพไม่ได้ แต่เปิดเป็นพื้นหลังแล้วเขียนทับเพิ่มเติมก่อนส่งได้
- Attempt ใหม่เริ่มกระดาษใหม่ วิธีทำของ attempt เก่ายังคงอยู่กับผลครั้งเดิม

### กระดานสอน

- รุ่นแรกเป็นโหมดสำหรับครูฉายหรือแชร์หน้าจอ ไม่ broadcast scene แบบ realtime ไปยังอุปกรณ์นักเรียน
- กระดานผูกกับ assignment + question + creator ไม่เขียนกลับเข้าโจทย์กลางในคลังโดยอัตโนมัติ
- ครูร่วมที่มีสิทธิ์อ่านงานเห็นกระดานได้ ผู้สร้างเท่านั้นที่แก้หรือลบกระดานของตน
- ผู้สร้างมี 5 slots ต่อโจทย์ของงานนั้น บังคับด้วยฐานข้อมูล ไม่ใช่ UI อย่างเดียว
- เมื่อครบ 5 ต้องเลือก slot และยืนยัน “แทนที่” ห้ามเขียนทับรูปเก่าสุดเงียบ ๆ
- กระดานแต่ละ slot เก็บ preview และ scene ต้นฉบับ จึงเปิดแก้ต่อได้

## ประสบการณ์นักเรียน

### แป้นคณิตศาสตร์

แป้นเปิดตาม focus ของช่องคำตอบและแทรกที่ cursor หรือแทน selection ไม่ต่อท้ายอย่างเดียว ชุดหลักประกอบด้วยตัวเลข จุดทศนิยม `+ − × ÷`, วงเล็บ, เศษส่วน, เลขยกกำลัง, `√`, `π`, `e`, `sin`, `cos`, `tan`; ชุดขั้นสูงเพิ่ม inverse trig, `log`, `ln`, `abs`, รากลำดับที่ n และ scientific notation

ปุ่มใช้สัญลักษณ์ที่นักเรียนอ่าน แต่ค่าที่ evaluator รับต้อง normalize ไปยังไวยากรณ์ปลอดภัยชุดเดียวกัน การตรวจคะแนนจริงอยู่ฝั่ง server เสมอ

ของที่ส่งมอบในเฟส 2:

- ช่องคำตอบตัวเลขทุกแบบใช้แป้นเดียวกัน เปิดเมื่อ focus และแทรกที่ cursor/ครอบ selection ได้ทั้ง desktop, touch และ keyboard
- ชุดหลักมีตัวเลข ตัวดำเนินการ วงเล็บ `π`, `e`, ยกกำลัง, ราก, เศษส่วน และตรีโกณมิติ ส่วนชุดขั้นสูงมี inverse/hyperbolic trig, `log`, `ln`, `abs`, factorial, รากลำดับที่ n, scientific notation และการปัดเศษ
- parser สำหรับคำตอบนักเรียนเขียนเป็น grammar แบบ allowlist ที่จำกัดความยาว จำนวน token ความลึก และจำนวน operation ไม่ใช้ `eval`, `Function` หรือ general-purpose math runtime กับข้อความที่นักเรียนส่งมา
- DEG/RAD ผูกกับ logical input แต่ละช่อง บันทึกใน transaction เดียวกับคำตอบ สำรองพร้อมคำตอบเมื่อ offline และใช้ค่าเดียวกันใน preview, instant check และ final grading; ข้อมูลเก่าที่ไม่มี metadata อ่านเป็น DEG

### เครื่องคิดเลข

เครื่องคิดเลขเปิดจาก toolbar ของหน้าทำโจทย์และ focus mode, lazy-load เมื่อกดครั้งแรก, ใช้ออฟไลน์ได้, มีประวัติชั่วคราวเฉพาะ attempt และไม่ส่งประวัติขึ้น server ต้องใช้ allowlist evaluator เดียวกับคำตอบ ห้ามนำ implementation เก่าที่ใช้ `new Function` กลับมา

ของที่ส่งมอบในเฟส 3:

- ปุ่มเครื่องคิดเลขแสดงทั้ง toolbar ปกติและโหมดโฟกัสเฉพาะเมื่อค่า `calculator_enabled` ที่อ่านจาก server เป็นจริง
- เครื่องคิดเลขโหลดเมื่อกดครั้งแรกและคง expression/history สูงสุด 20 รายการไว้ใน memory ของหน้าเดิมเท่านั้น ปิด–เปิดใหม่แล้วยังใช้ต่อได้ แต่ reload/ออกจาก attempt แล้วหายและไม่มี Server Action สำหรับ history
- รองรับ arithmetic, วงเล็บ, `π`, `e`, trig/inverse trig, `log`, `ln`, รากที่สอง/สาม, ยกกำลัง, reciprocal, `abs`, `exp`, factorial และ percent โดยใช้ bounded allowlist parser ตัวเดียวกับคำตอบ
- เมื่อเลือกช่องคำตอบ เครื่องคิดเลขใช้ DEG/RAD ของช่องนั้น การเปลี่ยนโหมดในเครื่องคิดเลขอัปเดต metadata ของช่อง และ “ใส่ผลลัพธ์ในคำตอบ” เขียนค่าที่คำนวณแล้วกลับไปยังช่องเดิมผ่าน autosave ปกติ
- แผงเป็น floating panel บน desktop และ bottom sheet ที่ scroll ภายในบนจอมือถือสั้น; authenticated browser QA ผ่านที่ 390×844, 375×667 และ focus mode

### กระดาษทด

- Desktop: แผงด้านข้างที่ปรับความกว้างได้
- iPad แนวนอน: split view ระหว่างโจทย์กับกระดาษ
- iPad แนวตั้ง/มือถือ: full-screen sheet หรือ bottom sheet
- เครื่องมือขั้นต่ำ: ปากกา ไฮไลต์ ยางลบ สี ขนาดเส้น undo/redo ข้อความ เส้นตรง รูปทรง เลือก/ย้าย zoom/pan และพื้นเปล่า/เส้นบรรทัด/ตาราง/จุด
- รองรับ Pointer Events สำหรับ mouse, touch และ stylus; palm rejection ระดับ GoodNotes ไม่ใช่สิ่งที่ browser รับประกัน

ของที่ส่งมอบในเฟส 4:

- ปุ่ม “กระดาษทด” แสดงใน toolbar ปกติและโหมดโฟกัสเฉพาะเมื่อ `scratchpad_enabled` จาก server เป็นจริง ใช้คอมโพเนนต์เดียวกันทั้งหน้าทำจริงและ preview; preview แสดง editor ได้แต่จงใจไม่บันทึกข้อมูล
- Excalidraw และ CSS ของ editor โหลดหลังผู้ใช้กดครั้งแรกเท่านั้น แผง desktop อยู่ด้านขวาและปรับความกว้างได้ ส่วนจอมือถือ 390×844 เป็น full-screen โดยไม่ทำให้ document ล้นแนวนอน
- มี selection/move, ปากกา, preset ไฮไลต์, ยางลบ, สี/ขนาด/ความโปร่งใส, undo/redo, ข้อความ, เส้น/ลูกศร/รูปทรง, zoom/pan และพื้นเปล่า/เส้นบรรทัด/ตาราง/จุด; ปิด–เปิดในหน้าเดิมแล้วยังรักษาฉากกับ undo history
- ฉากที่ยังไม่แนบ autosave แบบ debounce ลง IndexedDB แยกด้วย authenticated user + submission + answer + part, จำกัด 2 MiB และ 10,000 elements, หมดอายุ 7 วันและ purge เมื่อเปิด editor ครั้งถัดไป รวมทั้งลบฉากของ attempt แบบ best effort หลัง submit สำเร็จ
- ไม่มี Server Action, Storage upload หรือ telemetry ต่อ stroke ในเฟสนี้ การกดแนบ/สร้าง WebP preview/กลับมาแก้ artifact ที่แนบแล้วเป็นงานของเฟส 5
- production bundle ของหน้า take หลังเฟส 4 มี 17 initial client chunks รวม 777,953 bytes raw / 237,410 bytes gzip (0.742/0.226 MiB) เพิ่มจากเฟส 3 เพียง 2,863/1,534 bytes; scan ยืนยันว่า Excalidraw และ mathjs ไม่อยู่ใน initial chunk union

ของที่ส่งมอบในเฟส 5:

- ช่องคำตอบตัวเลขแต่ละข้อ/ข้อย่อยมีส่วน “วิธีทำ” ที่เลือกเขียนบนกระดาษทดหรือแนบรูปจากอุปกรณ์ได้ ครู preview ขั้นตอนนี้ใน memory เท่านั้นและไม่สร้างไฟล์บน server
- เมื่อกดแนบ ระบบ render เฉพาะตอนนั้นเป็น preview คู่กับ versioned scene แล้วอัปโหลดผ่าน token ที่ผูกกับ answer/path; client แจ้งชนิดภาพที่ encode ได้จริง (`webp` หรือ `png`) และ Server Action ตรวจสิทธิ์ attempt, เวลา, SEB/Android gate, MIME, ขนาด, signature ที่ต้องตรงกับชนิดที่แจ้ง, scene version และจำนวน element ก่อนสร้างหรือแทนที่ reference
- Artifact หนึ่ง logical slot มีฉบับปัจจุบันหนึ่งรายการ นักเรียนเห็น thumbnail, นำออก, เปิด scene ที่แนบกลับมาแก้และอัปเดตได้ตราบใดที่ submission ยัง `in_progress`; การแทนที่ลบไฟล์ฉบับเดิมแบบ best effort หลัง reference ใหม่สำเร็จ
- กติกา “บังคับแนบวิธีทำ” ยอมรับทั้ง artifact จากกระดาษทดและ `work_images` เดิมต่อข้อย่อย โดยตรวจทั้งใน UI และฝั่ง server ก่อน finalize จึงข้ามด้วยการเรียก action ตรง ๆ ไม่ได้
- หน้าผลลัพธ์แสดงภาพวิธีทำแบบ read-only ผ่าน signed URL อายุสั้นแก่ผู้ที่ผ่านสิทธิ์ดูรายละเอียดคำตอบ และไม่ส่ง scene ต้นฉบับไปยังหน้านี้
- authenticated browser QA ผ่าน flow กระดาษว่าง, เขียน–แนบ, thumbnail, เปิดแก้ไข และ layout มือถือโดยไม่ล้นแนวนอน
- production bundle ของหน้า take หลังเฟส 5 ยังมี 17 initial client chunks รวม 786,060 bytes raw / 239,716 bytes gzip (0.750/0.229 MiB) เพิ่มจากเฟส 4 เพียง 8,107/2,306 bytes; scan ยืนยันว่า Excalidraw, mathjs และ Supabase browser client ไม่อยู่ใน initial chunk union

ของที่ส่งมอบในเฟส 6:

- หน้ารายละเอียดงานมีปุ่ม “โหมดสอน” แยกจาก preview นักเรียน ครูเปิดโจทย์ตามลำดับจริง แสดง/ซ่อนเฉลย และเขียนข้างโจทย์ได้โดยไม่สร้าง submission หรือแก้โจทย์ต้นฉบับ
- กระดานสอนใช้เครื่องมือวาดและพื้นกระดาษชุดเดียวกับกระดาษทด บันทึกเฉพาะเมื่อครูกด โดยสร้าง WebP preview คู่กับ versioned scene ใน private Storage และเปิด scene เดิมกลับมาแก้ได้
- แป้นเครื่องมือของทั้งสองกระดานล็อกเครื่องมือที่เลือกไว้หลังวาดเสร็จ (`activeTool.locked`) มีสไลเดอร์ขนาดเส้น 1–12 ที่ sync สองทางกับปุ่มขนาดของ Excalidraw และกระดานใหม่เริ่มที่ปากกา `#172554` เส้นหนา 2 เส้นทึบ พื้นรูปโปร่งใส sloppiness architect; ฉากที่บันทึกไว้แล้วยังคืนค่าเดิมของตัวเอง
- ผู้สร้างแต่ละคนมี 5 slots ต่อ assignment + question; การบันทึกทับต้องยืนยัน ผู้สร้างเท่านั้นที่แก้หรือลบ ส่วนครูร่วมที่มีสิทธิ์อ่านเปิดดูสำเนาของผู้อื่นแบบ read-only พร้อมชื่อผู้สร้างได้
- การเปลี่ยนข้อ เปิด slot อื่น หรือออกจากโหมดสอนขณะมีเส้นที่ยังไม่บันทึกต้องยืนยันก่อน; กระดานเปล่าไม่อัปโหลด และการลบเอาทั้ง reference, preview และ scene ออกแบบ best effort
- authenticated browser QA ผ่านการบันทึก เปิดแก้ บันทึกทับ ลบ เตือนก่อนทิ้งงาน และ layout desktop/mobile โดยหลัง QA ไม่มีไฟล์ทดสอบค้าง
- production bundle ของหน้า take หลังเฟส 6 ยังเท่าเดิมที่ 17 initial client chunks รวม 786,060 bytes raw / 239,718 bytes gzip (0.750/0.229 MiB); Excalidraw, mathjs, Supabase browser client และ signed-upload path ของโหมดสอนไม่อยู่ใน initial chunk union

ของที่ส่งมอบในเฟส 7:

- Vercel Cron เรียก `GET /api/internal/math-work-cleanup` วันละครั้งเวลา 02:45 Asia/Bangkok; route ทำงานเมื่อมี `CRON_SECRET` สุ่มอย่างน้อย 32 ตัวอักษรและ Bearer token ตรงกันเท่านั้น ถ้ายังไม่ตั้งค่า route ตอบ 503 และไม่แตะ Storage
- งานล้างใช้ service role เฉพาะหลังผ่าน cron authorization, enumerate เฉพาะ namespace `students/` และ `teachers/` ใน private bucket, จำกัด 100,000 objects/100,000 folders ต่อรอบ และลบได้เฉพาะ path ที่ตรงกับ upload builder รวม slot ครู 1–5 เท่านั้น path แปลกหรือ timestamp อ่านไม่ได้ถูกเก็บไว้
- ไฟล์ไม่มี reference ต้องเก่าครบ 7 วันก่อนเป็น candidate และทุก candidate ถูกตรวจ exact path กับทั้ง `student_work_artifacts.preview_path/scene_path` และ `teaching_boards.preview_path/scene_path` จากฐานข้อมูลซ้ำทันทีเป็น batch ก่อนลบ ความล้มเหลวของ Storage listing หรือ reference query ยกเลิกรอบก่อนเริ่มลบ
- route ไม่ตอบหรือ log path, signed URL, scene หรือข้อมูลนักเรียน มีเฉพาะ aggregate count/bytes และรองรับ `?dryRun=1` สำหรับตรวจ production โดยไม่ลบ
- unit/integration-style tests ครอบคลุม path allowlist, grace boundary, timestamp ที่พิสูจน์ไม่ได้, referenced object, reference-scan failure, dry-run และ cron authorization; production server dry-run กับ Supabase ที่ผูกจริงสแกนสำเร็จ 0 objects/0 deletes
- เฟสนี้ไม่มี schema change; `supabase migration list` ยืนยัน local/remote ตรงกัน และ linked database lint ผ่านโดยเหลือเพียง warnings เดิมที่ไม่เกี่ยวกับเครื่องมือชุดนี้ การ schedule จริงเริ่มหลัง deploy config นี้พร้อมตั้ง `CRON_SECRET`
- production bundle หลังเฟส 7 ยังมี 17 initial client chunks รวม 786,060 bytes raw / 239,718 bytes gzip (0.750/0.229 MiB) เท่าเฟส 6 และ scan ไม่พบ cleanup server code ใน initial chunk union ของหน้า take

ของที่ส่งมอบในเฟส 8:

- authenticated browser QA ยืนยันหน้า preview และโหมดสอนด้วยบัญชีครูจริง รวมเส้นทางกลับที่รักษาหน้าต้นทาง ป้ายชนิดโจทย์ภาษาไทย และการไม่แย่ง keyboard focus เมื่อ editor โหลด; flow บันทึก–เปิดแก้–แทนที่–ลบและ navigation guard ผ่านตั้งแต่เฟส 6 โดยลบข้อมูล QA ออกจาก Storage แล้ว
- โหมดสอนลด focus ซ้ำของ slot ว่างให้เหลือ action เดียวต่อช่อง ปุ่มของแอปมี accessible name และพื้นที่ editor เป็น region ที่มีชื่อ/status แบบ `aria-live`; ปุ่มเมนูมือถือที่ไม่มีชื่อหนึ่งจุดเป็นของ Excalidraw upstream ไม่ใช่ปุ่มที่ KorKru สร้าง
- ตรวจ layout จริงที่ desktop, mobile 390×844 และ tablet 820×1180 แล้วไม่เกิด document overflow แนวนอน และ reset viewport หลังตรวจ
- rollout audit แบบอ่านอย่างเดียวยืนยันว่า bucket `math-work-artifacts` เป็น private จำกัด 5 MiB และรับเฉพาะ WebP/JSON (เพิ่ม `image/png` ภายหลังด้วย migration `20260904023417`), ตาราง artifact/teaching board ไม่มีข้อมูล QA ค้าง, migration local/remote ตรงกัน และ production cleanup dry-run จบโดยไม่ลบข้อมูล
- ชุดตรวจสุดท้ายผ่าน 58 test files / 694 tests, TypeScript, design-token lint และ production build; bundle หน้า take ยังเท่าเฟส 7 ที่ 17 chunks, 786,060 bytes raw / 239,718 bytes gzip และไม่พบ Excalidraw, mathjs, Supabase browser client หรือ cleanup server code ใน initial union
- deployment นี้ยังไม่มี Vercel project link/CLI และยังไม่ได้ตั้ง `CRON_SECRET` ใน environment ที่ตรวจ จึงเป็น **พร้อม deploy แต่ cron ยังไม่ทำงานจริง** จนกว่าจะผูก deployment และตั้ง secret อย่างน้อย 32 ตัวอักษร
- รอบนี้ไม่มี credential นักเรียนและไม่มี fixture หลายองค์กรสำหรับ live authorization test; หน้า preview ของงานที่ใช้ตรวจปิด calculator/scratchpad และไม่มีงานออนไลน์ในฐานที่เปิด flag เหล่านี้ จึงอ้างเฉพาะ authenticated teacher QA รอบสุดท้าย ส่วน enabled-tool browser flows ใช้ผล QA จากเฟส 2–6 และยังต้องเพิ่ม automated multi-role RLS test ก่อนประกาศพร้อมใช้จริงทั้งระบบ

## ประสบการณ์ครู

หน้าสร้างและแก้ไขงานต้องแสดงสวิตช์เครื่องคิดเลขกับกระดาษทดเฉพาะงานออนไลน์ และสรุปค่าทั้งสองก่อนบันทึก การ duplicate งานคัดลอกค่าตามต้นฉบับ หน้าตัวอย่างนักเรียนต้องแสดงเครื่องมือเหมือนค่าที่ตั้งจริงโดยไม่สร้าง submission

“โหมดสอน” แยกจาก preview ปัจจุบัน เพราะ preview จงใจไม่เขียน Storage โหมดสอนต้องมี authorization และ persistence ของตัวเอง ครูเปลี่ยนข้อ แสดง/ซ่อนเฉลย เขียน และจัดการ 5 slots ได้โดยไม่เปลี่ยน requirement การแนบวิธีทำของนักเรียน

## โครงสร้างข้อมูลจากเฟส 1

Migration `20260903035839_student_math_tools_foundation.sql` แยกหน้าที่ดังนี้:

- Assignment flags `scratchpad_enabled` และ `calculator_enabled`; แถวเก่าเป็นปิด ส่วน create action กำหนดค่าเริ่มต้นของงานใหม่ตามชนิด
- `submission_answers.math_input_modes` เป็น object แยกจาก `student_answer`; object ว่างหมายถึง `DEG`
- `student_work_artifacts` ผูก exact submission answer + part key พร้อม owner, tenant, source, private paths, ขนาด, element count และ format version
- `teaching_boards` ผูก assignment + question + creator + slot 1–5 โดย unique/check constraint บังคับเพดานจริง
- Private bucket `math-work-artifacts` รับเฉพาะ WebP/PNG/JSON และไม่มี `storage.objects` policy สำหรับ client; Server Action ออก path-bound signed upload token และ signed read URL อายุสั้นหลังตรวจสิทธิ์

`submission_answers.work_images` และ public URLs เก่าต้องอ่านได้ต่อ ห้าม migration บังคับย้ายข้อมูลเก่าก่อนเส้นทางใหม่พร้อม กติกา “แนบวิธีทำครบ” ต้องยอมรับรูปเก่าหรือ artifact ใหม่โดยไม่เปลี่ยนคะแนนและ answer snapshot เดิม

## Lifecycle และ retention

- กระดาษไม่แนบ: local-only; ลบทันทีหลังส่งสำเร็จ/attempt ใช้ต่อไม่ได้ และล้างรายการเกิน TTL เมื่อเปิดหน้า
- Artifact นักเรียน: อยู่ตาม lifecycle ของ submission; ถอดหรือแทนที่ก่อนส่งแล้ว enqueue ไฟล์เดิมให้ลบ
- กระดานสอน: อยู่จนผู้สร้างลบหรือ assignment ถูกลบ
- Upload ที่ไม่มี reference: เว้น grace period 7 วัน แล้ว scheduled cleanup ที่มี cron secret ตรวจ exact reference จากทั้งสองตารางซ้ำก่อนลบ; หาก scan เกินเพดานหรือไม่ครบจะไม่เริ่มลบ
- การลบไฟล์เป็น best effort หลัง database mutation สำเร็จ; cleanup เป็น safety net ไม่ใช่เหตุผลให้ client อัปโหลดทุก stroke

นโยบาย retention ระยะยาวของ submission ยังต้องอยู่ภายใต้นโยบายข้อมูลนักเรียนทั้งระบบ เอกสารนี้ไม่กำหนดอายุใหม่แทน policy กลางที่ยังต้องสรุป

## Security invariants

- Browser state, assignment flags ที่ client ส่งมา, Storage path และ MIME type เป็น untrusted input
- นักเรียนเปลี่ยน artifact ได้เฉพาะ answer ของตนที่ยัง in progress และผ่านเวลา/SEB/Android access gate เดียวกับ autosave
- หลัง submit ห้ามแก้ scene, preview หรือ metadata ของหลักฐานเดิม
- ครูอ่าน artifact นักเรียนได้หลังตรวจสิทธิ์ assignment/classroom/organization เดียวกับหน้าตรวจคำตอบ
- Scene และ preview ใหม่ไม่ใช้ public bucket; signed URL อายุสั้นและ response ที่มี URL ต้องไม่ถูก cache สาธารณะ
- จำกัดจำนวนไฟล์ ขนาด scene จำนวน element ความยาวข้อความ MIME type และ format version ฝั่ง server/storage
- ห้าม log scene, คำตอบเต็ม, signed URL หรือ path ที่มีข้อมูลส่วนบุคคล
- Orphan cleanup ต้องตรวจ reference ครบหรือยกเลิกทั้งรอบ ห้ามลบจากผล scan ที่ไม่สมบูรณ์

## Performance invariants

- หน้าทำโจทย์ต้องไม่ import Excalidraw, mathjs หรือ Supabase browser client เพิ่มใน initial path
- แป้นคณิตศาสตร์ core ต้องเล็กและไม่ลาก evaluator ก้อนใหญ่เข้าหน้าแรก
- เครื่องคิดเลขและพื้นที่เขียนเป็น dynamic chunks ที่โหลดหลัง user gesture
- ทุกเฟสบันทึก raw/gzip client-reference chunk union ของ `/assignments/[id]/take` ด้วย `npm run measure:take-bundle` หลัง production build
- หากการเพิ่มฟีเจอร์ทำให้ iOS เปิดหน้าไม่ได้หรือ first-load โตผิดปกติ ให้หยุด rollout และแก้การแบ่ง chunk ก่อน

## ลำดับการพัฒนา

0. ปิดงานค้าง ล็อกสเปก ตรวจ migration และเก็บ performance baseline
1. Schema, private Storage, RLS, Server Actions และ assignment settings
2. Safe math engine, DEG/RAD persistence และแป้นคณิตศาสตร์
3. เครื่องคิดเลขวิทยาศาสตร์แบบ lazy-loaded
4. กระดาษทด local-only และ responsive ink editor
5. แนบ/แก้/ส่ง artifact และอ่านในหน้าตรวจ
6. โหมดสอนกับกระดาน 5 slots
7. Scheduled cleanup, retention และ security hardening
8. Authenticated browser QA, accessibility, performance และ rollout

สถานะปัจจุบัน: เฟส 0–8 เสร็จในโค้ดและผ่าน rollout audit ตามขอบเขต credential/environment ที่มี แป้นคณิตศาสตร์, DEG/RAD, เครื่องคิดเลข, กระดาษทด local-only, artifact ที่แนบ/แก้/ส่ง/อ่านในหน้าผลลัพธ์, โหมดสอนพร้อมกระดาน 5 slots และ scheduled orphan cleanup แบบ fail-closed พร้อม deploy แล้ว งานปฏิบัติการที่เหลือคือผูก deployment และตั้ง `CRON_SECRET`; automated multi-role RLS test กับ live student flow ยังเป็น production-readiness requirement ของระบบโดยรวม ไม่ใช่สิ่งที่เฟสนี้อ้างว่าผ่านแล้ว

แต่ละเฟสต้องเป็นหน่วย commit ที่ตรวจรับได้ Migration ต้องอยู่ใน commit เดียวกับโค้ดที่พึ่งพา และห้ามเปิด UI production ก่อน authorization/persistence ของเฟสนั้นพร้อม

## Definition of done ทั้งชุด

- ครูควบคุมเครื่องคิดเลขและกระดาษทดได้ตามงานจริง
- แป้นคณิตศาสตร์ใช้ได้กับ numeric input ทุกชนิดที่รองรับ โดย DEG/RAD ให้ผลเดียวกันทั้ง preview, instant check และ final grading
- กระดาษไม่แนบไม่ออกจากอุปกรณ์และถูกล้างตาม lifecycle
- วิธีทำที่แนบเปิดดูและกลับมาแก้ก่อนส่งได้ โดยข้อมูลเก่ายังอ่านได้
- ครูบันทึกกระดานสอนได้ไม่เกิน 5 slots และสิทธิ์ไม่ข้ามผู้ใช้/tenant
- หน้า take ยังเปิดได้บน mobile/iPad, ใช้ stylus/touch/keyboard ได้ และผ่าน bundle budget
- RLS/Server Action tests, unit tests, TypeScript, design-token lint, production build และ authenticated browser QA ผ่าน

## ไม่รวมในชุดแรก

- Realtime broadcast หรือ collaborative whiteboard ระหว่างครูกับนักเรียน
- OCR, ค้นหาลายมือ, แปลงลายมือเป็นสมการ หรือ AI ตรวจวิธีทำจากภาพ
- การรับประกัน palm rejection/latency เทียบเท่า native GoodNotes
- การแปลงภาพถ่ายหรือ PNG เก่าให้กลับเป็น editable vector strokes
- การย้าย work image เก่าทั้งหมดไป private Storage ก่อนเส้นทาง compatibility พร้อม
