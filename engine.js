export function createBracket(players) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);

  const matches = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    if (!shuffled[i + 1]) break;

    matches.push({
      id: crypto.randomUUID(),
      a: shuffled[i],
      b: shuffled[i + 1],
      votesA: 0,
      votesB: 0,
      winner: null,
      done: false
    });
  }

  return matches;
}

export function vote(match, side) {
  if (match.done) return;

  if (side === "A") match.votesA++;
  if (side === "B") match.votesB++;

  if (match.votesA + match.votesB >= 10) {
    match.done = true;
    match.winner = match.votesA >= match.votesB ? match.a : match.b;
  }
}
