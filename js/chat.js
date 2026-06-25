/* ============================================================
   Tournament Hub Chat (FIXED v4 — single init, safe render, no race conditions)
   ============================================================ */

(function () {
  'use strict';

  const CHAT_KEY = "tournament_hub_chat";
  let realtimeSubscribed = false;
  let initDone = false;
  let renderPending = false;

  async function getChatMessages() {
    if (window.TH) {
      try {
        const { data } = await window.TH.getChatMessages(200);
        if (data) return data;
      } catch (e) {
        console.warn('Supabase chat failed');
      }
    }
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  async function sendChatMessage(text) {
    const user = await DB.getCurrentUser();
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

    const msgs = await getChatMessages();
    msgs.push({
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(),
      userId: user.id,
      username: user.displayName || user.username,
      text: clean,
      createdAt: Date.now()
    });
    localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-200)));
    return true;
  }

  async function renderChat() {
    if (renderPending) return;
    renderPending = true;

    const container = document.getElementById("chat-messages");
    if (!container) {
      renderPending = false;
      return;
    }

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

    const stats = document.getElementById("chat-stats");
    if (stats) {
      const uniqueUsers = [...new Set(msgs.map(m => m.user_id || m.userId))];
      stats.innerHTML = `
        <div class="stat-badge">💬 Сообщений: ${msgs.length}</div>
        <div class="stat-badge" style="margin-top:8px;">👥 Пользователей: ${uniqueUsers.length}</div>
      `;
    }

    renderPending = false;
  }

  function subscribeToChat() {
    if (!window.TH || realtimeSubscribed) return;
    window.TH.subscribeToChat(() => renderChat());
    realtimeSubscribed = true;
  }

  // FIX: единая глобальная функция sendChat
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

  async function initChat() {
    if (initDone) return;
    initDone = true;

    // Ждём TH если он ещё не загружен
    let attempts = 0;
    while (!window.TH && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    await renderChat();
    subscribeToChat();

    const input = document.getElementById("chat-input");
    if (input) {
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          window.sendChat();
        }
      });
    }

    const user = await DB.getCurrentUser();
    const loginMsg = document.getElementById("chat-login-msg");
    if (loginMsg) {
      loginMsg.style.display = user ? 'none' : 'block';
    }
  }

  window.Chat = {
    getChatMessages, sendChatMessage, renderChat, initChat
  };

  // FIX: единый запуск initChat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initChat, 300));
  } else {
    setTimeout(initChat, 300);
  }
})();
