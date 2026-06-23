const ADMIN_KEY = "admin-v5-key";

function login() {
  const val = document.getElementById("adminkey").value;

  if (val === ADMIN_KEY) {
    localStorage.setItem("admin", "1");
    location.reload();
  } else {
    alert("Wrong key");
  }
}

function isAdmin() {
  return localStorage.getItem("admin") === "1";
}

function importPlayers() {
  const raw = document.getElementById("importBox").value;

  state.players = parseImport(raw);

  saveState(state);
  alert("Imported " + state.players.length);
}
