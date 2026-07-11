'use client'

import { Flame, Clock, Target, BookOpen, Zap, Star, Award, CheckCircle } from 'lucide-react'

interface Badge {
  id: string
  icon: React.ReactNode
  name: string
  desc: string
  earned: boolean
  color: string
}

interface StreakGamificationProps {
  completedCount: number
  avgPct: number | null
  classroomsCount: number
}

function computeStreak(completedCount: number): number {
  if (completedCount === 0) return 0
  if (completedCount >= 14) return 7
  if (completedCount >= 7) return Math.min(7, completedCount - 5)
  return Math.min(completedCount, 3)
}

function computeBadges(completedCount: number, avgPct: number | null): Badge[] {
  return [
    {
      id: 'on-time',
      icon: <Clock size={16} />,
      name: 'ตรงเวลา',
      desc: 'ส่งงาน 5 ชุดตรงเวลา',
      earned: completedCount >= 5,
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    },
    {
      id: 'perfect',
      icon: <Target size={16} />,
      name: 'แม่นยำ 100%',
      desc: 'ได้คะแนนเฉลี่ยสูงกว่า 90%',
      earned: avgPct !== null && avgPct >= 90,
      color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    },
    {
      id: 'reader',
      icon: <BookOpen size={16} />,
      name: 'นักอ่านตัวยง',
      desc: 'ทำข้อสอบครบ 10 ชุด',
      earned: completedCount >= 10,
      color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    },
    {
      id: 'streak-5',
      icon: <Zap size={16} />,
      name: 'สายฟ้า',
      desc: 'เข้าใช้งาน 5 วันติดต่อกัน',
      earned: completedCount >= 7,
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    },
    {
      id: 'star',
      icon: <Star size={16} />,
      name: 'ดาวเด่น',
      desc: 'คะแนนเฉลี่ยสูงกว่า 80%',
      earned: avgPct !== null && avgPct >= 80,
      color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    },
    {
      id: 'champion',
      icon: <Award size={16} />,
      name: 'แชมเปี้ยน',
      desc: 'ส่งงานครบ 20 ชุด',
      earned: completedCount >= 20,
      color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    },
  ]
}

const STREAK_DAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

export function StreakGamification({ completedCount, avgPct, classroomsCount }: StreakGamificationProps) {
  const streak = computeStreak(completedCount)
  const badges = computeBadges(completedCount, avgPct)
  const earnedBadges = badges.filter(b => b.earned)
  const unearnedBadges = badges.filter(b => !b.earned)

  return (
    <div className="space-y-4">
      {/* Streak bar */}
      <div className="bg-card border rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
              streak > 0 ? 'bg-orange-500/10' : 'bg-muted'
            }`}>
              🔥
            </div>
            {streak > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {streak}
              </span>
            )}
          </div>
          <div>
            <p className="font-semibold text-sm">
              {streak > 0 ? `${streak} วันติดต่อกัน!` : 'เริ่มต้นวันนี้!'}
            </p>
            <p className="text-xs text-muted-foreground">เข้าเรียนทุกวันเพื่อรักษาสถิติ</p>
          </div>
        </div>

        {/* Day dots */}
        <div className="flex items-center gap-1.5 sm:ml-auto">
          {STREAK_DAYS.map((day, i) => (
            <div key={day} className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                i < streak
                  ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/40'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {i < streak ? <CheckCircle size={14} /> : <span className="text-[10px] font-medium">{day}</span>}
              </div>
              <span className="text-[9px] text-muted-foreground">{day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Badges */}
      <div className="bg-card border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-sm flex items-center gap-2">
            <Award size={15} className="text-amber-500" />
            เหรียญตราที่ได้รับ
          </p>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {earnedBadges.length}/{badges.length}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {earnedBadges.map(badge => (
            <div
              key={badge.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${badge.color}`}
              title={badge.desc}
            >
              {badge.icon}
              {badge.name}
            </div>
          ))}
          {unearnedBadges.map(badge => (
            <div
              key={badge.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-border text-muted-foreground opacity-50"
              title={`🔒 ${badge.desc}`}
            >
              <span className="grayscale">{badge.icon}</span>
              {badge.name}
            </div>
          ))}
        </div>

        {unearnedBadges.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            🔒 ปลดล็อก <span className="font-medium text-foreground">{unearnedBadges[0].name}</span>: {unearnedBadges[0].desc}
          </p>
        )}
      </div>
    </div>
  )
}
