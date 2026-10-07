/**
 * Keep the order a teacher has arranged, discard assignments that no longer
 * exist, and append newly assigned work in the server-provided default order.
 */
export function reconcileOrderedIds(currentIds: string[], defaultIds: string[]): string[] {
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

export const reconcileAssignmentOrder = reconcileOrderedIds

/** Move one item in an ordered list. Invalid drops preserve the same array. */
export function moveOrderedItem(
  orderedIds: string[],
  activeId: string,
  overId: string,
): string[] {
  const from = orderedIds.indexOf(activeId)
  const to = orderedIds.indexOf(overId)
  if (from < 0 || to < 0 || from === to) return orderedIds

  const next = [...orderedIds]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
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

/**
 * Move a visible assignment directly after another visible assignment while
 * leaving rows hidden by the current filter in their existing slots.
 * Category drop zones use this to append an assignment to the visible end of
 * a group without disturbing work the teacher cannot currently see.
 */
export function moveVisibleAssignmentAfter(
  allIds: string[],
  visibleIds: string[],
  activeId: string,
  afterId: string,
): string[] {
  if (activeId === afterId || !visibleIds.includes(activeId) || !visibleIds.includes(afterId)) return allIds

  const movedVisible = visibleIds.filter(id => id !== activeId)
  const target = movedVisible.indexOf(afterId)
  if (target < 0) return allIds
  movedVisible.splice(target + 1, 0, activeId)

  if (movedVisible.every((id, index) => id === visibleIds[index])) return allIds

  const visible = new Set(visibleIds)
  let visibleIndex = 0
  return allIds.map(id => visible.has(id) ? movedVisible[visibleIndex++] : id)
}
