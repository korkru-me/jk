import { BookOpen, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface WrongQuestion {
  title: string
  questionText: string
}

interface StudyPathPanelProps {
  wrongQuestions: WrongQuestion[]
  totalQuestions: number
}

const TOPIC_MAP: Record<string, { label: string; topics: string[]; color: string }> = {
  กลศาสตร์: {
    label: 'กลศาสตร์',
    topics: ['กฎข้อที่ 1-3 ของนิวตัน', 'การเคลื่อนที่แบบต่างๆ', 'พลังงานและงาน', 'โมเมนตัมและการชน'],
    color: 'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300',
  },
  แรงเสียดทาน: {
    label: 'แรงเสียดทาน',
    topics: ['แรงเสียดทานสถิต', 'แรงเสียดทานจลน์', 'การหาค่าสัมประสิทธิ์'],
    color: 'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300',
  },
  คลื่น: {
    label: 'คลื่นและแสง',
    topics: ['สมบัติของคลื่น', 'การหักเหและการสะท้อน', 'คลื่นแม่เหล็กไฟฟ้า'],
    color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300',
  },
  แสง: {
    label: 'แสงและทัศนศาสตร์',
    topics: ['การสะท้อนของแสง', 'การหักเหของแสง', 'เลนส์และกระจก'],
    color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300',
  },
  ไฟฟ้า: {
    label: 'ไฟฟ้าและแม่เหล็ก',
    topics: ['กฎของโอห์ม', 'วงจรไฟฟ้า', 'สนามแม่เหล็กไฟฟ้า'],
    color: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-300',
  },
  อนุภาค: {
    label: 'ฟิสิกส์อนุภาค',
    topics: ['Standard Model', 'แรงพื้นฐาน 4 แรง', 'อนุภาคมูลฐาน'],
    color: 'bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-300',
  },
  โมเมนตัม: {
    label: 'โมเมนตัมและแรงกระตุ้น',
    topics: ['กฎการอนุรักษ์โมเมนตัม', 'การชนแบบยืดหยุ่น', 'การชนแบบไม่ยืดหยุ่น'],
    color: 'bg-teal-500/10 border-teal-500/20 text-teal-700 dark:text-teal-300',
  },
  พลังงาน: {
    label: 'พลังงานและงาน',
    topics: ['งานและกำลัง', 'พลังงานกล', 'กฎการอนุรักษ์พลังงาน', 'หาพื้นที่ใต้กราฟ (v-t)'],
    color: 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300',
  },
  ความร้อน: {
    label: 'ความร้อนและอุณหพลศาสตร์',
    topics: ['กฎข้อที่ 1-2 ของอุณหพลศาสตร์', 'การถ่ายเทความร้อน', 'แก๊สอุดมคติ'],
    color: 'bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-300',
  },
}

function extractTopics(questions: WrongQuestion[]): string[] {
  const found = new Set<string>()
  for (const q of questions) {
    const combined = `${q.title} ${q.questionText}`.toLowerCase()
    for (const key of Object.keys(TOPIC_MAP)) {
      if (combined.includes(key.toLowerCase())) {
        found.add(key)
      }
    }
  }
  if (found.size === 0 && questions.length > 0) found.add('กลศาสตร์')
  return [...found]
}

export function StudyPathPanel({ wrongQuestions, totalQuestions }: StudyPathPanelProps) {
  const correctCount = totalQuestions - wrongQuestions.length

  if (wrongQuestions.length === 0) {
    return (
      <div className="bg-card border rounded-2xl p-6 text-center">
        <CheckCircle2 size={40} className="text-green-500 mx-auto mb-3" />
        <p className="font-semibold text-green-700 dark:text-green-400">ยอดเยี่ยม! ตอบถูกทั้งหมด</p>
        <p className="text-sm text-muted-foreground mt-1">ไม่มีหัวข้อที่ต้องทบทวนในชุดนี้</p>
      </div>
    )
  }

  const weakTopics = extractTopics(wrongQuestions)

  return (
    <div className="bg-card border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b bg-amber-500/5">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <p className="font-semibold text-sm">เส้นทางการซ่อมเสริม</p>
          <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            ตอบผิด {wrongQuestions.length}/{totalQuestions} ข้อ
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="px-5 py-3 border-b">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all"
              style={{ width: `${(correctCount / totalQuestions) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            <span className="font-medium text-green-600 dark:text-green-400">{correctCount}</span>/{totalQuestions} ถูก
          </span>
        </div>
      </div>

      {/* Weak topics */}
      <div className="p-5 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">หัวข้อที่ควรทบทวน</p>
        {weakTopics.map(topicKey => {
          const info = TOPIC_MAP[topicKey]
          if (!info) return null
          return (
            <div key={topicKey} className={`border rounded-xl p-4 ${info.color}`}>
              <div className="flex items-start gap-3">
                <BookOpen size={15} className="mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">{info.label}</p>
                  <div className="mt-2 space-y-1">
                    {info.topics.map(topic => (
                      <div key={topic} className="flex items-center gap-1.5 text-xs opacity-85">
                        <ArrowRight size={11} />
                        <span>{topic}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* Wrong questions list */}
        <div className="mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">ข้อที่ตอบผิด</p>
          <div className="space-y-1.5">
            {wrongQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-2 text-xs bg-muted/50 rounded-lg px-3 py-2">
                <span className="shrink-0 text-destructive font-bold">✗</span>
                <span className="text-muted-foreground line-clamp-2">{q.title || q.questionText.slice(0, 80)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
