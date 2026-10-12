/**
 * The teacher's student-view preview intentionally exposes only the home
 * destination in the app sidebar. Keep the match exact so ordinary assignment
 * pages and nested tools retain their normal navigation.
 */
export function isAssignmentStudentPreviewPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  return segments.length === 3
    && segments[0] === 'assignments'
    && segments[2] === 'preview'
}
