/* ============================================================
   Tournament Hub — Login Page Logic (OPTIMIZED v3 — reactive OAuth callbacks)
   ============================================================ */

(function () {
  'use strict';

  let isRegisterMode = false;
  let initDone = false;

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

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function redirectAfterLogin() {
    const target = getQueryParam("redirect") || "index.html";
    window.location.href = target;
  }

  async function doLogin() {
    showError("");
    const emailEl = document.getElementById("loginEmail");
    const passEl = document.getElementById("loginPassword");
    const userEl = document.getElementById("loginUsername");
    const btn = document.getElementById("loginBtn");

    const email = emailEl ? emailEl.value.trim() : "";
    const password = passEl ? passEl.value : "";
    const username = userEl ? userEl.value.trim() : "";

    if (!email || !password) {
      showError("Заполните Email и Пароль");
      return;
    }

    setLoading(btn, true);

    if (isRegisterMode) {
      if (!username) {
        showError("Введите никнейм для регистрации");
        setLoading(btn, false);
        return;
      }
      const res = await Auth.register(username, password, email);
      if (!res.success) {
        showError(res.error || "Ошибка регистрации");
        setLoading(btn, false);
      } else {
        alert("Регистрация успешна! Теперь вы можете войти.");
        toggleMode();
        setLoading(btn, false);
      }
    } else {
      const res = await Auth.login(email, password);
      if (!res.success) {
        showError(res.error || "Неверный логин или пароль");
        setLoading(btn, false);
      } else {
        redirectAfterLogin();
      }
    }
  }

  async function doGoogleLogin() {
    showError("");
    const btn = document.getElementById("googleBtn");
    setLoading(btn, true);
    try {
      const { error } = await window.TH.signInWithProvider('google');
      if (error) throw error;
    } catch (e) {
      showError("Ошибка Google Auth: " + e.message);
      setLoading(btn, false);
    }
  }

  function toggleMode() {
    isRegisterMode = !isRegisterMode;
    const title = document.getElementById("loginTitle");
    const btn = document.getElementById("loginBtn");
    const toggle = document.getElementById("toggleBtn");
    const userRow = document.getElementById("loginUsername");

    if (title) title.textContent = isRegisterMode ? "📝 Регистрация" : "🔐 Вход в систему";
    if (btn) btn.textContent = isRegisterMode ? "🚀 Создать аккаунт" : "🔐 Войти";
    if (toggle) toggle.textContent = isRegisterMode ? "У меня уже есть аккаунт" : "📝 Создать аккаунт";
    if (userRow) userRow.style.display = isRegisterMode ? "block" : "none";
    showError("");
  }

  function doClearData() {
    if (confirm("Вы уверены, что хотите очистить локальный кэш? Это исправит ошибки отображения.")) {
      DB.clearAllLocalData();
      alert("Данные успешно очищены!");
      window.location.reload();
    }
  }

  function handleOAuthCallback() {
    // Если в URL есть параметры сессии Supabase, дожидаемся обработки и редиректим
    if (window.location.hash.includes('access_token') || window.location.hash.includes('id_token')) {
      let checkTicks = 0;
      const oauthInterval = setInterval(async () => {
        const user = await DB.getCurrentUser();
        if (user) {
          clearInterval(oauthInterval);
          redirectAfterLogin();
        }
        checkTicks++;
        if (checkTicks > 50) clearInterval(oauthInterval); // Предохранитель таймаута
      }, 100);
    }
  }

  function init() {
    if (initDone) return;
    initDone = true;

    handleOAuthCallback();

    const loginBtn = document.getElementById("loginBtn");
    const toggleBtn = document.getElementById("toggleBtn");
    const googleBtn = document.getElementById("googleBtn");
    const clearBtn = document.getElementById("clearBtn");

    if (loginBtn) loginBtn.addEventListener("click", doLogin);
    if (toggleBtn) toggleBtn.addEventListener("click", toggleMode);
    if (googleBtn) googleBtn.addEventListener("click", doGoogleLogin);
    if (clearBtn) clearBtn.addEventListener("click", doClearData);

    const inputs = ["loginEmail", "loginPassword", "loginUsername"];
    inputs.forEach(id => {
      document.getElementById(id)?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doLogin();
      });
    });

    // Редирект авторизованного пользователя, если нет хэша OAuth
    if (!window.location.hash.includes('access_token')) {
      let attempts = 0;
      const checkAuthInit = setInterval(async () => {
        if (window.TH && window.TH.isReady) {
          clearInterval(checkAuthInit);
          const user = await DB.getCurrentUser();
          if (user && !window.location.search.includes('error')) {
            redirectAfterLogin();
          }
        }
        attempts++;
        if (attempts > 30) clearInterval(checkAuthInit);
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
