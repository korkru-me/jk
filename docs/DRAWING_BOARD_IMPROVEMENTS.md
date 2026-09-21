# แผนปรับปรุงกระดาษทดและกระดานสอน

อัปเดตล่าสุด: 22 กันยายน 2026

สถานะ: **เฟส 7 — implementation ของ hardening ทำเสร็จบน branch `codex/drawing-board-phase-7`; ยังไม่ merge/deploy** compatibility fixtures, session-only Library, keyboard/paste/drop/context policy matrix, accessibility, local teacher loop/heap และ security review ผ่านแล้ว; authenticated saved-board/attachment/Auth/Storage flow, physical Safari/iPad/desktop + stylus UAT และ schema debt ของ preview PNG บน Safari ยังเป็น rollout gate ในเฟส 8 ก่อน deploy

เอกสารนี้เป็น source of truth ของงานปรับปรุงพื้นที่เขียนรุ่นถัดไป ส่วน `docs/STUDENT_MATH_TOOLS.md` ยังอธิบายฟีเจอร์ที่ส่งมอบแล้วในรุ่นปัจจุบัน หากเอกสารนี้พูดถึง “เป้าหมาย” หมายถึงสภาพปลายทางของเฟส 1–8 ไม่ใช่ของที่ production มีแล้ว; ผลลัพธ์เฟส 1–7 ด้านล่างเป็นโค้ดบน branch ที่ยังไม่ merge/deploy และงานเฟส 8 ยังต้องทำต่อ

ฐานที่ตรวจในเฟส 0 คือ commit `ecfacda79158d80fe73d529a45d1e49616b9218c` ซึ่งตรงกับ `origin/exam-uat-evidence` ณ วันที่ตรวจ งานเฟส 0 อยู่บน branch `codex/drawing-board-phase-0` และไม่ deploy หรือเปลี่ยน `origin/master`

## ผลลัพธ์ของเฟส 0

- ล็อก capability matrix ของนักเรียนและครู รวมเครื่องมือที่ต้องมี ต้องซ่อน และต้องบังคับด้วย policy
- ล็อก state machine ของ draft, attachment, saved board และ one-step recovery แยกจากสถานะการเลือกเครื่องมือหรือ pan/zoom
- ล็อก compatibility contract ของ scene v1, IndexedDB, Storage path, lazy loading และ preview mode
- เก็บ baseline ของ test, type-check, design-token lint, production build, initial bundle และ local runtime หลาย viewport
- ระบุช่องว่างหลักของโค้ดปัจจุบัน: editor host ซ้ำกัน, policy ยังเป็นการซ่อน UI บางส่วน, สถานะบันทึกยังไม่แยก revision, และ automated coverage ของกระดานยังน้อย
- ไม่แก้ schema, RLS, Storage, dependency, route, component หรือพฤติกรรมผู้ใช้ในเฟสนี้

## ผลลัพธ์ของเฟส 1

- รวม Excalidraw host เป็น `DrawingBoardCore` ชุดเดียวสำหรับนักเรียนและครู แล้วให้ role policy เดียวกันคุม tool, action, shortcut, menu/context/long-press, clipboard, paste และ drop; native Library, More tools, lock, import/export/help/link/embed/AI และ browser Save/Open/Print ถูกปิดจาก boundary เดียวกัน
- เพิ่ม pure scene validator ที่ใช้ exact-key allowlist กับ envelope v1, stable app state, element แยกตาม type, binding/roundness/crop/fixed segment, file และ claim metadata พร้อมตรวจค่าตัวเลขแบบ finite/bounded (พิกัดและขนาด ±1,000,000, zoom 0.1–30, stroke 0–100, opacity 0–100, roughness 0–2, font ไม่เกิน 1,000 และ version/timestamp/nonce เป็น safe integer), role/type, link/custom data/group/lock/frame relation, MIME/signature/base64, 2 MiB และ 10,000 elements ก่อน raw scene เข้า editor และก่อน persist ฝั่ง client/server; live mode ผ่อนเฉพาะ line/arrow/freedraw ตัวเดียวที่ id ตรง `appState.newElement.id` ระหว่าง gesture ส่วน full mode ยังบังคับ point ที่สมบูรณ์ก่อนบันทึก
- element ที่ลบแล้วยังตรวจ shape/field ทุกตัว แต่ stale binding/container ของ tombstone และ edge จาก element ที่ยังอยู่ไปยัง counterpart ที่ถูกยางลบทำเป็น tombstone ถูกถือเป็น undo history ที่ไม่ทำงาน; relation ระหว่าง element ที่ยังอยู่ทั้งคู่ต้อง reciprocal และ missing/wrong-type target ยังถูกปฏิเสธ Last-good scene ถูก clone แยกจาก object ที่ Excalidraw mutate in place และผูกกับ editor revision ก่อนใช้ recovery ส่วน point shape ที่ยังไม่สมบูรณ์ระหว่าง gesture/point editor ไม่ถูกส่งไป persistence หรือเลื่อน last-good
- teacher file map ที่ข้าม policy/persistence boundary เก็บเฉพาะ file id ที่ image element ทั้งตัวปัจจุบันและ tombstone อ้างถึง จึงรักษาไฟล์สำหรับ undo/redo แต่ตัด file-only transient จาก `addFiles()` และ orphan ที่ไม่มี element อ้างถึง โดยไม่ได้อ้างว่า file map ภายใน Excalidraw ถูกล้าง
- IndexedDB เดิมไม่ถูกเปลี่ยนชื่อ/version/store/key/debounce/TTL ฉากที่ invalid หรือ version/content ไม่รองรับจะไม่เข้า Excalidraw และไม่ถูก blank scene เขียนทับ แม้ผู้ใช้ปิดหน้าก่อน read เสร็จ แต่แสดง safe read-only placeholder และคง raw record ไว้
- การโหลดกระดานครูใช้ operation `pending/load/reset` ที่ผูก question/slot/board, scene ที่พักไว้จับคู่ `{slot, boardId}`, navigation/board-intent/per-question fetch epoch และ latest-result adoption; editor เป้าหมายถือ matching nonce ที่ยังไม่ handle เป็น pending ตั้งแต่ render แรกและปิด edit/save/reset จน response ที่ตรง identity มาถึง จึงไม่มีหนึ่งเฟรมที่ scene เก่าถูกวาดหรือบันทึกใต้ slot ใหม่ การ hide/show ที่ remount จาก parked scene ซึ่ง validate แล้วจะถือ nonce เดิมว่า handle แล้ว จึงไม่ replay load/reset ทับ draft การเปิด load/reset ใหม่หลังผู้ใช้ยืนยันทิ้งงานจะลบ parked scene ของ target เดิมก่อน network เพื่อไม่ให้ load failure คืนเส้นเก่าใต้ board id ใหม่ Normal fetch แชร์ in-flight promise ส่วน save ใช้ immutable full-validated snapshot เดียวกับ preview, รับ board id ที่ server คืนทันที และล้าง dirty เฉพาะเมื่อ API/load/mutation identity ยังตรง
- รูปโจทย์ใหม่ต้องเป็น URL exact ของโจทย์ใน bucket ของระบบ จากนั้น server จำกัดขนาด ตรวจ SVG/raster, rasterize เป็น WebP, ตัด metadata และออก HMAC claim อายุ 24 ชั่วโมงที่ผูก actor/assignment/question/file/MIME/bytes; board v1 ที่มี SVG แบบ self-contained จะถูก rasterize ใน memory ก่อนเข้า editor และย้ายเป็นรูปที่มี claim เมื่อเจ้าของบันทึกครั้งถัดไป สำหรับ board เก่าที่ผสม SVG กับ raster ระบบ full-validate ฉากหลังแปลงก่อน แล้วออก claim ใหม่จาก exact bytes ให้ retained raster ทุกไฟล์และ full-validate ด้วยลายเซ็นจริงอีกครั้ง จึงบันทึกกลับได้โดยไม่ใช้ partial trust ด่าน SVG ปฏิเสธ DOCTYPE/ENTITY declaration และ reference ที่ unknown/malformed, decode เฉพาะ predefined/numeric XML references ก่อน scan แล้วปฏิเสธ script/event/`foreignObject`, `<style>`, inline `style=`, `xml:base`, CSS escape/backslash, stylesheet/import และ external `href`/`url()`; ฉากที่ไม่ผ่านเป็น read-only โดยไม่เขียนทับต้นฉบับ
- prepare action ตรวจและเขียน `scene.json` เองก่อนออก signed token เฉพาะ preview และออก upload receipt ที่เซ็นผูก actor/answer-part/source/include-scene หรือ assignment-question-slot, upload id, preview format และอายุ 2 ชั่วโมง; save action ตรวจ receipt และตรวจไฟล์จริงซ้ำ การปฏิเสธไม่ลบไฟล์ที่ database ยังอ้างอยู่ และ orphan ที่ผู้ใช้ละทิ้งยังอยู่ใต้ cleanup grace 7 วันเดิม
- ทั้ง student attach และ teacher save clone full-validated scene ออกจาก object ที่ Excalidraw mutate in place แล้วใช้ immutable snapshot เดียวกันสร้าง preview และส่งให้ prepare action จึงไม่เกิด preview กับ `scene.json` คนละ revision ระหว่าง async upload
- คง scene envelope v1, private Storage path, artifact uniqueness, 5 teacher slots, authorization/RLS และ lazy-load contract เดิม ไม่มี migration หรือการเปลี่ยน RLS ในเฟสนี้; เพิ่ม direct dependency `sharp` สำหรับ server-only rasterization และขยาย Server Action body limit เป็น 4 MiB โดย scene ยังถูกจำกัดจริงที่ 2 MiB
- **Rollout blocker ที่สืบทอดจาก schema เดิม:** code สร้าง `preview.png` เมื่อ Safari เข้ารหัส WebP ไม่ได้ แต่ tracked CHECK ของ `student_work_artifacts`/`teaching_boards` และ student scope trigger ยังบังคับ `preview.webp`; migration `20260904023417_math_work_png_preview.sql` ขยายเพียง bucket MIME ดังนั้นห้ามอ้างว่า Safari save พร้อมใช้จนสร้าง migration ใหม่ด้วย `supabase migration new` หลังตรวจ `supabase migration list` และแก้ CHECK/trigger ครบ เฟส 1 นี้ไม่ได้ตรวจ live migration state หรือแตะฐานข้อมูล
- automated regression ผ่าน 112 test files / 1,492 tests, type-check และ design-token lint ผ่าน; production build ผ่าน 63 static pages โดย `/assignments/[id]/take` ยังมี 17 initial chunks รวม 804,059 bytes raw / 246,601 bytes gzip (+33/+13 bytes จากเฟส 0) และไม่พบ Excalidraw, mathjs, Supabase browser client, `sharp` package หรือ server-only board code ใน union
- local runtime ที่ `/exam-screen-lab` ตรวจการวาด, literal Thai paste, ลูกศรที่ bind กับรูปทรงพร้อม delete/undo, การบล็อก Save/Open/Print, hidden native entry points, single editor และ viewport 390×844, 768×1024, 1024×768, 1280×800 แล้ว; fixture นี้เป็น student preview จึงยังไม่ใช่หลักฐาน teacher switch 10 รอบ/heap, authenticated Auth/Storage/teacher flow, Safari จริง, stylus หรือ Staging ซึ่งต้องเก็บก่อน merge/deploy

