/**
 * Keep the order a teacher has arranged, discard assignments that no longer
 * exist, and append newly assigned work in the server-provided default order.
 */
export function reconcileAssignmentOrder(currentIds: string[], defaultIds: string[]): string[] {
  const available = new Set(defaultIds)
  const seen = new Set<string>()
  const next: string[] = []

  for (const id of currentIds) {
    if (!available.has(id) || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  for (const id of defaultIds) {
    if (seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }

  return next
}

/**
 * Move one of the currently visible assignment columns while leaving columns
 * hidden by a filter in their existing slots. This makes combined type and
 * category filters safe to use while arranging the table.
 */
export function moveVisibleAssignmentColumn(
  allIds: string[],
  visibleIds: string[],
  activeId: string,
  overId: string,
): string[] {
  const from = visibleIds.indexOf(activeId)
  const to = visibleIds.indexOf(overId)
  if (from < 0 || to < 0 || from === to) return allIds

  const movedVisible = [...visibleIds]
  const [moved] = movedVisible.splice(from, 1)
  movedVisible.splice(to, 0, moved)

  const visible = new Set(visibleIds)
  let visibleIndex = 0
  return allIds.map(id => visible.has(id) ? movedVisible[visibleIndex++] : id)
}

