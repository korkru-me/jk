# ปฏิทินและสถานะงานในห้องเรียนนักเรียน

อัปเดต 14 ตุลาคม 2026: local preview และ local commit ตามคำสั่งเจ้าของ ไม่ push/deploy และไม่มี migration

- ห้องรายวิชาใช้คอลัมน์เนื้อหา/ปฏิทินด้านขวาและ sticky ใน main scrollport เช่นเดียวกับพื้นที่เรียนรู้ของฉัน บนจอเล็กเรียงคอลัมน์เดียว ปฏิทินสร้างจาก assignments ที่ผ่าน membership/group reach ในห้องนั้นเท่านั้น งานไม่มีกำหนดส่งอยู่ในรายการแต่ไม่อยู่ในช่องวันที่
- โฮมรูมใช้ `loadStudentLearningCalendar` หลัง verified Auth และ exact homeroom membership guard อ่าน memberships/submissions เฉพาะเจ้าของและ published assignments ในห้องที่เข้าร่วม รวม group reach และใช้ `buildStudentLearningData` ตัวเดียวกับ dashboard เพื่อคง official-score/completion/rescale และซ่อนคะแนนเดิม ไม่ใช้ตัวรวมข้อมูล roster ของครูในเส้นทางนี้แล้ว
- ปฏิทินโฮมรูมรวมงานทุกวิชาของตนเอง งานที่เชื่อมหลายห้องนับครั้งเดียว ไม่ส่งข้อมูลนักเรียนคนอื่นหรือเพิ่มสิทธิ์ RLS อ่านแบบ pagination และแสดง error เมื่อ source query ล้มเหลว
- ใช้ `studentWorkSeverity` ร่วมสำหรับจุดปฏิทินและแถบซ้ายการ์ด: done เขียวเหนือสถานะกำหนดส่ง, overdue แดง, soon เหลืองภายใน 48 ชั่วโมง, later สี primary รวมไม่มีกำหนดส่ง ป้ายและ Tooltip อธิบายสีทั้งชี้เมาส์และ focus
- งานที่เสร็จตาม `isCompleted` เดิมมีติ๊ก ป้ายส่งแล้ว พื้นเขียวอ่อนและเงาเขียว การเริ่มใหม่/ทำต่อ คะแนนที่ซ่อน และ completion rule เดิมไม่เปลี่ยน การส่ง attempt ที่ยังไม่ผ่านเกณฑ์ไม่ถูกเปลี่ยนเป็นทำเสร็จ
- งานที่เสร็จลงท้ายกลุ่ม และกลุ่มที่เสร็จทุกงานลงท้ายรายการ โดยคงลำดับเดิมระหว่างงานค้างและระหว่างกลุ่มค้าง ตัดสินทั้งกลุ่มจากรายการเต็มก่อน status/type filter จึงไม่จัดกลุ่มใหม่ผิดเพราะซ่อนงานบางประเภท

## การตรวจ

- TypeScript, design-token lint, webpack build และ unit suite 257 ไฟล์ / 3,299 เคสผ่าน เพิ่ม 14 เคสสำหรับเวลา 48 ชั่วโมง/งานไม่มีกำหนด, completion gate, stable grouping, filtered groups, owner-scoped calendar source, group reach และ query failure
- Chrome บน 320/390/1280/1600px: ไม่ล้นแนวนอน มีสามการ์ดต่อแถวเมื่อพื้นที่พอ สีแถบตรงจุดปฏิทิน ติ๊ก/เงาเขียว งานและกลุ่มที่เสร็จลงท้าย ปฏิทินรายวิชาไม่รวมวิชาอื่น แต่โฮมรูมรวมทั้งฟิสิกส์และคณิตศาสตร์ใน fixture มี empty states และลิงก์จำลองไม่สร้าง attempt
- ตรวจ sticky ด้วย mouse wheel ใน main scrollport, hover/focus สี, รายละเอียดวันที่ และการขยาย/ปิดปฏิทิน ไม่ใช้บัญชีจริง ไม่ส่งคำตอบ และไม่เขียนฐานข้อมูล
- Axe เฉพาะกริดห้องเรียนไม่พบ violation ทั้งโหมดสว่าง/มืด มี color-contrast incomplete จากข้อความที่ซ้อน/ถูกตัดใน scrollport ตรวจภาพเพิ่มเติมแล้ว ไม่ใช่การรับรอง full-page accessibility ตรวจ React tree/props และ Next MCP compile/runtime แล้ว
- Staging zero-row query ยืนยันคอลัมน์ assignments/assignment_classrooms/submissions ที่ใช้ได้ โดยไม่คืนข้อมูลบุคคลหรือเปลี่ยน schema
- ยังไม่ได้ตรวจการอ่าน calendar ด้วยบัญชีนักเรียนจริง, native SEB หรืออุปกรณ์สัมผัสจริง ไม่มีการแตะ Production
