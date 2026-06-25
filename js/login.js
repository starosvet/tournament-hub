/* ============================================================
   Tournament Hub — Login Page Logic (FIXED v2 — safe OAuth redirect, no race conditions)
   ============================================================ */

(function () {
  'use strict';

  let isRegisterMode = false;
  let initDone = false;

  /* ==========================================================
     UI HELPERS
     ========================================================== */
  function showError(msg) {
    const el = document.getElementById("loginError");
    if (el) {
      el.textContent = msg;
      el.style.display = msg ? "block" : "none";
    }
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.textContent = loading ? "⏳ Загрузка..." : btn.dataset.originalText;
  }

  function toast(message) {
    const existing = document.getElementById("th-toast-login");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.id = "th-toast-login";
    el.textContent = String(message ?? "");
    el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:12px 16px;border-radius:12px;background:rgba(17,24,39,0.95);color:#fff;font:14px/1.4 system-ui,sans-serif;z-index:99999;max-width:min(92vw,680px);box-shadow:0 10px 30px rgba(0,0,0,.28);";
    document.body.appendChild(el);
    setTimeout(() => { if (el.isConnected) el.remove(); }, 2200);
  }

  /* ==========================================================
     EMAIL/PASSWORD AUTH
     ========================================================== */
  async function doLogin() {
    const email = document.getElementById("loginEmail")?.value.trim();
    const password = document.getElementById("loginPassword")?.value;
    const username = document.getElementById("loginUsername")?.value.trim();
    const btn = document.getElementById("loginBtn");

    if (!email || !password) {
      showError("Введите email и пароль");
      return;
    }

    setLoading(btn, true);
    showError("");

    try {
      if (isRegisterMode) {
        if (!username) {
          showError("Введите никнейм");
          setLoading(btn, false);
          return;
        }
        if (password.length < 6) {
          showError("Пароль минимум 6 символов");
          setLoading(btn, false);
          return;
        }

        const result = await Auth.register(username, password, email);
        if (result.success) {
          toast("✅ Аккаунт создан! Вход выполнен.");
          redirectAfterLogin();
        } else {
          showError(result.error || "Ошибка регистрации");
        }
      } else {
        const result = await Auth.login(email, password);
        if (result.success) {
          toast("✅ Вход выполнен!");
          redirectAfterLogin();
        } else {
          showError(result.error || "Неверный email или пароль");
        }
      }
    } catch (e) {
      showError("Ошибка: " + e.message);
    } finally {
      setLoading(btn, false);
    }
  }

  /* ==========================================================
     GOOGLE OAUTH
     ========================================================== */
  async function doGoogleLogin() {
    const btn = document.getElementById("googleBtn");
    setLoading(btn, true);

    try {
      if (!window.TH) {
        showError("Supabase не загружен. Перезагрузите страницу.");
        return;
      }

      const { data, error } = await window.TH.signInWithProvider('google');
      if (error) throw error;
      // Редирект произойдёт автоматически от Supabase
    } catch (e) {
      showError("Ошибка Google: " + e.message);
      setLoading(btn, false);
    }
  }

  /* ==========================================================
     REDIRECT AFTER LOGIN
     ========================================================== */
  function redirectAfterLogin() {
    // FIX: безопасный редирект с fallback
    let basePath = '';
    try {
      basePath = window.TH?.getBasePath ? window.TH.getBasePath() : '';
    } catch (e) {
      basePath = '';
    }

    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    const target = returnTo || (basePath + '/index.html');

    setTimeout(() => {
      window.location.href = target;
    }, 800);
  }

  /* ==========================================================
     TOGGLE LOGIN/REGISTER
     ========================================================== */
  function toggleMode() {
    isRegisterMode = !isRegisterMode;
    const loginBtn = document.getElementById("loginBtn");
    const toggleBtn = document.getElementById("toggleBtn");
    const usernameLabel = document.getElementById("usernameLabel");
    const usernameInput = document.getElementById("loginUsername");

    if (isRegisterMode) {
      loginBtn.textContent = "📝 Создать аккаунт";
      toggleBtn.textContent = "🔐 Уже есть аккаунт? Войти";
      if (usernameLabel) usernameLabel.style.display = "block";
      if (usernameInput) usernameInput.style.display = "block";
    } else {
      loginBtn.textContent = "🔐 Войти";
      toggleBtn.textContent = "📝 Создать аккаунт";
      if (usernameLabel) usernameLabel.style.display = "none";
      if (usernameInput) usernameInput.style.display = "none";
    }
    showError("");
  }

  /* ==========================================================
     CLEAR DATA
     ========================================================== */
  function doClearData() {
    if (!confirm("ВЫ УВЕРЕНЫ? Это удалит ВСЕ локальные данные сайта!")) return;
    if (prompt('Введите "DELETE" для подтверждения:') !== "DELETE") return;

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('th_') || key === 'tournament_hub_db')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    toast("💥 Данные очищены. Перезагрузка...");
    setTimeout(() => location.reload(), 1500);
  }

  /* ==========================================================
     HANDLE OAUTH CALLBACK
     ========================================================== */
  async function handleOAuthCallback() {
    // FIX: Supabase с detectSessionInUrl: true сам обработает callback,
    // но мы проверяем, не пришли ли мы сюда после OAuth
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      // Supabase уже обработал токен, ждём инициализации
      let attempts = 0;
      const checkSession = setInterval(async () => {
        attempts++;
        if (window.TH) {
          try {
            const session = await window.TH.getSession();
            if (session?.user) {
              clearInterval(checkSession);
              await DB.syncSupabaseUser();
              toast("✅ Вход через Google выполнен!");
              redirectAfterLogin();
            }
          } catch (e) {
            // ещё не готово
          }
        }
        if (attempts > 30) {
          clearInterval(checkSession);
          showError("Ошибка обработки OAuth. Попробуйте войти снова.");
        }
      }, 200);
    }
  }

  /* ==========================================================
     INIT
     ========================================================== */
  function init() {
    if (initDone) return;
    initDone = true;

    // Сначала проверяем OAuth callback
    handleOAuthCallback();

    const loginBtn = document.getElementById("loginBtn");
    const toggleBtn = document.getElementById("toggleBtn");
    const googleBtn = document.getElementById("googleBtn");
    const clearBtn = document.getElementById("clearBtn");

    if (loginBtn) loginBtn.addEventListener("click", doLogin);
    if (toggleBtn) toggleBtn.addEventListener("click", toggleMode);
    if (googleBtn) googleBtn.addEventListener("click", doGoogleLogin);
    if (clearBtn) clearBtn.addEventListener("click", doClearData);

    document.getElementById("loginEmail")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    });
    document.getElementById("loginPassword")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    });
    document.getElementById("loginUsername")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    });

    // FIX: Если пользователь уже авторизован — редирект
    // НО только если это не OAuth callback (иначе race condition)
    if (!window.location.hash.includes('access_token')) {
      setTimeout(() => {
        DB.getCurrentUser().then(user => {
          if (user && !window.location.search.includes('error')) {
            redirectAfterLogin();
          }
        }).catch(() => {});
      }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
