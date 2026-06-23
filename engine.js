function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function generatePairs(players) {
  const list = shuffle(players);
  const pairs = [];

  for (let i = 0; i < list.length; i += 2) {
    if (!list[i + 1]) break;

    pairs.push({
      a: list[i],
      b: list[i + 1],
      votesA: 0,
      votesB: 0,
      done: false,
      winner: null
    });
  }

  return pairs;
}

function vote(match, choice) {
  if (choice === "A") match.votesA++;
  if (choice === "B") match.votesB++;

  if (match.votesA + match.votesB >= 10) {
    match.done = true;
    match.winner = match.votesA >= match.votesB ? match.a : match.b;
  }

  return match;
}
