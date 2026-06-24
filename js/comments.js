/*!
 * Tournament Hub
 * Comments system
 */

(function () {

  function getComments(tournamentId) {
    const db = DB.getDB();
    return db.comments
      .filter(c => c.tournamentId === tournamentId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function addComment(tournamentId, text) {
    const user = DB.getCurrentUser();

    if (!text || !text.trim()) {
      return false;
    }

    const comment = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      tournamentId,
      userId: user ? user.id : "guest",
      username: user ? user.username : "Гость",
      text: text.trim(),
      createdAt: Date.now()
    };

    DB.updateDB(db => {
      if (!Array.isArray(db.comments)) {
        db.comments = [];
      }
      db.comments.push(comment);
    });

    return comment;
  }

  function deleteComment(id) {
    const user = DB.getCurrentUser();
    if (!user) return false;

    let removed = false;
    DB.updateDB(db => {
      const before = db.comments.length;
      db.comments = db.comments.filter(c => {
        if (c.id === id && c.userId === user.id) {
          removed = true;
          return false;
        }
        return true;
      });
    });

    return removed;
  }

  function renderComments(tournamentId, container) {
    if (!container) return;

    const comments = getComments(tournamentId);

    if (!comments.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--text-3);">
          <p>Комментариев пока нет</p>
          <p style="font-size:13px;">Будьте первым!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = comments
      .map(c => `
        <div class="comment-item" style="padding:16px 20px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <strong style="color:var(--accent);">${escapeHTML(c.username)}</strong>
            <span style="color:var(--text-3);font-size:12px;">${new Date(c.createdAt).toLocaleString("ru-RU")}</span>
          </div>
          <p style="color:var(--text-2);line-height:1.6;">${escapeHTML(c.text)}</p>
        </div>
      `)
      .join("");
  }

  function escapeHTML(text) {
    if (text === undefined) return "";
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  window.Comments = {
    getComments,
    addComment,
    deleteComment,
    renderComments
  };

})();
