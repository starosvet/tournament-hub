let state;
let players;

async function init() {
  players = await (await fetch("data.json")).json();

  state = loadState();

  if (!state) {
    state = {
      round: 1,
      startTime: Date.now(),
      matches: generatePairs(players),
      currentMatch: 0,
      finishedMatches: []
    };
  }

  saveState(state);
  render();
}

function nextMatch() {
  state.currentMatch++;

  if (state.currentMatch >= state.matches.length) {
    endRound();
  }

  saveState(state);
  render();
}

function endRound() {
  const history = loadHistory();

  const winner = state.matches
    .map(m => m.winner)
    .filter(Boolean);

  history.push({
    round: state.round,
    matches: state.matches,
    winners: winner,
    date: new Date().toISOString()
  });

  saveHistory(history);

  state.round++;
  state.currentMatch = 0;
  state.matches = generatePairs(players);
  state.startTime = Date.now();
}

function handleVote(choice) {
  let match = state.matches[state.currentMatch];
  vote(match, choice);

  if (match.done) nextMatch();

  saveState(state);
  render();
}