## ผลลัพธ์ของเฟส 2

- เพิ่ม `DrawingBoardController` เป็น command facade กลางใน shared core: toolbar เรียกเฉพาะคำสั่งแบบ typed ส่วน adapter กัก internal action/history contract ของ Excalidraw 0.18.1 ไว้จุดเดียวและตรวจ shape แบบ fail closed ก่อนใช้ native undo/redo, สี, ความหนา และฟอนต์ จึงรักษา selection semantics, text reflow และ history เดิม; `clearHistory()` อัปเดตสถานะปุ่มเองเพราะ public `history.clear()` ไม่ emit event
- กระดาษทดนักเรียนใช้ toolbar ของแอปสองแถวแล้ว แถวหลักมีเลือก/ย้าย, ปากกา, ยางลบทั้งวัตถุ, มือ/เลื่อน, undo, redo, fit และโหมดนิ้ว แถวรองมีไฮไลต์, สี, ความหนาเส้น 1–12 จากแหล่งเดียว, เส้น/ลูกศร/รูปทรง, ข้อความ, แบบ/ขนาดอักษร และพื้นเปล่า/เส้นบรรทัด/ตาราง/จุด; native toolbar/property/bottom bar ถูกซ่อนเฉพาะ student host แต่ยัง mount อยู่เพื่อรักษา action/history contract; ค่าที่แสดงอ่านจาก selection จริงและรายงาน “หลายค่า/หลายขนาด” เมื่อ multi-select ต่างกัน
- `finger_draw`/`finger_pan` อยู่ใน `ExamClient` เป็น route-session state ค่าเริ่มต้น `finger_draw`: ปิด–เปิดหรือเปลี่ยนข้อยังคงค่า แต่ reload กลับค่าเริ่มต้นและไม่เข้า scene/IndexedDB/Storage/server; หนึ่งนิ้วใน draw ทำตาม active tool; หนึ่งนิ้วใน pan ยืม native Space-pan โดยไม่เปลี่ยน active tool; สองนิ้ว pinch/pan ได้ทั้งสองโหมด; mouse และ stylus ทำตาม active tool เสมอ โดย student host normalize technical `penMode=false` หลัง stylus เพื่อไม่ให้นิ้วครั้งถัดไปถูกปิดเงียบ ๆ
- ปุ่ม/สี/slider/select ใช้ touch target 40px และ 44px บน coarse pointer; แถวเลื่อนแนวนอนได้โดยไม่ทำให้ document ล้น ตรวจแล้วที่ 390×844, 768×1024, 1024×768 และ 1280×800; ไม่มี native control ซ้ำที่มองเห็น และมี stroke-width input ของแอปเพียงหนึ่งจุด
- local Chromium ที่เปิด touch emulation จริง (`navigator.maxTouchPoints=2`) ผ่าน one-finger draw, one-finger pan, pinch ในทั้งสองโหมด, stylus แล้วใช้นิ้วเขียนต่อ, mouse, tool persistence, selection-aware color/width/font, mixed selection และ native undo/redo semantic steps รวมทั้ง close/reopen คงโหมด และ reload กลับโหมดเริ่มต้น; การกด Escape ขณะพิมพ์ข้อความออกจาก text editor ก่อน ไม่ปิดกระดาษทดทันที
- regression ผ่าน 113 test files / 1,502 tests, TypeScript, design-token lint และ production build 63 static pages; initial route `/assignments/[id]/take` ยังมี 17 chunks รวม 805,430 bytes raw / 247,011 bytes gzip (+1,371/+410 จากเฟส 1 และต่ำกว่า gate 256,828 gzip) พร้อม scan ไม่พบ Excalidraw, mathjs, Supabase browser client, `sharp` package หรือ server-only board code ใน union
- ไม่มี migration, RLS, Storage path, scene format, IndexedDB contract หรือ teacher toolbar/persistence change ในเฟสนี้; partial eraser, student revision/recovery, teacher presentation/save state และ rollout ยังอยู่เฟส 3–8; PNG/Safari schema debt เดิมยังเป็น blocker แยก
- Excalidraw 0.18.1 บน React 19 dev build ยังเขียน warning ของ library เองเมื่อ pinch (`setState` ซ้อนใน updater) แม้ interaction, automated checks และ production build ผ่าน ส่วน warning `flushSync` ตอนคืน focus หลังปิด editor ถูกตัดด้วยการ defer focus restoration แล้ว เฟส 7 ต้องยืนยัน dependency version/production candidate และ physical browser ก่อนตัด pinch warning ออกจาก hardening gate

## ผลลัพธ์ของเฟส 3

- เพิ่ม state machine นักเรียนครบตามสัญญา: draft แยก `loading`, `empty`, `dirty_local`, `saving_local`, `saved_local`, `save_failed`, `limit_exceeded`, `load_failed`, `unsupported_read_only`; attachment แยก `not_attached`, `attaching`, `attached_current`, `attached_stale`, `attached_unverified`, `attach_failed` และแสดงสถานะภาษาไทยในกระดาษทด
- semantic fingerprint รวมเฉพาะ element ที่มองเห็น, file reference และ background โดยไม่รวม active tool, selection, pan/zoom หรือ volatile element fields; semantic edit เพิ่ม `editRevision` ทันที, autosave สำเร็จจึงเลื่อน `savedRevision`, และ attach สำเร็จเก็บ exact revision/fingerprint ของ snapshot เดียวกับ preview/scene
- ขยาย record เดิมใน IndexedDB ด้วย metadata `revision` แบบ optional โดยไม่เปลี่ยน database `korkru-math-work`, store `scratchpads`, key, `DB_VERSION=1`, debounce 650 ms, pointer-up 120 ms, TTL หรือเพดานเดิม Record รุ่นเก่าที่ยังไม่มี metadata อ่านได้ต่อและรายงาน attachment เป็น `attached_unverified` แทนการเดาว่า current
- edit หลังแนบเปลี่ยนเป็น `attached_stale` ทันทีและคงสถานะหลัง close/reopen/reload; ก่อน submit ระบบอ่านสถานะจาก IndexedDB อีกครั้ง แล้วเตือนพร้อมระบุข้อ/ข้อย่อยที่ stale หรือ unverified และบอกชัดว่า server จะรับฉบับที่แนบไว้ ไม่ใช่เส้นล่าสุดในเครื่อง โดย requirement/authorization ฝั่ง server เดิมยังเป็นผู้ตัดสินสุดท้าย
- การเปิดฉบับแนบมาทับ local draft ที่มีเนื้อหาต่างกันต้องยืนยันก่อน และเขียน one-step recovery กับฉบับใหม่ลง record เดียวกันให้สำเร็จก่อนแทน editor; recovery อยู่ข้าม reload, กู้ได้ครั้งเดียวแล้วเป็น dirty/unsaved, destructive load ครั้งใหม่แทนฉบับก่อน, ผู้ใช้ทิ้งเองได้ และ save/attach ไม่ลบ recovery อัตโนมัติ การอ่าน/ดาวน์โหลด/validate/persist ที่ล้มเหลวคง local draft และ artifact เดิมไว้
- local Chromium ที่ `/exam-screen-lab` ผ่าน attach → edit เป็น stale → ยืนยัน load → recovery → restore ครั้งเดียว → submit warning, รวมกรณี unverified, single editor และ viewport 390×844, 768×1024, 1024×768, 1280×800 โดย document ไม่ล้น; Next dev MCP ไม่มี compilation/runtime issue และ axe ที่ scope กระดาษทดไม่พบ violation หลังแก้ contrast ของ badge ส่วน `.HintViewer` ของ Excalidraw ยังเป็น manual/incomplete contrast check ของ dependency
- regression ผ่าน 114 test files / 1,511 tests, TypeScript, design-token lint และ production build 63 static pages; initial route `/assignments/[id]/take` ยังมี 17 chunks รวม 808,768 bytes raw / 247,723 bytes gzip (+3,338/+712 จากเฟส 2 และต่ำกว่า gate 256,828 gzip) พร้อม scan ไม่พบ Excalidraw, mathjs, Supabase browser client, `sharp` package หรือ server-only board code ใน union
- ไม่มี migration, RLS, Storage path, scene envelope, artifact schema/server authorization หรือ teacher behavior change ในเฟสนี้; preview ยังเก็บ scene ใน memory เท่านั้น และ authenticated Auth/Storage flow, physical Safari/iPad/stylus, teacher hardening/UAT กับ PNG schema debt เดิมยังเป็น rollout gate แยก

