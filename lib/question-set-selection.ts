/** Selection is question-based: overlapping sets reflect the same picked ids. */
export function toggleQuestionSetSelection(selected: readonly string[], setIds: readonly string[], bankIds: ReadonlySet<string>) {
  const usable = [...new Set(setIds)].filter(id => bankIds.has(id))
  const picked = new Set(selected)
  const remove = usable.length > 0 && usable.every(id => picked.has(id))
  const members = new Set(usable)
  return remove ? selected.filter(id => !members.has(id)) : [...new Set([...selected, ...usable])]
}
