export function computeTop(players) {
  return [...players]
    .sort((a, b) => (b.wins || 0) - (a.wins || 0))
    .slice(0, 10);
}
