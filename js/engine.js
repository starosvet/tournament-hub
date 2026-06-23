function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function createMatches(players) {
  let result = [];
  let p = shuffle([...players]);
  for (let i = 0; i < p.length; i += 2) {
    if (!p[i + 1]) break;
    result.push({
      a: p[i],
      b: p[i + 1],
      votesA: 0,
      votesB: 0,
      winner: null,
      done: false
    });
  }
  return result;
}
