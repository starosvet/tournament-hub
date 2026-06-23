const ADMIN_KEY = "admin-v6-secret";

export function login(key) {
  if (key === ADMIN_KEY) {
    localStorage.setItem("admin", "1");
    return true;
  }
  return false;
}

export function isAdmin() {
  return localStorage.getItem("admin") === "1";
}

export function logout() {
  localStorage.removeItem("admin");
}
