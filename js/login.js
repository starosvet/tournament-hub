/* ============================================================
   Tournament Hub — Login Page Controller (FIXED v4 — safe OAuth loops)
   ============================================================ */
(function () {
  'use strict';

  let isRegisterMode = false;

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
    btn.textContent = loading ? "⏳ Подождите..." : btn.dataset.originalText;
  }

  function redirectAfterLogin() {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("redirect") || "index.html";
    window.location.href = target;
  }

  async function handleFormSubmit() {
    showError("");
    const emailEl = document.getElementById("loginEmail");
    const passEl = document.getElementById("loginPassword");
    const userEl = document.getElementById("loginUsername");
    const btn = document.getElementById("loginBtn");

    const email = emailEl ? emailEl.value.trim() : "";
    const password = passEl ? passEl.value : "";
    const username = userEl ? userEl.value.trim() : "";

    if (!email || !password) {
      showError("Пожалуйста, заполните поля Email и Пароль");
      return;
    }

    setLoading(btn, true);

    if (isRegisterMode) {
      if (!username) {
        showError("Необходимо указать никнейм для создания аккаунта");
        setLoading(btn, false);
        return;
      }
      
      const res = await window.Auth.register(username, password, email);
      if (!res.success) {
        showError(res.error || "Не удалось создать аккаунт.");
        setLoading(btn, false);
      } else {
        alert("Регистрация завершена! Проверьте почту для подтверждения или выполните вход.");
        toggleFormMode();
        setLoading(btn, false);
      }
    } else {
      const res = await window.Auth.login(email, password);
      if (!res.success) {
        showError(res.error || "Неверный логин или пароль.");
        setLoading(btn, false);
      } else {
        redirectAfterLogin();
      }
    }
  }

  async function handleGoogleOAuth() {
    showError("");
    const btn = document.getElementById("googleBtn");
    setLoading(btn, true);
    try {
      const { error } = await window.TH.signInWithProvider('google');
      if (error) throw error;
    } catch (e) {
      showError("Ошибка аутентификации через Google: " + e.message);
      setLoading(btn, false);
    }
  }

  function toggleFormMode() {
    isRegisterMode = !isRegisterMode;
    const title = document.getElementById("loginTitle");
    const btn = document.getElementById("loginBtn");
    const toggle = document.getElementById("toggleBtn");
    const usernameContainer = document.getElementById("usernameContainer");

    if (title) title.textContent = isRegisterMode ? "📝 Регистрация профиля" : "🔐 Вход в систему";
    if (btn) btn.textContent = isRegisterMode ? "🚀 Зарегистрироваться" : "🔐 Войти";
    if (toggle) toggle.textContent = isRegisterMode ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Создать профиль";
    if (usernameContainer) usernameContainer.style.display = isRegisterMode ? "block" : "none";
    showError("");
  }

  function handleOAuthCallback() {
    // Сканируем URL на наличие хэш-токенов от Google OAuth
    if (window.location.hash.includes('access_token') || window.location.hash.includes('id_token')) {
      showError("Синхронизация профиля Google...");
      let ticks = 0;
      const oauthCheck = setInterval(async () => {
        const user = await window.TH.getCurrentUser();
        if (user) {
          clearInterval(oauthCheck);
          await window.DB.setCurrentUser(user);
          redirectAfterLogin();
        }
        ticks++;
        if (ticks > 60) {
          clearInterval(oauthCheck);
          showError("Превышено время ожидания ответа от сессии Google. Попробуйте еще раз.");
        }
      }, 150);
    }
  }

  function bindEvents() {
    document.getElementById("loginBtn")?.addEventListener("click", handleFormSubmit);
    document.getElementById("toggleBtn")?.addEventListener("click", toggleFormMode);
    document.getElementById("googleBtn")?.addEventListener("click", handleGoogleOAuth);
    
    document.getElementById("clearCacheBtn")?.addEventListener("click", function() {
      if (confirm("Очистить кэш авторизации? Это сбросит зависшие сессии.")) {
        window.DB.clearAllLocalData();
        window.location.reload();
      }
    });

    const inputs = ["loginEmail", "loginPassword", "loginUsername"];
    inputs.forEach(id => {
      document.getElementById(id)?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleFormSubmit();
      });
    });
  }

  // Безопасный запуск строго после готовности глобальных скриптов
  document.addEventListener("DOMContentLoaded", function () {
    let readyAttempts = 0;
    const checkFormInit = setInterval(() => {
      if (window.TH && window.DB && window.Auth) {
        clearInterval(checkFormInit);
        handleOAuthCallback();
        bindEvents();

        // Если пользователь уже вошел и это не возврат от OAuth, уводим на главную
        if (!window.location.hash.includes('access_token')) {
          window.DB.getCurrentUser().then(user => {
            if (user) redirectAfterLogin();
          });
        }
      }
      readyAttempts++;
      if (readyAttempts > 40) {
        clearInterval(checkFormInit);
        console.error("Критические модулиTournament Hub не смогли загрузиться.");
      }
    }, 50);
  });
})();
