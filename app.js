let state;

function init() {
  state = loadState();

  if (!state) {
    state = {
      season: 1,
      round: 1,
      players: [],
      rounds: [],
      currentRoundIndex: 0
    };
  }

  if (state.players.length > 0 && state.rounds.length === 0) {
    generateRound();
  }

  saveState(state);
  render();
}

function generateRound() {
  const groups = createGroups(state.players, 4);

  state.rounds.push({
    round: state.round,
    groups
  });

  state.currentRoundIndex = state.rounds.length - 1;
}

function nextRound() {
  state.round++;
  generateRound();
  saveState(state);
  render();
}

function registerVote(groupId, matchIndex, side) {
  const round = state.rounds[state.currentRoundIndex];
  const match = round.groups[groupId].matches[matchIndex];

  vote(match, side);

  saveState(state);
  render();
}
