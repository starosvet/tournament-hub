/* Tournament Hub Comments system */
(function () {
  function escapeHTML(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getComments(tournamentId) {
    const db = DB.getDB();
    return (db.comments || [])
      .filter(c => c.tournamentId === tournamentId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function addComment(tournamentId, text) {
    const user = DB.getCurrentUser();
    const clean = String(text || "").trim();
    if (!clean) return false;

    const comment = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      tournamentId,
      userId: user ? user.id : "guest",
      username: user ? (user.displayName || user.username) : "Гость",
      text: clean,
      createdAt: Date.now()
    };

    DB.updateDB(db => {
      if (!Array.isArray(db.comments)) db.comments = [];
      db.comments.push(comment);
    });

    return comment;
  }

  function deleteComment(id) {
    const user = DB.getCurrentUser();
    if (!user) return false;

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

  function renderComments(tournamentId, container) {
    if (!container) return;
    const comments = getComments(tournamentId);

    if (!comments.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Комментариев пока нет</h3>
          <p>Будьте первым.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = comments.map(c => `
      <article class="comment-card">
        <div class="comment-meta">
          <strong>${escapeHTML(c.username)}</strong>
          <span>${new Date(c.createdAt).toLocaleString("ru-RU")}</span>
        </div>
        <div class="comment-text">${escapeHTML(c.text)}</div>
      </article>
    `).join("");
  }

  window.Comments = { getComments, addComment, deleteComment, renderComments };
  window.escapeHTML = window.escapeHTML || escapeHTML;
})();
