const STATE_KEY = "tournament_v3";

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadState() {
  return JSON.parse(localStorage.getItem(STATE_KEY)) || null;
}

function resetState() {
  localStorage.removeItem(STATE_KEY);
}
