# Brand, language และ UI rules

อัปเดตล่าสุด: 18 สิงหาคม 2026

## Brand

- ชื่อหลัก: **ก่อครู**
- English mark: **KorKru**
- แนวคิดภาษา: **“ก่อ…โดยครู”**

คำตรงกลางเป็นข้อความที่เปลี่ยนได้ตามบริบท ไม่ใช่คำที่หายหรือ error state ตัวอย่างเช่น “ก่อข้อสอบโดยครู” บนหน้าสร้างข้อสอบ และ “ก่อห้องเรียนโดยครู” บนหน้าห้องเรียน

หากทำ motion/rotation:

- ต้องอ่านประโยคได้เมื่อ animation ถูกปิด
- หลีกเลี่ยงการสลับเร็วหรือทำ layout shift
- ใช้คำที่เจ้าของผลิตภัณฑ์อนุมัติหรือคำที่ตรงกับบริบทจริง
- รักษา accessibility สำหรับ `prefers-reduced-motion`

## ภาษา

- Product copy, labels, validation และคำอธิบายสำหรับผู้ใช้เป็นภาษาไทย
- Code, filenames, routes, database fields และ standard technical terms เป็นอังกฤษ
- ใช้คำสั้นและเป็นภาษาครู ไม่ใช้ศัพท์เทคนิคเพื่อทำให้ผลิตภัณฑ์ดูซับซ้อน
- แยกคำว่า “งาน”, “แบบฝึกหัด” และ “ข้อสอบ” ตามพฤติกรรมจริง ไม่ใช้สลับกันเมื่อมีผลต่อเวลา attempt หรือผลคะแนน
- Error message ต้องบอกว่าผู้ใช้ทำอะไรต่อได้ ไม่แสดง raw database error เมื่อเป็น production

## Visual language ที่มีอยู่

- Primary ปัจจุบันอยู่ในโทน indigo/violet
- Success ใช้ emerald/green, warning ใช้ amber, destructive ใช้ red
- ใช้ rounded cards, borders และ spacing แบบค่อนข้างโปร่ง
- ใช้ Lucide icons และ primitives ใน `components/ui/`
- รองรับ light/dark theme ในหลายส่วน แต่ต้องตรวจ contrast ทุกหน้าที่แก้

การเปลี่ยน palette หรือ component language หลักต้องเป็นการตัดสินใจระดับระบบ ไม่ปรับทีละหน้าโดยไม่มีแผน

## Style presets

สไตล์ทั้งเว็บคุมด้วย CSS variable ใน `app/globals.css` ไม่ใช่ class ในแต่ละไฟล์ แกนที่หมุนได้:

- `--primary`, `--success`, `--warning`, `--flag`, `--destructive` และ token สีอื่น — ความหมาย ไม่ใช่การตกแต่ง
- `--radius` — ความมนทั้งเว็บ (Tailwind คำนวณ `rounded-*` จากค่านี้)
- `--spacing` — ความโปร่ง/แน่น (Tailwind คำนวณ `p-*`, `gap-*`, `m-*` จากค่านี้)
- `--elevation-sm|md|lg|xl` — เงา

เปลี่ยนสไตล์ทั้งเว็บด้วยการใส่ `data-style` บน `<html>` ใน `app/layout.tsx`:

```
<html lang="th" data-style="warm">
```

preset ที่มีให้: `soft` (มน โปร่ง เงานุ่ม), `sharp` (เหลี่ยม แน่น ไม่มีเงา), `warm` (โทนอุ่น) ถ้าไม่ใส่ = ค่าเริ่มต้น

เพิ่ม preset ใหม่โดยคัดลอกบล็อก `[data-style="..."]` ท้าย `globals.css` แล้วแก้ค่า ไม่ต้องแก้ไฟล์อื่น

**preset เปลี่ยนได้เฉพาะการตกแต่ง** ห้ามเปลี่ยนว่าสีไหนหมายถึงอะไร — เขียวยังคงหมายถึงสำเร็จ ส้มยังคงหมายถึงโจทย์ที่ถูกรายงาน ในทุก preset

องค์ประกอบใหม่ต้องใช้ token และ primitive ใน `components/ui/` ไม่เขียน class สีหรือทรงเอง — `npm run lint:tokens` ตรวจข้อนี้

## UI behavior

- Mobile-first และใช้งานได้อย่างน้อยบน mobile/tablet/desktop
- ปุ่มหลักหนึ่งจุดต่อ section เมื่อเป็นไปได้
- ทุก mutation ต้องมี pending, success และ error feedback
- หน้า data ต้องมี loading, empty และ permission-denied states
- destructive action ต้องบอกผลกระทบและขอการยืนยันตามความรุนแรง
- อย่าซ่อน authorization error ด้วย empty state
- Form ต้องมี label ที่อ่านได้ด้วย assistive technology

## ข้อมูลจริงกับต้นแบบ

- Mock/prototype ต้องมีป้ายชัดหรือซ่อนจาก production navigation
- ห้ามใช้เลขสุ่มเป็น analytics โดยไม่ระบุว่าเป็นข้อมูลตัวอย่าง
- ห้ามแสดง invoice, usage, plan หรือ cancellation สำเร็จหากไม่มี backend จริง
- ห้ามอ้าง PDPA, ISO, encryption, SLA, SSO, trial หรือราคาเป็นข้อเท็จจริงโดยไม่มีหลักฐานและการอนุมัติ

## Content principles

- ยืนยันการทำงานด้วยข้อความที่ตรงกับผลจริง
- อธิบายการสุ่มและการตรวจคะแนนให้ครูเข้าใจและตรวจสอบได้
- บอกชัดว่าส่วนใดตรวจอัตโนมัติและส่วนใดต้องให้ครูตรวจ
- หลีกเลี่ยงข้อความที่ทำให้ครูเชื่อว่าระบบตัดสินนักเรียนแทนครู
- ข้อมูลสุขภาพ ครอบครัว และความเครียดไม่ควรปรากฏใน dashboard รวมโดยไม่จำเป็น
