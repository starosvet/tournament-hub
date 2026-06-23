function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function createMatches(players) {
  const list = shuffle(players);
  const matches = [];

  for (let i = 0; i < list.length; i += 2) {
    if (!list[i + 1]) break;

    matches.push({
      a: list[i],
      b: list[i + 1],
      votesA: 0,
      votesB: 0,
      winner: null,
      done: false
    });
  }

  return matches;
}

function createGroups(players, size = 4) {
  const shuffled = shuffle(players);
  const groups = [];

  for (let i = 0; i < shuffled.length; i += size) {
    groups.push({
      id: groups.length + 1,
      matches: createMatches(shuffled.slice(i, i + size))
    });
  }

  return groups;
}

function vote(match, side) {
  if (match.done) return;

  if (side === "A") match.votesA++;
  if (side === "B") match.votesB++;

  if (match.votesA + match.votesB >= 10) {
    match.done = true;
    match.winner = match.votesA >= match.votesB ? match.a : match.b;
  }
}
