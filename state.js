const STATE_KEY = "th_v5_state";
const HISTORY_KEY = "th_v5_history";

function loadState() {
  return JSON.parse(localStorage.getItem(STATE_KEY));
}

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadHistory() {
  return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}
