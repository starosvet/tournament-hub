/* ============================================================
   Tournament Hub Comments system (Supabase + Realtime)
   ============================================================ */

(function () {
  'use strict';

  function escapeHTML(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ==========================================================
     ЗАГРУЗКА КОММЕНТАРИЕВ
     ========================================================== */

  async function getComments(tournamentId) {
    if (window.TH) {
      try {
        const { data } = await window.TH.getComments(tournamentId);
        if (data) return data;
      } catch (e) {
        console.warn('Supabase comments failed');
      }
    }

    // Fallback
    const db = DB.getDB();
    return (db.comments || [])
      .filter(c => c.tournamentId === tournamentId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /* ==========================================================
     ДОБАВЛЕНИЕ КОММЕНТАРИЯ
     ========================================================== */

  async function addComment(tournamentId, text) {
    const user = DB.getCurrentUser();
    if (!user) return { error: new Error('Требуется авторизация') };

    const clean = String(text || "").trim();
    if (!clean) return { error: new Error('Пустой комментарий') };

    if (window.TH) {
      try {
        const { data, error } = await window.TH.addComment(tournamentId, clean);
        if (error) throw error;
        return { data };
      } catch (e) {
        console.warn('Supabase comment failed, using localStorage');
      }
    }

    // Fallback
    const comment = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      tournamentId,
      userId: user.id,
      username: user.displayName || user.username || "Гость",
      text: clean,
      createdAt: Date.now()
    };

    DB.updateDB(db => {
      if (!Array.isArray(db.comments)) db.comments = [];
      db.comments.push(comment);
    });

    return { data: comment };
  }

  /* ==========================================================
     УДАЛЕНИЕ КОММЕНТАРИЯ
     ========================================================== */

  async function deleteComment(id) {
    const user = DB.getCurrentUser();
    if (!user) return false;

    if (window.TH) {
      try {
        await window.TH.deleteComment(id);
        return true;
      } catch (e) {
        console.warn('Supabase delete failed');
      }
    }

    // Fallback
    let removed = false;
    DB.updateDB(db => {
      db.comments = (db.comments || []).filter(c => {
        if (c.id === id && c.userId === user.id) {
          removed = true;
          return false;
        }
        return true;
      });
    });
    return removed;
  }

  /* ==========================================================
     РЕНДЕР
     ========================================================== */

  async function renderComments(tournamentId, container) {
    if (!container) return;

    const comments = await getComments(tournamentId);

    if (!comments || !comments.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding:40px;">
          <h3>Комментариев пока нет</h3>
          <p>Будьте первым.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = comments.map(c => {
      const date = c.created_at
        ? new Date(c.created_at).toLocaleString("ru-RU")
        : new Date(c.createdAt).toLocaleString("ru-RU");

      return `
        <article class="comment-card">
          <div class="comment-meta">
            <strong>${escapeHTML(c.username)}</strong>
            <span>${date}</span>
          </div>
          <div class="comment-text">${escapeHTML(c.text)}</div>
        </article>
      `;
    }).join("");
  }

  /* ==========================================================
     REALTIME ПОДПИСКА
     ========================================================== */

  function subscribeToComments(tournamentId, container) {
    if (!window.TH) return;

    window.TH.getClient()
      .channel('comments-' + tournamentId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: 'tournament_id=eq.' + tournamentId
      }, (payload) => {
        renderComments(tournamentId, container);
      })
      .subscribe();
  }

  /* ==========================================================
     ЭКСПОРТ
     ========================================================== */

  window.Comments = {
    getComments,
    addComment,
    deleteComment,
    renderComments,
    subscribeToComments
  };

  window.escapeHTML = window.escapeHTML || escapeHTML;
})();
