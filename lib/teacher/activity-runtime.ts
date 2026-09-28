export function matchPair(
  selectedLeftId: string | undefined,
  rightId: string,
  matched: readonly string[],
) {
  if (!selectedLeftId) return { matched: [...matched], correct: false };
  return selectedLeftId === rightId
    ? { matched: [...matched, rightId], correct: true }
    : { matched: [...matched], correct: false };
}
export function placeSortItem(
  placements: Readonly<Record<string, string>>,
  itemId: string,
  categoryId: string,
) {
  return { ...placements, [itemId]: categoryId };
}
export function isSortCorrect(
  items: readonly { id: string; categoryId: string }[],
  placements: Readonly<Record<string, string>>,
) {
  return items.every((item) => placements[item.id] === item.categoryId);
}
export function moveOrderedItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
export function isOrderCorrect(items: readonly { id: string }[], correctOrder: readonly string[]) {
  return items.every((item, index) => item.id === correctOrder[index]);
}
export function removeWheelEntry<T extends { id: string }>(entries: readonly T[], id: string) {
  return entries.filter((entry) => entry.id !== id);
}
export function adjustTeamScore(
  scores: readonly [number, number],
  team: 0 | 1,
  delta: number,
): [number, number] {
  const next: [number, number] = [...scores];
  next[team] = Math.max(0, next[team] + delta);
  return next;
}
