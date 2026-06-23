const STATE_KEY = "th_v6";

export function loadState() {
  return JSON.parse(localStorage.getItem(STATE_KEY)) || {
    season: 1,
    round: 1,
    players: [],
    rounds: [],
    log: [],
    users: []
  };
}

export function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}
