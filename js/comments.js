/* ============================================================
   Tournament Hub Comments system (FIXED)
   ============================================================ */

(function () {
  'use strict';

  function escapeHTML(text) {
    if (text == null) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function getComments(tournamentId) {
    if (window.TH) {
      try {
        const { data } = await window.TH.getComments(tournamentId);
        if (data) return data;
      } catch (e) {
        console.warn('Supabase comments failed');
      }
    }
    const db = DB.getDB();
    return (db.comments || [])
      .filter(c => c.tournamentId === tournamentId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

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

    return { data: comment