## ผลลัพธ์ของเฟส 4

- เพิ่ม partial eraser ใน shared core สำหรับ `freedraw` เท่านั้น จึงใช้ได้ทั้งปากกาและไฮไลต์ ส่วนเส้นตรง ลูกศร รูปทรง ข้อความ รูปภาพ และ Frame ยังปล่อยให้ native eraser ลบทั้งวัตถุตามเดิม
- เรขาคณิตหาช่วงตัดจาก intersection ระหว่างแต่ละ segment ของเส้นกับ swept capsule ของทางลากยางลบโดยตรง ไม่ใช้การสุ่มจุด แล้วสร้าง fragment ที่คงพิกัดของเส้นหมุน, สี, ความหนา, opacity, pressure, group, frame และลำดับ z เดิม; fragment id/version nonce สร้างแบบ deterministic, เศษสั้นกว่าหนึ่งพิกเซลหน้าจอถูกทิ้ง และการแตะที่ครอบทั้งเส้นจะเหลือเฉพาะ tombstone สำหรับ undo
- หนึ่ง pointer gesture สร้าง scene replacement แบบ atomic ก่อน native whole-object erase commit จึงตัด freehand และลบรูปทรงที่โดนในจังหวะเดียวกันได้ด้วย Undo ครั้งเดียว และ Redo คืน fragment id เดิม; runtime Chromium ยืนยัน pen, highlighter และ mixed freehand+rectangle แล้ว
- ก่อนนำ fragment เข้า editor ใช้ full `validateDrawingScene` กับ exact scene/app state/files ทั้งก้อน จึงบังคับ sanitizer, เพดาน 2 MiB และ 10,000 elements เดิมแบบ fail closed; ถ้าผลตัดไม่ผ่านจะไม่แก้ฉากบางส่วน และไม่เปลี่ยน scene envelope, IndexedDB, Storage หรือ server persistence contract
- regression ผ่าน 115 test files / 1,521 tests, TypeScript, design-token lint และ production build 63 static pages; initial route `/assignments/[id]/take` ยังมี 17 chunks รวม 808,768 bytes raw / 247,726 bytes gzip (+0/+3 จากเฟส 3 และต่ำกว่า gate 256,828 gzip) พร้อม scan ไม่พบ Excalidraw, mathjs, Supabase browser client, `sharp` package, partial-eraser module หรือ server-only board code ใน initial union
- local Chromium ที่ `/exam-screen-lab` ผ่าน partial cut, highlighter style preservation, mixed whole-object erase, one-step undo/redo และ viewport 390×844, 768×1024, 1024×768, 1280×800 โดย document ไม่ล้นและ toolbar เลื่อนไปถึงคำสั่งท้ายแถวได้; Next dev MCP และ browser console ไม่มี compilation/runtime error แต่ physical Safari/iPad/stylus, authenticated flow และ teacher hardening/UAT ยังเป็น rollout gate

## ผลลัพธ์ของเฟส 5

- กระดานสอนซ่อน native toolbar/property/bottom bar แล้วใช้ app-owned toolbar ที่ประกอบจาก command facade และ primitives เดียวกับนักเรียน: แถวหลักมี select/pen/eraser/hand/undo/redo/fit/input mode พร้อม laser และ presentation lock; แถวรองมี Frame ก่อน highlighter, style, shape, text, font และพื้น; แถวพรีเซนต์มี quick colors, grid/snap และ duplicate-next-step ส่วน trusted question-image command เดิมยังรับได้เฉพาะรูปของโจทย์ปัจจุบันผ่าน server
- presentation lock เป็น state ใน session เท่านั้นและส่ง Excalidraw เข้า effective view mode จึงปิด pointer/keyboard/controller command ที่แก้ content จริง ขณะที่ laser, hand/pan, fit/zoom, การเปลี่ยนข้อและเปิด/ปิดเฉลยยังทำงาน; ปลดได้จากปุ่มของแอปเท่านั้นและไม่แตะ dirty/scene/file/native lock
- quick colors ใช้ Toggle Group ของ design system มีห้าสีเข้มที่อ่านชัดบนกระดาษและประกาศสีที่เลือกให้ assistive technology การเปลี่ยน active color โดยไม่มี selection ไม่ทำให้ dirty แต่ native selection action เดิมยังทำ style edit/undo ตาม semantic; grid กับ object snap ค่าเริ่มต้นปิด เก็บเฉพาะ host session และถูกตัดจาก stable app state/persistence พร้อมใช้ `CaptureUpdateAction.NEVER`
- duplicate-next-step ส่ง immutable full scene ไปยัง authorized Server Action เพื่อ validate actor/assignment/question และ provenance ก่อนสร้างสำเนาใน memory; สำเนาตัด deleted tombstone, ออก element/group/file id ใหม่, remap Frame/container/binding/bound-element/file relation และออก claim ใหม่ให้ exact image bytes เพราะ claim เดิมผูก file id จากนั้น editor remount เพื่อเริ่ม history ว่างและ parent ถอด `{boardId}` ออกจากต้นฉบับโดยไม่ upload/เขียนฐานข้อมูล เมื่อกดบันทึกจึงเลือกช่องว่างถัดไป หรือแสดง exact victim chooser ครบห้าช่องตาม flow เดิม; cancel คง draft
- regression ผ่าน 116 test files / 1,522 tests, TypeScript, design-token lint และ production build 63 static pages; initial route `/assignments/[id]/take` ยังมี 17 chunks รวม 809,138 bytes raw / 247,984 bytes gzip (+370/+258 จากเฟส 4 และต่ำกว่า gate 256,828 gzip) พร้อม scan ไม่พบ Excalidraw, mathjs, Supabase browser client, duplicate module/action หรือ server-only board code ใน initial union (`\\sharp` ที่พบเป็นสัญลักษณ์ LaTeX ใน KaTeX ไม่ใช่ package `sharp`)
- local Chromium ใช้ temporary teacher fixture ที่ mount `TeachingBoardEditor` จริงผ่าน dynamic client boundary ยืนยันทุกคำสั่งใน accessibility tree, lock แล้ว content commands ปิดแต่ laser/hand/fit ยังเปิดและ active laser ไม่ทำให้ dirty, grid/snap/quick-color แบบไม่มี selection ไม่ทำให้ dirty, มี `.excalidraw` เดียว และ viewport 390×844, 768×1024, 1024×768, 1280×800 ไม่ล้นแนวนอน; หลังลบ fixture Next MCP รายงาน compile route จริงว่างและ browser session ไม่มี config/runtime error ทั้งนี้ยังไม่ใช่หลักฐาน authenticated duplicate/save/claim renewal กับ Supabase จริงหรือ physical browser UAT
- ไม่มี migration, RLS, Storage path, scene envelope, IndexedDB หรือ saved-board schema change ในเฟสนี้; session-only Library ยังไม่รวมใน commit นี้และยังอยู่ในขอบเขตงานหลัง presentation tools โดยต้องรักษา sanitizer/no-persistence contract เดิม

## ผลลัพธ์ของเฟส 6

