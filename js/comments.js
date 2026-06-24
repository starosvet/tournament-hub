// js/comments.js — система комментариев к матчам

function addComment(tournamentId, roundIdx, matchIdx, text) {
    let user = getCurrentUser();
    if (!user) return { ok: false, err: "Войдите, чтобы комментировать" };
    if (!text || text.trim().length < 1) return { ok: false, err: "Комментарий не может быть пустым" };
    if (text.length > 500) return { ok: false, err: "Максимум 500 символов" };

    let db = getDB();
    let comments = db.comments || [];
    
    let comment = {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        tournamentId: tournamentId,
        roundIdx: roundIdx,
        matchIdx: matchIdx,
        userId: user.id,
        userName: user.displayName || user.fandomName || "Аноним",
        userType: user.authType,
        text: text.trim(),
        createdAt: new Date().toISOString(),
        likes: 0,
        likedBy: []
    };

    comments.push(comment);
    db.comments = comments;
    saveDB(db);

    return { ok: true, comment: comment };
}

function getComments(tournamentId, roundIdx, matchIdx) {
    let db = getDB();
    let comments = db.comments || [];
    return comments
        .filter(c => c.tournamentId === tournamentId && c.roundIdx === roundIdx && c.matchIdx === matchIdx)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function deleteComment(commentId) {
    if (!isAdmin()) return { ok: false, err: "Только админ может удалять" };
    
    let db = getDB();
    db.comments = (db.comments || []).filter(c => c.id !== commentId);
    saveDB(db);
    return { ok: true };
}

function likeComment(commentId, userId) {
    let db = getDB();
    let comment = (db.comments || []).find(c => c.id === commentId);
    if (!comment) return { ok: false, err: "Комментарий не найден" };
    if (comment.likedBy.includes(userId)) return { ok: false, err: "Уже лайкнуто" };
    
    comment.likes++;
    comment.likedBy.push(userId);
    saveDB(db);
    return { ok: true };
}

function renderComments(tournamentId, roundIdx, matchIdx) {
    let comments = getComments(tournamentId, roundIdx, matchIdx);
    let user = getCurrentUser();
    let html = '';

    // Форма добавления
    if (user) {
        html += `
            <div style="margin-bottom:16px;padding:16px;background:var(--bg);border-radius:12px;border:1px solid var(--border);">
                <textarea id="commentInput_${roundIdx}_${matchIdx}" 
                    placeholder="Напишите комментарий..." 
                    style="width:100%;padding:12px;background:var(--bg-2);border:1px solid var(--border-2);border-radius:10px;color:var(--text);resize:vertical;min-height:60px;font-family:inherit;"></textarea>
                <button class="btn-primary" style="margin-top:10px;font-size:13px;padding:8px 16px;" 
                    onclick="submitComment('${tournamentId}', ${roundIdx}, ${matchIdx})">Отправить</button>
            </div>
        `;
    } else {
        html += `<p style="color:var(--text-3);font-size:13px;text-align:center;padding:12px;"><a href="login.html" style="color:var(--blue);">Войдите</a>, чтобы комментировать</p>`;
    }

    // Список комментариев
    if (!comments.length) {
        html += `<p style="color:var(--text-3);font-size:13px;text-align:center;padding:20px;">Пока нет комментариев</p>`;
    } else {
        html += `<div style="display:flex;flex-direction:column;gap:10px;">`;
        comments.forEach(c => {
            let isAdminBadge = c.userType === 'fandom' ? '<span style="color:var(--green);font-size:11px;">✓</span>' : '';
            let canDelete = isAdmin() || (user && user.id === c.userId);
            
            html += `
                <div style="padding:14px;background:var(--bg);border-radius:12px;border:1px solid var(--border);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="font-weight:600;font-size:14px;color:var(--text);">
                            ${escapeHtml(c.userName)} ${isAdminBadge}
                            <span style="color:var(--text-3);font-size:12px;font-weight:400;">${formatDate(c.createdAt)}</span>
                        </span>
                        ${canDelete ? `<button onclick="removeComment('${c.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;">Удалить</button>` : ''}
                    </div>
                    <p style="color:var(--text-2);font-size:14px;line-height:1.5;margin:0;">${escapeHtml(c.text)}</p>
                    <div style="margin-top:10px;display:flex;gap:12px;align-items:center;">
                        <button onclick="doLike('${c.id}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:13px;display:flex;align-items:center;gap:4px;">
                            <span>❤</span> ${c.likes}
                        </button>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    return html;
}

function submitComment(tournamentId, roundIdx, matchIdx) {
    let input = document.getElementById(`commentInput_${roundIdx}_${matchIdx}`);
    let text = input.value;
    let res = addComment(tournamentId, roundIdx, matchIdx, text);
    if (!res.ok) {
        toast(res.err);
        return;
    }
    input.value = '';
    toast('Комментарий добавлен!');
    // Перерендер комментариев
    let container = document.getElementById(`comments_${roundIdx}_${matchIdx}`);
    if (container) container.innerHTML = renderComments(tournamentId, roundIdx, matchIdx);
}

function removeComment(commentId) {
    if (!confirm('Удалить комментарий?')) return;
    let res = deleteComment(commentId);
    if (res.ok) {
        toast('Комментарий удалён');
        location.reload();
    }
}

function doLike(commentId) {
    let user = getCurrentUser();
    if (!user) { toast('Войдите, чтобы лайкать'); return; }
    let res = likeComment(commentId, user.id);
    if (!res.ok) { toast(res.err); return; }
    toast('❤');
    location.reload();
}

function escapeHtml(text) {
    let div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
