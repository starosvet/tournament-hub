/* ============================================================
   Login Page Logic
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
    } catch (e) {
        document.getElementById("loginError").textContent = "Ошибка входа через Google";
    }
}

async function handleOAuthReturn() {
    let attempts = 0;
    while (attempts < 30) {
        if (window.TH && window._supabase) break;
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }

    const session = await window.TH.getSession();
    if (session?.user) {
        console.log('✅ OAuth session found');
        await DB.syncSupabaseUser();

        if (window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }

        location.href = "index.html";
        return true;
    }

    if (window.location.hash && window.location.hash.includes('access_token')) {
        console.log('⏳ Hash still present, retrying...');
        await new Promise(r => setTimeout(r, 1000));

        const retrySession = await window.TH.getSession();
        if (retrySession?.user) {
            await DB.syncSupabaseUser();
            if (window.history.replaceState) {
                window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
            }
            location.href = "index.html";
            return true;
        }

        console.error('❌ Failed to establish session from OAuth hash');
        document.getElementById("loginError").textContent = "Ошибка авторизации. Попробуйте войти через email.";
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
    const navAdmin = document.getElementById("navAdmin");
    if (navAdmin && Auth.isAdmin()) navAdmin.classList.remove("hidden");

    await handleOAuthReturn();
});
