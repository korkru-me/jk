'use client'

import Link from 'next/link'
import { Users, BookOpen, TrendingUp, Check, Pin, PinOff } from 'lucide-react'
import { BarChart, Bar, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import type { Classroom } from '@/lib/types'

const GRADIENTS = [
  'from-blue-500 to-violet-500',
  'from-emerald-500 to-teal-500',
  'from-orange-400 to-rose-500',
  'from-cyan-500 to-blue-500',
  'from-purple-500 to-pink-500',
  'from-amber-400 to-orange-500',
]

const COVER_EMOJIS = ['⚛️', '🔭', '⚡', '🌊', '🧲', '🔬']

function seedRand(str: string, i: number) {
  const h = [...str].reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
  return (((h * (i + 3) * 2654435761) >>> 0) % 100) / 100
}

function getPisaData(classroomId: string) {
  return [
    { name: 'อธิบายปรากฏการณ์', score: Math.round(55 + seedRand(classroomId, 0) * 35) },
    { name: 'ออกแบบการสืบเสาะ', score: Math.round(45 + seedRand(classroomId, 1) * 40) },
    { name: 'แปลความหมายข้อมูล', score: Math.round(50 + seedRand(classroomId, 2) * 38) },
  ]
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded-lg shadow-lg">
      <p className="font-semibold">{payload[0].payload.name}</p>
      <p>{payload[0].value}%</p>
    </div>
  )
}

interface Props {
  classroom: Classroom
  studentCount: number
  assignmentCount: number
  index: number
  isSelecting?: boolean
  isSelected?: boolean
  onToggle?: () => void
  onTogglePin?: () => void
}

export function ClassroomCard({
  classroom, studentCount, assignmentCount, index,
  isSelecting = false, isSelected = false, onToggle, onTogglePin,
}: Props) {
  const isPinned = !!classroom.pinned_at
  const gradient = GRADIENTS[index % GRADIENTS.length]
  const emoji = COVER_EMOJIS[index % COVER_EMOJIS.length]
  const pisaData = getPisaData(classroom.id)
  const avgScore = Math.round(pisaData.reduce((a, d) => a + d.score, 0) / pisaData.length)

  const cardBody = (
    <>
      {/* Cover */}
      <div className={`h-20 bg-gradient-to-br ${gradient} relative flex items-center justify-between px-5`}>
        {/* Checkbox overlay in selection mode */}
        {isSelecting && (
          <div
            className={cn(
              'absolute top-2.5 left-2.5 w-6 h-6 rounded-md border-2 border-white flex items-center justify-center transition-colors z-10',
              isSelected ? 'bg-white' : 'bg-white/20'
            )}
          >
            {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 stroke-[3]" />}
          </div>
        )}
        <div className={isSelecting ? 'ml-8' : ''}>
          <p className="text-white font-bold text-lg leading-tight">{classroom.name}</p>
          {classroom.description && (
            <p className="text-white/70 text-xs mt-0.5 truncate max-w-[180px]">{classroom.description}</p>
          )}
        </div>
        <span className="text-3xl">{emoji}</span>
        {!isSelecting && onTogglePin && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin() }}
            title={isPinned ? 'เลิกปักหมุด' : 'ปักหมุดไว้บนสุด'}
            className={cn(
              'absolute top-2.5 right-2.5 w-7 h-7 rounded-lg flex items-center justify-center transition-colors z-10',
              isPinned ? 'bg-white text-amber-500' : 'bg-white/15 text-white/70 hover:bg-white/25 hover:text-white'
            )}
          >
            {isPinned ? <Pin className="w-3.5 h-3.5 fill-current" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
        )}
        <div className={cn(
          'absolute inset-0 transition-colors',
          isSelecting && isSelected ? 'bg-blue-600/15' : 'bg-black/0 group-hover:bg-black/5'
        )} />
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Users className="w-3.5 h-3.5 text-gray-400" />
            <span className="font-semibold text-gray-900">{studentCount}</span>
            <span className="text-xs">คน</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <BookOpen className="w-3.5 h-3.5 text-gray-400" />
            <span className="font-semibold text-gray-900">{assignmentCount}</span>
            <span className="text-xs">ชุดข้อสอบ</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-sm font-bold text-emerald-600">{avgScore}%</span>
          </div>
          {isPinned && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <Pin className="w-2.5 h-2.5 fill-current" /> ปักหมุด
            </span>
          )}
        </div>

        <div className="mb-3">
          <p className="text-[10px] text-gray-400 mb-1.5 font-medium uppercase tracking-wide">ทักษะ PISA</p>
          <ResponsiveContainer width="100%" height={52}>
            <BarChart data={pisaData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barSize={18}>
              <Bar dataKey="score" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between mt-1">
            {pisaData.map((d) => (
              <p key={d.name} className="text-[9px] text-gray-400 text-center" style={{ width: '33%' }}>
                {d.score}%
              </p>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div>
            <p className="text-[10px] text-gray-400">รหัสห้องเรียน</p>
            <p className="font-mono font-bold text-gray-800 tracking-widest text-sm">{classroom.class_code}</p>
          </div>
          {!isSelecting && (
            <span className="text-xs text-blue-600 font-medium group-hover:underline">จัดการ →</span>
          )}
        </div>
      </div>
    </>
  )

  if (isSelecting) {
    return (
      <div
        onClick={onToggle}
        className={cn(
          'group cursor-pointer bg-white rounded-2xl ring-1 overflow-hidden transition-all duration-150',
          isSelected ? 'ring-2 ring-blue-500 shadow-md' : 'ring-black/5 hover:ring-blue-200'
        )}
      >
        {cardBody}
      </div>
    )
  }

  return (
    <Link
      href={`/classrooms/${classroom.id}`}
      className={cn(
        'group block bg-white rounded-2xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden',
        isPinned ? 'ring-2 ring-amber-300' : 'ring-1 ring-black/5'
      )}
    >
      {cardBody}
    </Link>
  )
}