- เพิ่ม state machine ครูครบตามสัญญา (`new_draft`, `unsaved_new`, `loading_slot`, `saved_slot`, `unsaved_changes`, `saving`, `save_failed`, `load_failed`, `read_only_slot`, `unsupported_read_only`) และเก็บ scene/state/dirty ต่อ exact `{questionId, slot, boardId}`; pan/zoom/tool selection ไม่เพิ่ม dirty และการเปลี่ยนข้อหรือซ่อนกระดานเพียงพัก record เดิม
- load ช่องใหม่ใช้ pending identity แยกจาก committed identity และจะย้าย scene/slot/board id พร้อมกันหลัง response + validation ที่ nonce/question/target ตรงเท่านั้น; failure กลับสู่ committed target เดิม ส่วน save ใช้ board id จาก Server Action ทันทีและไม่ย้อนเป็น unsaved แม้ refetch รายการล้มเหลว Lifecycle helper เพิ่ม `idle` และถือ operation ของคำถามทั้งข้อเป็น pending เพื่อปิดช่องที่ scene เก่าจะแก้ได้ระหว่างโหลดอีก slot
- reset, เปิด slot อื่น, ลบ/แทน draft ที่กำลังเปิด และ duplicate ที่ detach identity ใช้ destructive guard ตามงานที่สูญหายจริง; ก่อนแทนที่เก็บ snapshot แยก object เป็น one-step recovery ใน memory, restore ได้ครั้งเดียวด้วย dirty draft/history ว่าง, destructive action ใหม่แทนของเก่า, ผู้ใช้ล้างเองได้ และออก route แล้วหมดอายุ
- ป้ายหัวรวมจำนวน draft ที่ยังไม่บันทึกทุกข้อ, ป้าย slot บอกงานค้างของแต่ละช่อง และการออกผ่านปุ่มกลับหรือลิงก์ same-window/same-origin ใน app shell ใช้ dialog รายการเดียวกันที่ไล่ทุก draft; reload/ปิดแท็บยังมี `beforeunload` ส่วนลิงก์ดาวน์โหลด, external และเปิดแท็บใหม่ไม่ถูกดัก
- regression ผ่าน 117 test files / 1,529 tests, TypeScript, design-token lint และ production build 63 static pages; initial route `/assignments/[id]/take` ยังมี 17 chunks รวม 809,138 bytes raw / 247,982 bytes gzip (+0/-2 จากเฟส 5 และต่ำกว่า gate 256,828 gzip) พร้อม scan ไม่พบ Excalidraw, mathjs, Supabase browser client, draft-state module, teacher editor หรือ server-only board code ใน initial union
- local Chromium ใช้ temporary fixture ที่ mount `TeachingModeClient` และ editor จริง ยืนยัน hide/show คง draft, เปลี่ยนช่องถามก่อนทิ้ง, recovery คืนได้ครั้งเดียว, app-back และ app-link guard แสดง exact “ข้อ 1 · ช่อง 1”, มี `.excalidraw` เดียว และ viewport 390×844, 768×1024, 1024×768, 1280×800 ไม่ล้นแนวนอน; Next MCP ไม่มี compilation issue แต่ accessibility scan ยังพบ `aria-orientation` บน quick-color toggle group กับ contrast hint ภายใน Excalidraw และ dev session ยังมี script-tag/Excalidraw module-evaluation warning เดิม จึงยกไป hardening เฟส 7 ไม่อ้างว่า runtime สะอาดทั้งหมด
- ไม่มี migration, RLS, Storage path, scene envelope, IndexedDB หรือ saved-board schema change ในเฟสนี้; fixture ไม่มี Supabase จริง จึงยังไม่ยืนยัน authenticated saved-board load/save/delete/claim renewal หรือ physical browser UAT

## ผลลัพธ์ของเฟส 7

- เพิ่ม compatibility manifest ของ scene v1 ที่เป็น static fixture ครบฉากว่าง, freehand/highlighter, ข้อความไทย/อังกฤษ, line/shape, พื้นทั้งสี่แบบ, deleted tombstone และ teacher question image; test บังคับ coverage tag, exact JSON round-trip, fail closed ต่อ version/field ที่ไม่รู้จัก และผูก fixture รูปกับ claim decision เดิม โดย test claim/legacy แยกยังครอบ actor/assignment/question/file/MIME/bytes, expiry, tamper และ exact legacy bytes/id
- เพิ่ม Library ของแอปเฉพาะครูเป็น route-session memory จำกัด 12 รายการ, รายการละไม่เกิน 100 elements/256 KiB และรับเฉพาะ rectangle/diamond/ellipse/arrow/line/freedraw/text ที่เลือกจากกระดานปัจจุบัน; sanitizer ตัด group/frame/binding/link/custom data/lock/file/app state, normalize ตำแหน่ง, ตรวจด้วย student-safe scene validator ก่อนเก็บและก่อนวาง แล้วออก element id/seed/version nonce ใหม่ทุกครั้ง รูป/Frame/embeddable หรือ item ที่ถูกแก้ภายหลังถูกปฏิเสธทั้งรายการ ไม่มี localStorage, IndexedDB, server, Storage หรือ Public Library และ local Chromium ยืนยันว่าคงอยู่ตลอด 10 รอบ hide/show แต่ล้างเมื่อ teaching route unmount
- แยก pure decision ของ paste/copy/cut/drop/dragover/context menu ออกเป็น testable policy matrix: generic file/serialized Excalidraw/scene paste ปิดทั้งหมด, literal text ผ่านเฉพาะ active text editor หรือ canvas ที่เลือก text tool และ read-only/presentation lock ปิดก่อน insert ทุกครั้ง Runtime browser dispatch ยืนยัน keyboard `F`/`Q`/Save, paste ทั้งสามแบบ, copy/cut, drop/dragover และ context menu ถูก `preventDefault` ตาม policy
- ปิด accessibility debt จากเฟส 6 โดยไม่ส่ง `aria-orientation` ให้ Base UI group ที่มี `role="group"` แต่ยังคง `data-orientation`/arrow-key behavior และซ่อน Excalidraw HintViewer ภาษาอังกฤษเมื่อใช้ app-owned toolbar; axe-core 4.12.1 ที่ WCAG 2 A/AA รายงาน 0 violations / 0 incomplete และ accessibility tree มีชื่อภาษาไทยให้ Library/toolbar controls ครบ
- ย้าย `exportToCanvas` ไป dynamic import เฉพาะตอนสร้าง preview จึงไม่ evaluate browser-only Excalidraw module ระหว่าง server render; permanent `/exam-screen-lab/drawing-board` ใช้ `TeachingModeClient` จริงและเปิดเฉพาะ local/Staging ตาม lab gate (Production เป็น 404) เพื่อเก็บหลักฐานซ้ำได้ Next MCP รายงาน compilation/config/session errors ว่าง และ console ไม่มี `window is not defined`, script-tag หรือ runtime error ที่เฟส 6 บันทึกไว้
- local Chromium ผ่าน viewport 390×844, 768×1024, 1024×768 และ 1280×800 โดย document ไม่ล้น แถบคำสั่งที่ยาวเป็น `overflow-x: auto`; มี `.excalidraw` สูงสุดหนึ่ง instance ตลอด 10 รอบ hide/show, Library ยังอยู่ครบ และ warm-profile median heap รอบ 6–10 สูงกว่ารอบ 1–5 อยู่ 13.71% ต่ำกว่า gate 20% (Chrome session ไม่ expose forced GC)
- regression ผ่าน 119 test files / 1,562 tests, TypeScript, design-token lint และ production build 63 static pages; initial route `/assignments/[id]/take` ยังมี 17 chunks รวม 809,105 bytes raw / 248,228 bytes gzip (-33/+246 จากเฟส 6 และต่ำกว่า gate 256,828 gzip) พร้อม scan ไม่พบ Excalidraw, mathjs, Supabase browser client, session Library, teacher editor หรือ server-only board code ใน union (`\\sharp` ที่พบยังเป็นสัญลักษณ์ KaTeX)
- security review ไม่พบการขยาย auth/RLS/Storage หรือข้อมูลนักเรียนใหม่; Library revalidate ทั้ง ingress/insert และ event boundary fail closed ส่วน `npm audit --omit=dev` ยังเท่ากับ baseline 54 รายการ (low 3, moderate 40, high 11) เพราะ lockfile ไม่เปลี่ยน รายการ TipTap/Excalidraw/transitive ที่มีอยู่ยังต้องแก้ใน dependency work แยก ห้ามใช้ forced fix เพื่อให้เฟสนี้ดูผ่าน
- ไม่มี migration, RLS, Storage path, scene envelope, IndexedDB หรือ saved-board schema change ในเฟสนี้ และไม่ได้เรียก Supabase; authenticated Supabase flow, physical Safari/iPad/stylus กับ pinch warning บนอุปกรณ์จริง และ PNG schema debt ยังรอเฟส 8

## ขอบเขตผลิตภัณฑ์ที่อนุมัติแล้ว

### หลักร่วม

