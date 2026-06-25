/* ============================================================
   Login Page Logic (FIXED v3 — no OAuth loops, proper session handling)
   ============================================================ */

let isRegisterMode = false;

function toggleRegister() {
    isRegisterMode = !isRegisterMode;
    const usernameLabel = document.getElementById("usernameLabel");
    const usernameInput = document.getElementById("loginUsername");
    const loginBtn = document.getElementById("loginBtn");
    const toggleBtn = document.getElementById("toggleBtn");

    if (isRegisterMode) {
        usernameLabel.style.display = "block";
        usernameInput.style.display = "block";
        usernameInput.required = true;
        loginBtn.textContent = "📝 Зарегистрироваться";
        toggleBtn.textContent = "🔐 Уже есть аккаунт";
    } else {
        usernameLabel.style.display = "none";
        usernameInput.style.display = "none";
        usernameInput.required = false;
        loginBtn.textContent = "🔐 Войти";
        toggleBtn.textContent = "📝 Создать аккаунт";
    }
    document.getElementById("loginError").textContent = "";
}

async function doLogin() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const username = document.getElementById("loginUsername").value.trim();
    const err = document.getElementById("loginError");
    err.textContent = "";

    if (isRegisterMode) {
        if (!username) { err.textContent = "Введите никнейм"; return; }
        const result = await Auth.register(username, password, email);
        if (result.success) {
            location.href = "index.html";
        } else {
            err.textContent = result.error || "Ошибка регистрации";
        }
    } else {
        const result = await Auth.login(email, password);
        if (result.success) {
            location.href = "index.html";
        } else {
            err.textContent = result.error || "Ошибка входа";
        }
    }
}

async function loginWithGoogle() {
    try {
        const { error } = await window.TH.signInWithProvider('google');
        if (error) {
            document.getElementById("loginError").textContent = error.message;
        }
        // FIX: НЕ редиректим здесь — Supabase OAuth сам редиректнет на Google,
        // а потом обратно. Обработка будет в handleOAuthReturn()
    } catch (e) {
        document.getElementById("loginError").textContent = "Ошибка входа через Google";
    }
}

// FIX: Полностью переписанная обработка OAuth возврата
async function handleOAuthReturn() {
    // Ждём загрузки всех скриптов
    let attempts = 0;
    while (attempts < 50) {
        if (window.TH && window._supabase) break;
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }

    if (!window.TH || !window._supabase) {
        console.error('❌ Scripts not loaded');
        return false;
    }

    // FIX: Проверяем, есть ли хеш с токеном (OAuth возврат)
    const hash = window.location.hash;
    const hasOAuthToken = hash && (hash.includes('access_token=') || hash.includes('error='));

    if (!hasOAuthToken) {
        // Обычная загрузка страницы — проверяем существующую сессию
        const session = await window.TH.getSession();
        if (session?.user) {
            console.log('✅ Existing session found');
            await DB.syncSupabaseUser();
            return true;
        }
        return false;
    }

    // OAuth возврат — Supabase уже обработал токен (detectSessionInUrl: true)
    // Просто ждём немного и проверяем сессию
    console.log('⏳ OAuth return detected, waiting for session...');
    
    // Даём Supabase время обработать хеш
    await new Promise(r => setTimeout(r, 500));

    // Пробуем получить сессию несколько раз
    for (let i = 0; i < 10; i++) {
        const session = await window.TH.getSession();
        if (session?.user) {
            console.log('✅ OAuth session established');
            await DB.syncSupabaseUser();
            
            // FIX: Очищаем хеш из URL БЕЗ перезагрузки
            if (window.history.replaceState) {
                window.history.replaceState(
                    {}, 
                    document.title, 
                    window.location.pathname + window.location.search
                );
            }
            
            // FIX: Редирект на главную ТОЛЬКО если мы ещё на login.html
            if (window.location.pathname.includes('login.html')) {
                location.href = "index.html";
            }
            return true;
        }
        await new Promise(r => setTimeout(r, 300));
    }

    console.error('❌ Failed to establish OAuth session');
    document.getElementById("loginError").textContent = 
        "Ошибка авторизации через Google. Попробуйте войти через email или обновите страницу.";
    
    // Очищаем хеш чтобы не было повторных попыток
    if (window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    }
    
    return false;
}

function clearAllData() {
    if (!confirm("ВНИМАНИЕ! Это удалит ВСЕ локальные данные сайта. Продолжить?")) return;
    if (prompt('Введите "DELETE" для подтверждения:') !== "DELETE") return;

    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('th_') || key === 'tournament_hub_db') {
            localStorage.removeItem(key);
        }
    });
    toast("🧹 Локальные данные очищены. Перезагрузка...");
    setTimeout(() => location.reload(), 1000);
}

// Event listeners
document.addEventListener("DOMContentLoaded", async function() {
    document.getElementById("loginBtn").addEventListener("click", doLogin);
    document.getElementById("toggleBtn").addEventListener("click", toggleRegister);
    document.getElementById("googleBtn").addEventListener("click", loginWithGoogle);
    document.getElementById("clearBtn").addEventListener("click", clearAllData);

    document.addEventListener("keydown", function(e) {
        if (e.key === "Enter") doLogin();
    });

    Auth.renderNavUser();
    Auth.checkFandomAutoAdmin();
    
    // FIX: Используем isAdminSync для DOM (не async)
    const navAdmin = document.getElementById("navAdmin");
    if (navAdmin && Auth.isAdminSync && Auth.isAdminSync()) {
        navAdmin.classList.remove("hidden");
    }

    await handleOAuthReturn();
});
