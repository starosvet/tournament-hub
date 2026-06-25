/* ============================================================
   Tournament Hub Chat (Supabase + Realtime)
   Заменяет inline-скрипт из chat.html
   ============================================================ */

(function () {
  'use strict';

  const CHAT_KEY = "tournament_hub_chat";
  let realtimeSubscribed = false;

  function escapeHTML(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ==========================================================
     ЗАГРУЗКА СООБЩЕНИЙ
     ========================================================== */

  async function getChatMessages() {
    if (window.TH) {
      try {
        const { data } = await window.TH.getChatMessages(200);
        if (data) return data;
      } catch (e) {
        console.warn('Supabase chat failed');
      }
    }

    // Fallback
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  /* ==========================================================
     ОТПРАВКА СООБЩЕНИЯ
     ========================================================== */

  async function sendChatMessage(text) {
    const user = DB.getCurrentUser();
    if (!user) {
      alert("Войдите, чтобы писать в чат");
      return false;
    }

    const clean = text.trim();
    if (!clean) return false;

    if (window.TH) {
      try {
        const { error } = await window.TH.sendChatMessage(clean);
        if (error) throw error;
        return true;
      } catch (e) {
        console.warn('Supabase chat send failed, using localStorage');
      }
    }

    // Fallback
    const msgs = await getChatMessages();
    msgs.push({
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      userId: user.id,
      username: user.displayName || user.username,
      text: clean,
      createdAt: Date.now()
    });
    localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-200)));
    return true;
  }

  /* ==========================================================
     РЕНДЕР
     ========================================================== */

  async function renderChat() {
    const container = document.getElementById("chat-messages");
    if (!container) return;

    const msgs = await getChatMessages();

    if (!msgs || !msgs.length) {
      container.innerHTML = `<div style="text-align:center;color:var(--text-3);padding:40px;">Нет сообщений. Напишите первое!</div>`;
    } else {
      container.innerHTML = msgs.map(m => {
        const time = m.created_at
          ? new Date(m.created_at).toLocaleTimeString("ru-RU")
          : new Date(m.createdAt).toLocaleTimeString("ru-RU");

        return `
          <div class="chat-message" style="padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <strong style="color:var(--accent);font-size:13px;">${escapeHTML(m.username)}</strong>
              <span style="color:var(--text-3);font-size:11px;">${time}</span>
            </div>
            <div style="color:var(--text-2);font-size:14px;">${escapeHTML(m.text)}</div>
          </div>
        `;
      }).join("");
    }

    container.scrollTop = container.scrollHeight;

    // Статистика
    const stats = document.getElementById("chat-stats");
    if (stats) {
      const uniqueUsers = [...new Set(msgs.map(m => m.user_id || m.userId))];
      stats.innerHTML = `
        <div class="stat-badge">💬 Сообщений: ${msgs.length}</div>
        <div class="stat-badge" style="margin-top:8px;">👥 Пользователей: ${uniqueUsers.length}</div>
      `;
    }
  }

  /* ==========================================================
     REALTIME ПОДПИСКА
     ========================================================== */

  function subscribeToChat() {
    if (!window.TH || realtimeSubscribed) return;

    window.TH.subscribeToChat((message) => {
      renderChat();
    });

    realtimeSubscribed = true;
  }

  /* ==========================================================
     UI HANDLERS
     ========================================================== */

  window.sendChat = async function() {
    const input = document.getElementById("chat-input");
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    const ok = await sendChatMessage(text);
    if (ok) {
      input.value = "";
      await renderChat();
    }
  };

  /* ==========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================== */

  async function initChat() {
    await renderChat();
    subscribeToChat();

    // Enter для отправки
    const input = document.getElementById("chat-input");
    if (input) {
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          window.sendChat();
        }
      });
    }

    // Проверяем авторизацию
    const user = DB.getCurrentUser();
    const loginMsg = document.getElementById("chat-login-msg");
    if (loginMsg) {
      if (user) {
        loginMsg.style.display = 'none';
      } else {
        loginMsg.style.display = 'block';
      }
    }
  }

  window.Chat = {
    getChatMessages,
    sendChatMessage,
    renderChat,
    initChat
  };

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
  } else {
    initChat();
  }
})();