- ใช้ drawing core, command layer, scene validation และ toolbar primitives ชุดเดียวกัน แต่ policy และ persistence adapter ของนักเรียนกับครูแยกกันชัดเจน
- เครื่องมือที่เลือกต้องค้างจนผู้ใช้เปลี่ยนเอง แอปเป็นเจ้าของกติกานี้และซ่อน native lock ของ Excalidraw
- mouse, touch และ stylus ต้องใช้ Pointer Events เดียวกัน แต่ UI ต้องให้เลือกชัดว่า “นิ้วเขียน” หรือ “นิ้วเลื่อน” ห้ามเปลี่ยนโหมดเงียบ ๆ หลังพบ stylus; สัญญา pointer ที่แน่นอนอยู่ในหัวข้อ input mode ด้านล่าง
- ไม่มีการอัปโหลดไฟล์ทั่วไปเข้า canvas ไม่มี realtime collaboration, cloud save ต่อ stroke, multipage canvas, layers, AI, OCR หรือ handwriting recognition ในชุดนี้
- hold-to-shape ไม่รวมในชุดแรก ให้ทำเป็นงานแยกหลัง partial eraser และ input mode ผ่าน UAT แล้ว

### นักเรียน

- แถวหลัก: เลือก/ย้าย, ปากกา, ยางลบ (ตัด freehand/highlighter และลบ element อื่นทั้งวัตถุ), มือ/เลื่อน, undo, redo และพอดีจอ
- แถวรอง: สี, แหล่งปรับขนาดเส้นเพียงจุดเดียว, รูปทรง/เส้น, ข้อความ/แบบอักษร และพื้นเปล่า/เส้นบรรทัด/ตาราง/จุด
- partial eraser รุ่นแรกตัดได้เฉพาะเส้น freehand และ highlighter; เส้นตรง รูปทรง ข้อความ และรูปภาพยังลบทั้งวัตถุ
- ไม่ให้ใช้ Frame, Web Embed, Mermaid, Library, laser หรือ native lock
- ไม่มีปุ่มอัปโหลดรูปเข้า canvas; รูปจากกล้อง/เครื่องยังเข้าทาง `submission_answers.work_images` เดิม ส่วนภาพที่ render จากกระดาษทดเข้าทาง `student_work_artifacts` หลังผู้ใช้กดแนบ ไม่มีทางใดนำรูปนั้นกลับเข้า canvas เป็น element

### ครู

- ใช้แกนเดียวกับนักเรียน และเพิ่ม laser, Frame ในแถวรอง, รูปของโจทย์ปัจจุบัน, สีด่วน, presentation lock, grid/snap แบบเลือกเปิด และ “ทำสำเนาเป็นขั้นถัดไป”
- แสดงสถานะ draft/save/load ที่ผูกกับโจทย์และ slot จริง ไม่อนุมานจากข้อความหรือผล refetch อย่างเดียว
- ไม่ให้ใช้ Web Embed, Mermaid, Public Library, native lock หรือการอัปโหลดไฟล์ทั่วไป; session-only Library ของแอปใช้ได้เฉพาะ vector/text item ที่สร้างจากกระดานของครูและผ่าน sanitizer ไม่เขียน localStorage/IndexedDB/server และล้างเมื่อ teaching route unmount
- รูปโจทย์เป็น trusted programmatic ingress เท่านั้น ต้องผ่านการย่อ ขีดจำกัด scene และการตรวจชนิดเดิม

## Capability matrix

คำว่า “ปัจจุบัน” ในสองคอลัมน์แรกหมายถึง deployed baseline ที่ตรวจในเฟส 0 ไม่ใช่โค้ดบน branch เฟส 1–4 ที่ยังไม่ merge/deploy

| ความสามารถ | นักเรียนปัจจุบัน | ครูปัจจุบัน | เป้าหมายนักเรียน | เป้าหมายครู |
| --- | --- | --- | --- | --- |
| เลือก/ย้าย วาด เส้น รูปทรง ข้อความ | มีผ่าน native Excalidraw | มีผ่าน native Excalidraw | มี จัดกลุ่มหลัก/รองตามงาน | มี ใช้ primitive ชุดเดียวกัน |
| ยางลบทั้งวัตถุ | มี | มี | มีในแถวหลัก | มีในแถวหลัก |
| partial eraser | ไม่มี | ไม่มี | freehand/highlighter เท่านั้น | freehand/highlighter เท่านั้น |
| มือ/pan, undo/redo | มีผ่าน native UI | มีผ่าน native UI | อยู่แถวหลักและมี label ไทย | อยู่แถวหลักและมี label ไทย |
| พอดีจอ | มีได้ผ่านคีย์ลัด native | มีปุ่มของแอป | มีปุ่มชัดเจน | มีปุ่มชัดเจน |
| สีและขนาดเส้น | app preset/slider ซ้ำกับ native property controls | app preset/slider ซ้ำกับ native property controls | มีแหล่งขนาดเส้นเดียว | มีแหล่งขนาดเส้นเดียว + สีด่วน |
| พื้นกระดาษ 4 แบบ | มี | มี | มีในแถวรอง | มีในแถวรอง |
| นิ้วเขียน/นิ้วเลื่อน | เป็นพฤติกรรมโดยนัย และ `penMode` เปลี่ยนได้หลังพบ stylus | เป็นพฤติกรรมโดยนัย | ผู้ใช้เลือกเองและเห็นสถานะ | ผู้ใช้เลือกเองและเห็นสถานะ |
| เครื่องมือค้างหลังวาด | ตั้ง `activeTool.locked` แต่ native lock/Q ยังปิดได้ | เหมือนนักเรียน | บังคับโดย app; ซ่อน/บล็อก native lock | บังคับโดย app; ซ่อน/บล็อก native lock |
| Frame | เข้าถึงได้จาก More tools/คีย์ลัด | เข้าถึงได้จาก More tools/คีย์ลัด | ห้าม | มีในแถวรอง |
| laser | เข้าถึงได้จาก More tools/คีย์ลัด | เข้าถึงได้จาก More tools/คีย์ลัด | ห้าม | มี |
| Web Embed/Mermaid | ยังเข้าถึงได้หลายทาง | ยังเข้าถึงได้หลายทาง | ห้าม | ห้าม |
| Library | default sidebar/Add to Library ยังเข้าถึงได้ | default sidebar/Add to Library ยังเข้าถึงได้ | ห้ามทั้งชุด | อนุญาต session-only vector/text item ใน memory; ห้าม Public Library, persistence และ import |
| รูปโจทย์ปัจจุบัน | ไม่มี | มี trusted insert จากโจทย์ | ไม่มี | มีและคง contract เดิม |
| grid/snap | native context/app state ยังเข้าถึงได้ | native context/app state ยังเข้าถึงได้ | ไม่เปิดในรุ่นแรก | เลือกเปิดได้จาก UI ของแอป |
| สถานะ draft/attachment | มี loading/saving/saved/error แต่ยังไม่ผูก revision | มี new/unsaved/saved/read-only แต่มี race กับ load/refetch | ใช้ state machine และ revision | ใช้ state machine ต่อโจทย์/slot |

## ขอบเขตสถาปัตยกรรมเป้าหมาย

โครงสร้างต่อไปนี้เป็น boundary ที่ต้องรักษา ไม่ได้บังคับชื่อไฟล์หรือชื่อ type ล่วงหน้า:

```text
Student host ─┐
              ├─ Drawing core ─ Command policy ─ Scene validator
Teacher host ─┘        │                │                 │
                       ├─ Toolbar primitives             │
                       ├─ Pointer/input modes            │
                       └─ Excalidraw adapter ────────────┘

Student persistence: IndexedDB draft ── explicit attach ── private Storage/artifact
Teacher persistence: per-question memory draft ── explicit save ── private Storage/board slot
```

- Drawing core ไม่รู้ user, submission, answer, assignment, question, slot หรือ Supabase
- Host เป็นผู้ประกอบ policy, label, permission, persistence และ lifecycle ของตน
- Excalidraw adapter เป็นจุดเดียวที่แปลง command ของแอปไปเป็น API ของไลบรารี เพื่อไม่ให้ host สองฝั่งใช้ shortcut หรือ app state คนละความหมาย
- Scene validator ตรวจทั้ง envelope และ content policy ก่อนเข้า editor และก่อน persist; server validation ของ artifact/board เดิมยังเป็นด่านสุดท้าย
- เปิด Excalidraw จริงเพียงหนึ่ง instance ต่อหน้าครูเหมือนปัจจุบัน เพื่อไม่เพิ่ม memory pressure บนแท็บเล็ต

## Policy ต้องครอบคลุมทุกทางเข้า

การซ่อนปุ่มหรือกำหนด `UIOptions` อย่างเดียวไม่ถือว่าผ่าน เพราะ Excalidraw 0.18.1 จำกัดการปิด tool รายตัว และ `aiEnabled={false}` ไม่ได้ปิด Mermaid

แต่ละ role ต้องใช้ allowlist เดียวกันกับทุกทางต่อไปนี้:

1. toolbar ของแอปและ toolbar/property controls ของ Excalidraw
2. keyboard shortcuts เช่น `F`, `K`, `Q`, clear canvas, export และ help
3. More tools, context menu, long press และ Library sidebar
4. paste ทั้งข้อความ รูป Mermaid และ serialized Excalidraw
5. drag/drop ของ `.excalidraw`, `.excalidrawlib`, รูป และไฟล์ทั่วไป
6. scene ที่โหลดจาก IndexedDB, private Storage หรือค่าที่ส่งให้ editor จาก host
7. scene ก่อน autosave, attach หรือ save board

### Command allowlist

