import { login, isAdmin } from "./auth.js";
import { parseImport } from "./import.js";
import { loadState, saveState } from "./state.js";

let state = loadState();

window.login = function () {
  const key = document.getElementById("key").value;

  if (login(key)) {
    document.getElementById("login").style.display = "none";
    document.getElementById("panel").style.display = "block";
  }
};

window.importPlayers = function () {
  const text = document.getElementById("import").value;
  state.players = parseImport(text);
  saveState(state);
};

window.nextRound = function () {
  state.round++;
  saveState(state);
};
