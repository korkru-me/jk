# KorKru / ก่อครู

KorKru คือแพลตฟอร์มคลังโจทย์และห้องเรียนออนไลน์สำหรับครู ภายใต้แนวคิด **“ก่อ…โดยครู”** ครูสามารถสร้างโจทย์ จัดชุดงานหรือข้อสอบ มอบหมายให้นักเรียน และตรวจคำตอบได้ทั้งแบบอัตโนมัติและโดยครู

เป้าหมายระยะแรกคือทำให้ 5 ส่วนนี้ใช้งานได้ครบเส้นทาง:

1. คลังโจทย์
2. ห้องเรียนรายวิชา
3. งานและข้อสอบ
4. การส่งคำตอบและตรวจคะแนน
5. ห้องโฮมรูมที่รวมภาระงานข้ามรายวิชา

> สถานะปัจจุบันเป็นระบบระหว่างพัฒนา หลายฟีเจอร์มีโค้ดรองรับแล้ว แต่ยังไม่ถือว่าพร้อมใช้งานจริงจนกว่าจะผ่านการทดสอบครบเส้นทาง ดูรายละเอียดใน [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md)

## เทคโนโลยีหลัก

- Next.js 16 App Router และ React 19
- TypeScript แบบ `strict`
- Tailwind CSS 4 และชุด UI ภายในโปรเจกต์
- Supabase Auth, PostgreSQL, Row Level Security และ Storage
- Server Actions สำหรับการเปลี่ยนแปลงข้อมูลหลัก

## เริ่มใช้งานในเครื่อง

ต้องมี Node.js รุ่นที่รองรับ Next.js 16 และโปรเจกต์ Supabase ที่มี schema/migrations ตรงกับโค้ด

```bash
npm ci
cp .env.example .env.local
npm run dev
```

จากนั้นเปิด [http://localhost:3000](http://localhost:3000)

ตัวแปรแวดล้อมที่ต้องใช้ดูได้จาก `.env.example` ห้าม commit `.env.local` หรือ `SUPABASE_SERVICE_ROLE_KEY`

## คำสั่งที่มี

```bash
npm run dev       # development server
npx tsc --noEmit  # ตรวจ TypeScript
npm run build     # production build
npm run start     # รัน production build
```

ปัจจุบันยังไม่มีคำสั่ง `lint` และยังไม่มี automated test suite

## เอกสารสำหรับคนและ AI

- [AGENTS.md](AGENTS.md) — กฎหลักที่ AI ต้องอ่านก่อนทำงาน
- [docs/PRODUCT.md](docs/PRODUCT.md) — วิสัยทัศน์ แบรนด์ ผู้ใช้ และรูปแบบธุรกิจ
- [docs/SCOPE.md](docs/SCOPE.md) — ขอบเขต MVP และสิ่งที่ยังไม่ทำ
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — โครงสร้างและการไหลของระบบ
- [docs/DOMAIN.md](docs/DOMAIN.md) — คำศัพท์ บทบาท และกฎทางธุรกิจ
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — แบบจำลองข้อมูลและขอบเขต tenant
- [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md) — สถานะฟีเจอร์จากโค้ดจริง
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — หลักภาษา แบรนด์ และ UI
- [docs/SECURITY.md](docs/SECURITY.md) — กฎความปลอดภัยและข้อมูลนักเรียน

## กฎฐานข้อมูลสำคัญ

- `supabase/migrations/` บันทึกวิวัฒนาการของฐานข้อมูล อย่าคิดว่า `supabase/schema.sql` เพียงไฟล์เดียวคือสถานะล่าสุด
- ก่อนเปลี่ยน schema ต้องตรวจ migration ที่ถูกใช้กับฐานข้อมูลเป้าหมายจริง
- ห้ามแก้ migration ที่ถูกใช้งานแล้วเพื่อเปลี่ยนพฤติกรรม ให้สร้าง migration ใหม่
- ห้ามแก้ปัญหาสิทธิ์ด้วยการปิดหรือลดความเข้มงวดของ RLS

## การร่วมพัฒนา

ก่อนแก้โค้ดให้อ่าน [AGENTS.md](AGENTS.md) และเอกสารที่เกี่ยวข้อง รักษาการเปลี่ยนแปลงเดิมของผู้อื่น ทำงานเป็นส่วนเล็ก และบันทึกสถานะฟีเจอร์เมื่อพฤติกรรมเปลี่ยน