| command/ทางเข้า | นักเรียน | ครู | กติกา |
| --- | --- | --- | --- |
| เลือก ย้าย resize rotate และเปลี่ยน style ของ element ที่อนุญาต | อนุญาต | อนุญาต | การเปลี่ยน content/style เป็น semantic edit |
| ลบ selection, whole-object erase, undo/redo | อนุญาต | อนุญาต | หนึ่ง gesture เป็นหนึ่ง history step |
| pan, zoom, fit, selection และเปลี่ยน active tool | อนุญาต | อนุญาต | ไม่ทำให้ dirty |
| plain-text paste | อนุญาตใน text editor หรือเมื่อ text tool active | เหมือนนักเรียน | รับเป็น literal text เท่านั้น ห้ามเสนอ/แปลง Mermaid |
| copy/cut/paste/duplicate serialized elements | ห้าม native/OS path | ห้าม native/OS path | ป้องกัน scene/file/link ที่มาจากภายนอก; duplicate-next-step ของครูเป็น app command แยก |
| group/ungroup, align/distribute, change order | ห้ามในชุดแรก | ห้ามในชุดแรก | ไม่อยู่ใน toolbar contract; เพิ่มภายหลังต้องแก้ matrix และ test ทุก entry path |
| hyperlink/embeddable | ห้าม | ห้าม | รวม shortcut, context menu และ pasted link metadata |
| clear canvas | ห้าม native shortcut/menu | ใช้ปุ่ม reset ของแอปหลัง confirm/recovery เท่านั้น | native clear ต้องถูก intercept |
| export/help/native menu | ห้าม | ห้าม | product help/export ถ้ามีภายหลังต้องเป็น app-owned flow |
| Frame/laser | ห้าม | อนุญาตผ่าน app command | Frame เป็น semantic; laser ไม่เป็น semantic |
| grid/snap | ห้าม | อนุญาตผ่าน app toggle | เป็น session app state ไม่ทำให้ dirty |
| Library | ห้าม | session-only app memory สำหรับ vector/text ที่ sanitize แล้ว | ห้าม image/file/link, persistence, Public Library, `.excalidrawlib`, browse/install และ external library MIME |
| generic image/scene/file paste หรือ drop | ห้าม | ห้าม | ครูใช้ trusted question-image command เท่านั้น |
| native lock/shortcut `Q` | ห้าม | ห้าม | app ตั้ง tool lock และไม่เปิดให้ผู้ใช้ปลด |

กติกา fail-closed:

- command ที่ไม่อยู่ใน allowlist ต้องไม่มีผลข้างเคียงใด ๆ แม้เรียกผ่าน shortcut หรือ native UI: ไม่เปิด dialog/sidebar/link, ไม่ export/import, ไม่เรียก network และไม่เปลี่ยน scene หรือ app state
- student/teacher ห้าม import scene/library จากภายนอก และห้าม paste/drop รูปทั่วไป; plain-text paste ทำงานได้เฉพาะเมื่อ text tool active หรือกำลังแก้ text และต้องไม่ถูกแปลงเป็น Mermaid
- trusted question-image insert ของครูต้องใช้ command เฉพาะ ไม่เปิดช่อง file picker หรือ generic image paste
- scene เดิมที่มีข้อมูลไม่รองรับต้องไม่ถูกล้างหรือบันทึกทับเงียบ ๆ ให้เก็บ raw เดิม แสดงสถานะกู้คืน/อ่านอย่างเดียว และมีเส้นทางย้อนกลับหนึ่งขั้นจนกว่าจะมี migration ที่พิสูจน์ด้วย fixture
- raw scene ที่มี Web Embed, Mermaid, link/file/image ที่ role ไม่อนุญาต หรือ version ที่ไม่รองรับ ห้ามส่งเข้า Excalidraw/DOM ห้าม fetch URL และห้าม render iframe/image จาก raw นั้น UI แสดง metadata กับ safe placeholder ที่สร้างจากข้อมูล allowlist เท่านั้น และเก็บ raw ไว้ใน persistence owner เดิมเพื่อ recovery/migration
- sanitizer ห้ามเพียงตัด element ต้องห้ามแล้วรายงานว่าโหลดสำเร็จ เพราะทำให้ข้อมูลผู้ใช้หายโดยไม่รู้ตัว
- content allowlist ต้องเป็น pure shared validator ที่รันซ้ำฝั่ง Server Action ก่อนออก upload token/สร้างหรือแทน reference ของ student artifact และก่อนสร้าง/แทน teacher board การเรียก action ตรงด้วย scene ที่มี element, file หรือ link ต้องห้ามต้องถูกปฏิเสธโดยไม่เขียน database และไม่ลบ artifact/board ฉบับล่าสุดที่ดีอยู่แล้ว
- teacher validator อนุญาต image element เฉพาะ metadata/file relation ที่มาจาก trusted question-image flow และผ่าน MIME, size, data URL และ scene limit เดิม ห้ามยอมรับ generic image เพียงเพราะ client อ้างว่า trusted
- question-image provenance ต้องตรวจได้ฝั่ง server: token/claim ผูก actor + assignment + question + source image และหมดอายุ; claim จากอีกข้อ/งาน/ผู้ใช้หรือ arbitrary data URL ต้องถูกปฏิเสธ สำหรับ board v1 เดิมที่ไม่มี claim อนุญาตให้ re-save ได้เฉพาะ image hash/file relation ที่ตรงกับฉบับล่าสุดของ board เดิมโดยไม่เปลี่ยน payload รูป รูปใหม่ทุกชิ้นต้องมี claim ปัจจุบัน และ rejection ต้องคง board ฉบับล่าสุดไว้

## สัญญา input mode

- ค่าเริ่มต้นเมื่อเปิด editor route/session ใหม่คือ `finger_draw`; การเลือก `finger_draw`/`finger_pan` อยู่เฉพาะ route session แยกตาม role ไม่เข้า scene, IndexedDB, Storage หรือ server และ reload เริ่มที่ค่าเริ่มต้นอีกครั้ง
- toggle มีผลเฉพาะ `pointerType="touch"` หนึ่งนิ้ว: `finger_draw` ให้ทำตาม active tool ส่วน `finger_pan` บังคับ pan โดยไม่เปลี่ยน active tool สองนิ้วยังคง pinch-zoom/pan ในทั้งสองโหมด
- stylus ทำตาม active tool เสมอโดยไม่สน finger mode และการพบ/ยก stylus ต้องไม่เปลี่ยน toggle; mouse ทำตาม active tool ปุ่มหลัก ส่วน middle button หรือกด space ค้างใช้ pan ตามมาตรฐานเดิม
- สถานะต้องมองเห็นและอ่านได้ด้วย screen reader การเปลี่ยนโหมดไม่ทำให้ dirty และ close/reopen ภายใน route session เดิมต้องคงค่าที่ผู้ใช้เลือก

## สัญญาของ partial eraser รุ่นแรก

- ตัดเฉพาะ `freedraw` ที่มาจากปากกาหรือ highlighter และรักษาสี ความหนา ความโปร่งใส กลุ่ม และลำดับซ้อนของชิ้นที่เหลือ
- เส้นตรง ลูกศร รูปทรง ข้อความ รูปภาพ และ frame ของครูใช้ whole-object erase
- หนึ่ง gesture ของยางลบเท่ากับหนึ่ง undo step; redo ต้องคืนผลเดิมแบบ deterministic
- การแตะเส้นโดยไม่เกิดส่วนที่เหลือให้ลบวัตถุนั้นได้ แต่ห้ามสร้างชิ้นส่วนจิ๋วที่มองไม่เห็นหรือทำให้ scene เกินขีดจำกัด
- scene หลังตัดต้องผ่าน sanitizer และเพดานเดิม 2 MiB/10,000 elements ก่อน autosave หรือ save

## สัญญาของเครื่องมือเฉพาะครู

- **Presentation lock** เป็น session state ที่ไม่ persist และไม่ทำให้ dirty เมื่อเปิดจะปิด command ที่แก้ content ทั้งหมด แต่ยังให้ใช้ laser, hand/pan, zoom/fit, เปลี่ยนข้อ และแสดง/ซ่อนเฉลยได้ การปลดต้องกดปุ่มของแอปโดยตรง ไม่ใช้ native lock หรือ shortcut
- **Quick colors** เป็น swatch ที่แอปควบคุมและบอกสีที่เลือกชัดเจน การเปลี่ยนสีของ active tool อย่างเดียวไม่ทำให้ dirty แต่การใช้สีกับ selection ที่มีอยู่เป็น semantic edit สีจริงต้องมาจากชุดที่ผ่าน contrast review ในเฟส 5 ไม่ hardcode raw Tailwind palette
- **Grid/snap** ปิดเป็นค่าเริ่มต้นและอยู่เฉพาะ session; grid display, object snap และการเปลี่ยนค่าไม่ทำให้ dirty หรือเข้า scene envelope การเปิดต้องไม่เปิด native context menu อื่นตามมา
- **Duplicate next step** clone semantic scene/background ปัจจุบันเป็น `unsaved_new` ของโจทย์เดิม ไม่เขียน server และไม่เปลี่ยน source board ใช้ element/file IDs ชุดใหม่โดยรักษา binding/file relation ภายในให้ครบ และเริ่ม undo history ว่างเพื่อให้ undo แรกย้อนเฉพาะ edit หลัง clone
- เมื่อบันทึก duplicate next step ให้ใช้ช่องว่างถัดไปตามกติกาปัจจุบัน ถ้าครบ 5 slots ต้องแสดงทั้ง 5 ช่องให้ครูเลือก victim แบบ exact; cancel ต้องคง draft และห้ามแทนช่องที่เก่าที่สุดหรือช่องใดเอง
- **Frame** เป็น semantic content และบันทึกได้เฉพาะครู; **laser** เป็น transient presentation state ห้ามเข้า scene, draft revision หรือไฟล์ที่บันทึก

