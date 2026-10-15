import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { ShellClient } from '@/components/layout/shell-client'
import { SubmissionScoreSummary } from '@/components/student/submission-score-summary'
import { SubmissionAnswerReview, QuestionText } from '@/components/student/submission-answer-review'
import { SolutionWatermark } from '@/components/student/solution-watermark'
import { buildSolutionWatermark } from '@/lib/solution-watermark'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata = {title:'ห้องทดลองผลสอบ — KorKru'}

const OPTIONS=[{text:'4 เท่า',is_correct:false,index:1},{text:'0.5 เท่า',is_correct:true,index:4},{text:'2 เท่า',is_correct:false,index:3}]
const CASES=[
  {title:'ตอบผิด · ตัวเลือกสลับลำดับ',answer:'MCQ:1',type:'mcq',correct:false},
  {title:'ตอบถูก · มีทั้งป้ายคำตอบของคุณและเฉลย',answer:'MCQ:4',type:'mcq',correct:true},
  {title:'เว้นว่าง · ไม่ได้ตอบข้อนี้',answer:null,type:'mcq',correct:false},
  {title:'คำตอบแบบเก่าที่บันทึกเป็นข้อความ',answer:'2 เท่า',type:'mcq',correct:false},
  {title:'คำตอบตัวเลข',answer:'12',type:'written',correct:false},
  {title:'ถูก–ผิดแบบชุด',answer:'{"answers":["true","false"]}',type:'true_false',correct:false},
  {title:'เรียงลำดับ',answer:'["second","first"]',type:'ordering',correct:false},
  {title:'คำตอบเขียนอธิบาย · รอครูตรวจ',answer:'นักเรียนเขียนอธิบายหลักการของแรงและการเคลื่อนที่',type:'essay',correct:null},
]

/** Same summary/review renderer as the protected result route, synthetic only. */
export default async function SubmissionResultLab({searchParams}:{searchParams:Promise<{scenario?:string}>}){
  if(!isExamScreenLabEnabled(process.env)) notFound()
  const hidden=(await searchParams).scenario==='hidden'
  const watermark=buildSolutionWatermark({full_name:'',prefix:'เด็กชาย',first_name:'ทดสอบ',last_name:'เรียนรู้ (ข้อมูลจำลอง)'},{student_code:'00007',grade_level:'ม.4',section_number:1,class_number:7},new Date().toISOString())
  return <ShellClient user={{id:'qa-student',email:'preview@example.invalid',full_name:watermark.name,role:'student'}} initialUnreadCount={0} notificationsEnabled={false}>
    <div className="max-w-3xl space-y-4">
      <p className="text-xs text-muted-foreground">ข้อมูลจำลอง · ไม่อ่านหรือเขียนคำตอบในระบบ</p>
      {!hidden&&<SolutionWatermark data={watermark}/>}
      <SubmissionScoreSummary visible={!hidden} score={1} maxScore={CASES.length} percentage={Math.round(100/CASES.length)} passed={false} threshold="50%" counts={hidden?null:{correct:1,wrong:CASES.length-2,pending:1}} submittedAt="14 ต.ค. 2569 14:07" strategy={null}>
        <Button size="sm" variant="outline" render={<Link href="/exam-screen-lab/student-dashboard"/>}>กลับไปห้องเรียน</Button>
      </SubmissionScoreSummary>
      {!hidden&&<section className="space-y-3"><h2 className="font-semibold">ตรวจเฉลยทีละข้อ</h2>{CASES.map((item,i)=><Card key={i} padding="md" className="space-y-3" data-review-question>
        <h3 className="text-sm font-semibold">ข้อ {i+1} · {item.title}</h3>
        <QuestionText text={item.type==='mcq'?'นักเรียนเลือกตัวเลือกใดจากโจทย์การเคลื่อนที่แบบหมุน?':'หาขนาดของแรงที่ทำให้วัตถุเคลื่อนที่'} className="text-sm text-muted-foreground"/>
        <SubmissionAnswerReview studentAnswer={item.answer} correctAnswer={item.type==='mcq'?'MCQ:4':item.type==='true_false'?'TF:["true","true"]':item.type==='ordering'?'ORDER:["first","second"]':item.type==='essay'?null:'10'} isCorrect={item.correct} answerParts={null} answerUnit={item.type==='written'?'N':null} questionType={item.type} extraData={item.type==='ordering'?{items:[{id:'first',text:'เริ่มต้น'},{id:'second',text:'ถัดไป'}]}:undefined} mcqOptions={item.type==='mcq'?OPTIONS:null}/>
      </Card>)}</section>}
    </div>
  </ShellClient>
}
