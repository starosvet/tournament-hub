function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// 🎯 средний хаос режим
function generateRound(players) {
  let list = shuffle(players);

  let matches = [];

  for (let i = 0; i < list.length; i += 2) {

    let roll = Math.random();

    // 🔥 20% шанс 3-way
    if (roll < 0.2 && i + 2 < list.length) {
      matches.push({
        type: "3way",
        players: [list[i], list[i+1], list[i+2]]
      });
      i += 1;
    }

    // 🎲 60% норм 1v1
    else if (roll < 0.8) {
      matches.push({
        type: "1v1",
        players: [list[i], list[i+1]]
      });
    }

    // ⚡ 20% “хаос матч” (разброс силы)
    else {
      let sorted = [...players].sort((a,b)=>a.elo-b.elo);
      matches.push({
        type: "chaos",
        players: [
          sorted[0],
          sorted[sorted.length - 1]
        ]
      });
    }
  }

  return matches;
}

// 🧠 Elo система
function updateElo(winner, loser) {
  winner.elo += 20;
  loser.elo -= 10;

  winner.wins++;
  loser.losses++;
}