## State model ที่ล็อกแล้ว

สถานะ content ใช้ semantic revision หรือ semantic fingerprint ที่รวม element ที่มองเห็น, file reference และ background แต่ไม่รวม active tool, selection, pan หรือ zoom

### นักเรียน

`StudentDraftState`

- `loading`
- `empty`
- `dirty_local`
- `saving_local`
- `saved_local`
- `save_failed`
- `limit_exceeded`
- `load_failed`
- `unsupported_read_only`

`StudentAttachmentState`

- `not_attached`
- `attaching`
- `attached_current`
- `attached_stale`
- `attached_unverified`
- `attach_failed`

กติกานักเรียน:

- semantic edit เพิ่ม `editRevision` ทันที; autosave สำเร็จจึงเลื่อน `savedRevision`
- attachment สำเร็จบันทึก `attachedRevision`; เมื่อ `editRevision` สูงกว่าให้แสดง `attached_stale` และเตือนก่อนส่ง
- save/attach ล้มเหลวห้ามล้าง local scene หรือ artifact รุ่นก่อน
- เปิด scene ที่แนบมาทับ local draft ที่ต่างกันต้องยืนยัน และเก็บ one-step recovery ก่อนแทนที่
- scene เสียหรือ version ไม่รองรับต้องไม่กลายเป็นกระดาษเปล่าเงียบ ๆ

### ครู

`TeacherQuestionDraftState`

- `new_draft`
- `unsaved_new`
- `loading_slot`
- `saved_slot`
- `unsaved_changes`
- `saving`
- `save_failed`
- `load_failed`
- `read_only_slot`
- `unsupported_read_only`

### Recovery ที่ใช้ร่วมกัน

`OneStepRecoveryState`

- `none`
- `available_once`
- `restored`

- นักเรียนสร้าง recovery ก่อนเปิด attached scene ทับ local draft ที่มี semantic fingerprint ต่างกัน; recovery อยู่ใน scope IndexedDB เดิมและอยู่ได้ถึง reload บนอุปกรณ์เดิม โดยถูก purge ตาม submit/TTL เดิม
- ครูสร้าง recovery ก่อน reset, โหลด slot อื่นทับ draft หรือการลบ/แทน draft ที่กำลังเปิด; recovery อยู่ใน memory ของ teaching route เท่านั้น การออกจาก route จึงต้อง confirm ทุก draft ก่อน
- recovery เก็บ semantic scene ก่อน action, background และ identity เดิม แต่ไม่เก็บ undo history; การ restore ใช้ได้ครั้งเดียวและตั้ง draft เป็น dirty/unsaved
- destructive action ครั้งใหม่แทน recovery ฉบับก่อน ผู้ใช้กดทิ้ง recovery เองได้ และ save/attach ไม่ลบ recovery อัตโนมัติ; student submit/TTL purge หรือ teacher route unmount เป็นจุดจบตาม persistence ownership

### กติกาครู

- state แยกต่อ question และ slot; การ pan/zoom/เปลี่ยนเครื่องมือไม่ทำให้ dirty
- เปลี่ยนข้อหรือซ่อนกระดานเพียงพัก draft ไม่ถามยืนยัน เพราะไม่มีข้อมูลถูกทิ้ง
- reset, โหลด slot อื่น, ลบ slot ที่กำลังแก้ และออกจากโหมดสอนต้องตรวจ draft ที่จะสูญหายจริง; การออกต้องตรวจทุกข้อ ไม่ใช่เฉพาะข้อที่เปิด
- load ล้มเหลวต้องคง scene, selection และ draft เดิมไว้ ห้ามให้ identity ใหม่ชี้ฉากเก่า
- save success ใช้ board identity ที่ Server Action ส่งกลับเป็นหลัก; refetch ล้มเหลวต้องไม่ย้อน label เป็น “ยังไม่บันทึก”
- read-only board ไม่สร้าง dirty state และไม่มี command ที่แก้ scene

### Transition acceptance

- นักเรียนเริ่มที่ `loading` แล้วเป็น `empty` เมื่อไม่มี draft หรือ `saved_local` เมื่อกู้ scene ที่ persist แล้ว; scene ที่อ่าน/validate ไม่ได้เป็น `load_failed` ส่วน scene ที่ parse ได้แต่มี content/version ที่ policy ปัจจุบันไม่รองรับเป็น `unsupported_read_only` ทั้งสองสถานะต้องเก็บ raw เดิมและห้าม autosave กระดาษว่างทับ จากสถานะที่แก้ได้ semantic edit ทุกครั้งเปลี่ยนเป็น `dirty_local` ทันที แล้ว `saving_local` ไป `saved_local`, `save_failed` หรือ `limit_exceeded`
- เมื่อมี artifact อยู่ การ attach สำเร็จบันทึก semantic fingerprint/revision เป็น `attached_current`; edit หลังจากนั้นเป็น `attached_stale` ทันทีและสถานะนี้ต้องอยู่หลัง close/reopen/reload หากเปรียบเทียบฉบับ local กับ artifact ไม่ได้ให้ใช้ `attached_unverified` และเตือนก่อน submit จน attach ใหม่หรือ verify สำเร็จ
- attach failure เป็น `attach_failed` โดยคง local draft และ artifact ฉบับก่อน; submit ต้องเตือนทั้ง `attached_stale` และ `attached_unverified` และ server requirement เดิมยังเป็นผู้ตัดสินสุดท้าย
- ครูเริ่มกระดานว่างเป็น `new_draft`; semantic edit เป็น `unsaved_new` หากยังไม่มี board หรือ `unsaved_changes` หากเปิด saved slot; save ไป `saving` แล้ว `saved_slot` หรือ `save_failed`
- ครูโหลด slot โดยคง scene/identity เดิมไว้จน response และ validation สำเร็จ (`loading_slot`); transport/parse failure เป็น `load_failed` บน identity เดิม ส่วน scene ที่ parse ได้แต่มี content/version ต้องห้ามเป็น `unsupported_read_only` และใช้ safe placeholder โดยไม่ส่ง raw เข้า Excalidraw ทั้งสองกรณีคง recovery ไว้ ส่วน board ของคนอื่นที่รองรับเป็น `read_only_slot` ตลอด lifecycle

## Compatibility contract

เฟส 1–8 ห้ามเปลี่ยนสิ่งต่อไปนี้โดยไม่มี migration/compatibility plan แยก:

- scene envelope `{ formatVersion: 1, elements, appState, files, background }`
- IndexedDB database `korkru-math-work`, store `scratchpads` และ key `[ownerId, submissionId, answerId, localPartKey]`
- debounce 650 ms, pointer-up save 120 ms, TTL 7 วัน, เพดาน 2 MiB/10,000 elements และ best-effort purge หลัง submit
- private Storage path, artifact uniqueness ต่อ answer/part, teacher board 5 slots และ authorization ของ Server Actions
- preview mode ที่เก็บ scene ใน memory เท่านั้น
- lazy loading หลัง user gesture และการไม่ส่ง telemetry/server request ต่อ stroke
- stable app state ที่เก็บ style/font/arrow/pen mode และ view ตามสัญญาปัจจุบัน; undo stack ยังคงเป็น runtime-only แต่ scene เก็บ deleted-element tombstone ที่จำเป็นต่อ history ได้

fixture ขั้นต่ำสำหรับ regression ได้แก่ scene ว่าง, freehand/highlighter, ข้อความไทย/อังกฤษ, เส้น/รูปทรง, พื้นทั้ง 4 แบบ, deleted elements และกระดานครูที่ฝังรูปโจทย์

fixture รูปโจทย์ต้องพิสูจน์เพิ่มว่า current-question claim ผ่าน, claim จากอีก question/assignment/actor กับ arbitrary data URL ไม่ผ่าน, board v1 เดิมที่มี image hash เดิมเปิดและ re-save ได้ และการแก้ payload รูปใน legacy board ถูกปฏิเสธโดยไม่เขียนทับฉบับดี

