# Student work summary: practice libraries

14 ตุลาคม 2026 · branch `codex/student-classroom-cards` · commit ในเครื่อง/localhost:3000 ตามคำสั่งล่าสุด ไม่ push/deploy

## พฤติกรรม

เพิ่มคลังฝึกในสรุปงานของ `/dashboard` ของนักเรียน ใช้กรอบ/สี/ไอคอนห้องเดียวกับงานทั่วไป พร้อมป้ายรูปหนังสือ “คลังฝึก”, จำนวนโจทย์ และ “ฝึกได้เรื่อย ๆ · ไม่มีคะแนน”. ลิงก์ไป `/practice/[id]` คงหน้ารอและ access-code check เดิม ไม่เพิ่มชนิดใน AssignmentType

งานที่ทำครบเงื่อนไขเดิมอยู่ท้ายเสมอทั้ง due/latest และ asc/desc. งานไม่เสร็จและคลังอยู่ก่อนตามตัวกรอง: latest ใช้เวลาเปิดคลัง (fallback เวลา created สำหรับข้อมูลเก่า); due วางงานมีวันส่งก่อนงานไม่มีกำหนดใน active tier และเรียง undated items ตามเวลามอบหมายใหม่ก่อน. ไม่มีวันส่งสมมติสำหรับคลัง และคลังไม่เป็น completed

จำนวนคลังเป็น badge แยก ไม่เข้า pendingCountMap/urgentCount/doneCount/grade/history/calendarEvents. เงื่อนไขจบและการเลือก official attempt ของงานเดิมไม่เปลี่ยน. โหลดคลังล้มเหลวแสดง error และยังคงรายการงานปกติ. กรอบยัง compact: ใช้ WorkRow เดิม, metadata สองบรรทัดตามความกว้าง และตัวกรอง target 44px ที่วางแถวเดียวได้ที่ 320px

## Source และขอบเขตข้อมูล

Student branch หลัง Auth/role ใช้ session-bound `loadStudentPracticeLibraries` เดิมเฉพาะเมื่อ practice feature flag เปิด. Query ภายใต้ RLS ตรวจ active subject roster และ published libraries; เพิ่มเฉพาะ published_at/created_at ใน metadata allowlist เพื่อใช้ตัวเรียง ไม่มี answer/attempt/correctness/score/access code หรือ raw question rows. `buildStudentLearningData` รับ catalog เป็น input แยกและกรอง active enrolled subject ซ้ำก่อนสร้าง practiceWork พร้อม completed=false, ใช้ชื่อ/สีห้องปัจจุบันจาก roster. Keys แยก assignment/practice namespace

ไฟล์หลัก: dashboard/page, student-learning-data, student-work-summary, practice/_lib/student-landing-contract/data, lib/student-work-sort และ tests ที่เกี่ยวข้อง. Fixture `/exam-screen-lab/student-dashboard` เพิ่ม practice-only/practice-error และใช้คลังจำลองสองวิชาทุกกรณีที่มีห้อง ไม่อ่านฐานข้อมูลและปิด notification polling

## การตรวจ

- TypeScript และ semantic token lint ผ่าน
- Full suite 259 files / 3,355 tests ผ่าน เพิ่ม 11 เคสเกี่ยวกับ completion tiers, ทิศทางตัวเรียง, undated publication order, metadata timestamps, isolation จากคะแนน/งานค้าง/ปฏิทิน, room membership/type/lifecycle, duplicate libraries, unknown dates, malformed progress fields และ load error
- Production webpack build ผ่านโดยแยก `.next-build-student-summary` จาก dev cache; คืน tsconfig ให้ตรง dirty state ของเจ้าของก่อนเริ่มงาน
- Browser synthetic QA: due/latest ทั้งสองทิศทาง completedLast/practiceActive=true ทุกกรณี; สีคลังฟิสิกส์ตรงงานฟิสิกส์, ความสูง 71/79px ใน viewport เดียวกัน, href ไป waiting route; completed scenario pending=0/done=7/practice=2 และคลังมาก่อนงานเสร็จทั้งหมด; practice-only pending=done=0/practice=2; practice-error คง ordinary work ทั้ง 7 ข้อและแสดง error. 320px ไม่มี horizontal overflow และตัวกรองสองปุ่มอยู่แถวเดียวกันโดยมี height >=44px
- Next MCP ไม่พบ compilation/runtime errors

ไม่ได้ตรวจ Auth-to-DB/hosted Staging ด้วยบัญชีนักเรียนในรอบนี้ และไม่มี Production QA writes. ไม่มี migration ใหม่หรือ schema apply; migration ชุด personal exercises/editing/pins ในงานก่อนยังคง pending ตาม handoff เดิม. ก่อนกลับมาทำ hosted QA/release ต้องอ่าน AGENTS.md และเช็ค migration ledger ใหม่

## ส่งต่อ

เก็บงานนี้ใน local commit ของ checkout ที่พอร์ต 3000 รัน (`/Users/korkusonmasaen/Korkru/korkru`) รักษางาน brand/assignment/landing/docs/tsconfig ที่ dirty อยู่ก่อนหน้าไว้ ไม่รวมใน commit นี้. ผู้ใช้ refresh `/dashboard` ในบัญชีนักเรียนเพื่อดูรายการจริงได้; ไม่มี push หรือ deployment ในรอบนี้
