import {
  BookOpen,
  CalendarDays,
  ChartColumnIncreasing,
  ClipboardList,
  GraduationCap,
  Grid3x3,
  LayoutDashboard,
  UserPlus,
  Users,
} from 'lucide-react'
import type { ClassroomNavigationKey } from '@/lib/classroom-navigation'

export const CLASSROOM_NAVIGATION_ICONS: Record<ClassroomNavigationKey, typeof Users> = {
  overview: LayoutDashboard,
  assignments: BookOpen,
  scores: ClipboardList,
  ability: ChartColumnIncreasing,
  students: Users,
  homeroom: CalendarDays,
  groups: Grid3x3,
  invite: UserPlus,
  coteachers: GraduationCap,
}