เฟส 1 รองรับ board v1 เดิมที่เป็น PNG/JPEG/JPG/WebP/GIF ด้วย exact file/element snapshot fallback รวมกรณี signing key หมุนโดย token เดิมต้องตรงทุก byte ส่วน SVG ดิบไม่ถูกส่งเข้า browser: Server Action decode เฉพาะ predefined/numeric XML references แล้วแปลงเฉพาะ SVG แบบ self-contained ที่ไม่มี active content, external reference, style/xml-base หรือ CSS escape เป็น WebP พร้อม claim ใหม่ใน memory ก่อนเปิด หากแปลงไม่ได้ UI จะเป็น safe read-only และเก็บไฟล์เดิมไว้ ไม่ sanitize โดยตัดข้อมูลแล้วอ้างว่าโหลดสำเร็จ

## Security, privacy และ performance gates

- ห้ามลด RLS, ย้าย authorization มาไว้เฉพาะ client หรือขยายสิทธิ์ Storage ของ browser การเปลี่ยน signed URL contract ต้องเป็น hardening ที่บันทึกไว้และคง compatibility; เฟส 1 จึงย้าย `scene.json` ไปให้ server เขียนและให้ browser ได้เฉพาะ preview token + scoped receipt
- scene, file metadata, signed URL และข้อมูลนักเรียนห้ามเข้า log, analytics หรือ error message
- generic paste/drop/upload ต้อง fail closed ตาม role policy ก่อน Excalidraw รับ event
- `/assignments/[id]/take` ต้องไม่เพิ่ม Excalidraw, mathjs, Supabase browser client หรือ server-only upload/cleanup code เข้า initial client chunk union
- ทุกเฟสที่แตะ code ต้องวัด `npm run measure:take-bundle`; initial union ต้องไม่เกิน 17 chunks และ 256,828 bytes gzip (baseline 246,588 + tolerance 10 KiB) หากเกินให้ถือเป็น blocker จนกว่าจะลดขนาดหรือได้รับการอนุมัติ product decision ใหม่ที่บันทึกในเอกสาร
- ต้องคง single live editor ในโหมดสอน ตรวจด้วย DOM ว่ามี `.excalidraw` ไม่เกิน 1 instance และการสลับข้อ/ซ่อน/เปิดไม่ทิ้ง canvas ซ้ำ; loop เปิด–ปิดหรือสลับข้อ 10 รอบต้องไม่ทำให้ median heap ของรอบ 6–10 สูงกว่ารอบ 1–5 เกิน 20% ใน Chrome profile เดียวกัน
- ที่ 390×844, 768×1024, 1024×768 และ 1280×800 ต้องมี `document.documentElement.scrollWidth <= innerWidth` และทุก command ใน toolbar เข้าถึงได้โดยไม่ถูก clip; ต้องผ่าน keyboard/focus, touch/stylus, rotate และ close/reopen lifecycle ตามขอบเขตของเฟสนั้น

## Baseline ที่บันทึกในเฟส 0

### Automated/local

| การตรวจ | ผลบน `ecfacda` |
| --- | --- |
| `npm test` | ผ่าน 105 files / 1,364 tests |
| `npx tsc --noEmit` | ผ่าน |
| `npm run lint:tokens` | ผ่าน; palette 145 เทียบ baseline 149, card 0, control 0, button 291 เทียบ baseline 302 |
| `npm run build` | ผ่านด้วย Next.js 16.3.5 / Turbopack; 63 static pages |
| `npm run measure:take-bundle` | 17 initial chunks; 804,026 bytes raw / 246,588 bytes gzip |
| initial-chunk scan | ไม่พบ Excalidraw, mathjs, `supabase-js` หรือ `lib/supabase/client` |
| Next MCP | compilation issues ว่าง, config/session errors ว่าง และ route `/exam-screen-lab` ตรงกับ page ที่เปิด |

ติดตั้ง dependency ด้วย lockfile เดิมและไม่มีไฟล์ dependency เปลี่ยน `npm audit` รายงาน 54 รายการ (low 3, moderate 40, high 11) ซึ่งเป็น baseline ที่ต้องติดตาม ไม่ใช่ผลว่าปลอดภัยพร้อม production

### Local browser baseline

- เปิด `/exam-screen-lab` หลัง user gesture ที่ 390×844, 768×1024, 1024×768 และ 1280×800 ได้โดยไม่มี console/runtime error
- 390×844 ใช้ full-screen board และ 768×1024 ใช้ full-width board; 1024×768 และ 1280×800 ใช้แผงขวา
- native Library, More tools และ native lock ยังปรากฏ/เข้าถึงได้จริง จึงยืนยันว่า UI ซ่อนบางส่วนยังไม่ใช่ policy enforcement
- ที่ 1024×768 แผงขวากว้างประมาณครึ่งหน้าจอ ทำให้แถวปุ่มพื้นกระดาษด้านบนและ native toolbar ด้านขวาถูกตัดบางส่วน เป็น baseline ที่เฟส toolbar ต้องปิดด้วย responsive acceptance test
- lab เป็น preview mode จึงยืนยันเฉพาะ render, lazy load และ interaction surface ไม่ใช่ IndexedDB, Auth, Storage, attachment หรือ teacher persistence

### Release evidence ที่ยังขาด

- `npm run check:exam-candidate` ผ่านและผูกกับ Staging candidate `r8`
- `npm run check:exam-uat` ยัง fail closed: external UAT ทั้ง 7 suites ยัง pending
- `npm run check:exam-staging` fail ตามคาดใน local shell เพราะไม่มี Staging environment injection
- `npm run check:exam-release` ยัง NOT READY จาก authenticated Staging, SEB platform evidence และ external UAT
- iPad candidate `r8` มีหลักฐาน finger drawing, whole-object eraser, undo/redo, สี/ขนาด, รูปทรง, ข้อความ, pinch zoom/pan, rotate และปิด–เปิดแผงใน session เดิมแล้ว แต่ยังไม่ครอบคลุม Apple Pencil, persistence จริง, attachment หรือ teacher board
- เฟส 0 ไม่ทดสอบ deployed site, external service, production Auth/Storage หรือเขียนข้อมูลใด ๆ

## ลำดับเฟสและ commit gates

0. **Spec และ baseline** — เอกสารนี้, แก้ documentation drift และบันทึกหลักฐานปัจจุบัน
1. **Shared core และ policy boundary — implementation เสร็จบน branch เฟส 1; rollout gate ยัง pending** — รวม editor host, command policy และ validator, ปิด bypass ทุกทาง และคง scene/persistence contract; authenticated teacher loop/heap ยังต้องผ่านก่อน merge/deploy
2. **Student toolbar และ input mode — implementation เสร็จบน branch เฟส 2; rollout gate ยัง pending** — command facade, แถวหลัก/รอง, fit, single stroke-width source, selection semantics, finger draw/pan และ responsive behavior พร้อม local touch/pen evidence; physical Safari/iPad/stylus และ upstream dev warnings ยังรอ hardening/UAT
3. **Student draft/attachment correctness — implementation เสร็จบน branch เฟส 3; rollout gate ยัง pending** — revision/fingerprint-based status, stale/unverified submit warning, confirmed attached-scene load และ persistent one-step recovery ผ่าน automated/local browser gates แล้ว; authenticated Auth/Storage และ physical UAT ยังรอเฟส 8
4. **Partial eraser — implementation เสร็จบน branch เฟส 4; rollout gate ยัง pending** — freehand/highlighter เท่านั้น, element อื่นลบทั้งวัตถุ, deterministic one-gesture undo/redo และ full-scene limit/sanitizer tests ผ่านแล้ว; physical Safari/iPad/stylus และ authenticated/teacher UAT ยังรอเฟส 8
5. **Teacher presentation tools — implementation เสร็จบน branch เฟส 5; rollout gate ยัง pending** — app-owned shared toolbar, laser, Frame, trusted รูปโจทย์, quick colors, presentation lock, session-only grid/snap และ duplicate-next-step ที่ re-id/re-claim/detach ต้นฉบับผ่าน automated/local browser gates แล้ว; authenticated Auth/Storage/save-victim flow, physical UAT และ teacher loop/heap ยังรอเฟส 7–8
6. **Teacher draft/save correctness — implementation เสร็จบน branch เฟส 6; rollout gate ยัง pending** — state ต่อ exact question/slot/board, atomic load/save identity, all-draft exit guard และ one-step recovery ผ่าน automated/local browser gates แล้ว; authenticated Supabase flow, physical UAT และ hardening findings ยังรอเฟส 7–8
7. **Hardening — implementation เสร็จบน branch เฟส 7; rollout gate ยัง pending** — compatibility fixtures, session-only Library, accessibility, keyboard/paste/drop/context matrix, local performance/memory และ security review ผ่านแล้ว; dependency baseline, authenticated Supabase, physical browser/stylus และ PNG schema debt ยังรอเฟส 8 หรือ dependency work ที่แยกขอบเขต
8. **Staging UAT และ rollout** — ล็อก candidate ใหม่ ทดสอบ physical iPhone/iPad/desktop + stylus/Auth/Storage/attachment/teacher flow แล้วค่อยพิจารณา merge/deploy

แต่ละเฟสเป็น commit ที่ตรวจรับและ push แยกกัน ห้ามรวมเฟสถัดไปเพื่อทำให้ gate ของเฟสก่อนดูผ่าน และห้ามเปลี่ยน production จนเฟส 8 ผ่าน UAT ที่ผูกกับ revision/build/config เดียวกัน
