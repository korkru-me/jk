/** Keep these statements aligned with AssignmentCopyPreset and its form defaults. */
export function AssignmentReuseDetails({ kind = 'assignment' }: { kind?: 'assignment' | 'practice' }) {
  if (kind === 'practice') return (
    <section className="@container/reuse-details flex min-w-0 flex-col gap-3 text-sm leading-relaxed" aria-label="รายละเอียดการนำคลังฝึกมาใช้ซ้ำ">
      <p className="text-muted-foreground">ระบบเตรียมคลังฝึกใหม่จากต้นฉบับในห้องเรียนปลายทางที่เลือก คุณสามารถตรวจสอบและแก้ไขก่อนบันทึก โดยคลังฝึกต้นฉบับยังคงอยู่ตามเดิม</p>
      <div className="grid min-w-0 gap-3 @min-[38rem]/reuse-details:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-semibold text-foreground">ข้อมูลที่นำมาจากคลังฝึกต้นฉบับ</h3>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
            <li>ชื่อคลังฝึก โดยเพิ่มคำว่า “(สำเนา)” ต่อท้าย และคำอธิบายหรือคำชี้แจง</li>
            <li>รายการโจทย์และลำดับข้อ โดยอ้างอิงโจทย์เดิมในคลัง ไม่ได้สร้างโจทย์สำเนาแยกขึ้นใหม่</li>
            <li>การตั้งค่าเปิดเผยเฉลย รหัสเข้าคลังฝึก เครื่องคิดเลข กระดาษทด การสลับลำดับโจทย์ และการสลับลำดับตัวเลือก</li>
          </ul>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-semibold text-foreground">ข้อมูลที่ไม่นำมาด้วย</h3>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
            <li>รายชื่อนักเรียนจากห้องต้นทาง คลังฝึกใหม่ใช้สมาชิกของห้องเรียนปลายทางที่เลือก</li>
            <li>ประวัติการฝึก ความคืบหน้ารายบุคคล ชุดฝึกส่วนตัว และรายการที่นักเรียนปักหมุดไว้</li>
            <li>กลุ่มงาน ลำดับการแสดง และสถานะเผยแพร่หรือปิดคลังเดิม ต้องบันทึกเป็นฉบับร่างหรือเผยแพร่คลังใหม่อีกครั้ง</li>
          </ul>
        </div>
      </div>
      <p className="font-medium text-foreground">ก่อนบันทึก โปรดตรวจสอบห้องเรียนปลายทาง รหัสเข้าคลังฝึก และสิทธิ์ใช้โจทย์ ระบบจะแจ้งข้อที่นำมาใช้ไม่ได้และไม่ตัดโจทย์ออกโดยอัตโนมัติ</p>
    </section>
  )
  return (
    <section className="@container/reuse-details flex min-w-0 flex-col gap-3 text-sm leading-relaxed" aria-label="รายละเอียดการนำงานมาใช้ซ้ำ">
      <p className="text-muted-foreground">
        การนำงานมาใช้ซ้ำเป็นการเตรียมแบบฝึกหัดหรือข้อสอบรายการใหม่จากงานต้นฉบับ
        คุณสามารถตรวจสอบและแก้ไขข้อมูลทั้งหมดก่อนบันทึก งานต้นฉบับยังคงอยู่ตามเดิม
      </p>
      <div className="grid min-w-0 gap-3 @min-[38rem]/reuse-details:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-semibold text-foreground">ข้อมูลที่นำมาจากงานต้นฉบับ</h3>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
            <li>ชื่องาน โดยเพิ่มคำว่า “(สำเนา)” ต่อท้าย ประเภทงาน และคำอธิบายหรือคำชี้แจง</li>
            <li>รายการโจทย์ ลำดับข้อ การแบ่งแฟ้มย่อย คะแนนรายข้อ และคะแนนเต็มที่กำหนดให้แสดง โดยอ้างอิงโจทย์เดิมในคลัง ไม่ได้สร้างโจทย์สำเนาแยกขึ้นใหม่</li>
            <li>การตั้งค่าการทำงาน เช่น การสุ่มข้อและตัวเลือก จำนวนครั้งที่ทำได้ วิธีสรุปคะแนน เกณฑ์ผ่าน เงื่อนไขการทำสำเร็จ การแสดงผลและเฉลย เครื่องคิดเลข และกระดาษทด</li>
            <li>วันเวลาเปิดทำ กำหนดส่ง ปิดรับงาน ช่วงส่งล่าช้า เวลาทำงาน รหัสเข้าทำ และการตั้งค่าควบคุมการสอบที่มีอยู่ในต้นฉบับ</li>
          </ul>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-semibold text-foreground">ข้อมูลที่ไม่นำมาด้วย</h3>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
            <li>รายชื่อนักเรียนและกลุ่มย่อยของห้องต้นทาง งานใหม่ใช้ห้องเรียนปลายทางที่เลือก โปรดตรวจสอบห้องเรียนและกลุ่มผู้รับในขั้นรายละเอียด</li>
            <li>ประวัติการเข้าทำ คำตอบหรือไฟล์ที่นักเรียนส่ง จำนวนครั้งที่ใช้ไป ความคืบหน้า ผลตรวจ คะแนนรายบุคคล และข้อเสนอแนะของครู</li>
            <li>การขยายเวลาเฉพาะบุคคล และสถานะเผยแพร่หรือปิดรับของงานเดิม ต้องเลือกบันทึกเป็นฉบับร่างหรือเผยแพร่งานใหม่อีกครั้ง</li>
            <li>รหัสออกจาก Safe Exam Browser (SEB) หากเลือกใช้ SEB ต้องกำหนดรหัสออกใหม่</li>
          </ul>
        </div>
      </div>
      <p className="font-medium text-foreground">
        ก่อนบันทึก โปรดตรวจสอบวันเวลา รหัสเข้าทำ และผู้รับงานทุกครั้ง เนื่องจากวันเวลาและรหัสเข้าทำเดิมอาจไม่เหมาะกับการใช้งานครั้งใหม่
      </p>
    </section>
  )
}
