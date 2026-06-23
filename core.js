let state = loadState() || {
  round: 1,
  maxRounds: 10,
  players: PLAYERS,
  matches: generateRound(PLAYERS),
  currentMatch: 0
};

function nextMatch() {
  state.currentMatch++;

  if (state.currentMatch >= state.matches.length) {
    nextRound();
  }

  saveState(state);
  render();
}

function nextRound() {
  state.round++;

  if (state.round > state.maxRounds) {
    alert("🏆 Season finished!");
    resetState();
    location.reload();
    return;
  }

  state.matches = generateRound(state.players);
  state.currentMatch = 0;
}

function vote(winnerName, loserName) {
  let w = state.players.find(p => p.name === winnerName);
  let l = state.players.find(p => p.name === loserName);

  updateElo(w, l);
  nextMatch();
}
