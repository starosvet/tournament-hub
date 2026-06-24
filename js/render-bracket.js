// js/render-bracket.js — рендер сетки v4 (фикс пустого файла + комментарии)

function loadBracketPage() {
    let db = getDB();
    updateSiteBranding();
    renderNavUser(db);
    renderAdminLink();
    renderBracket();
    startTimer();
}

function renderBracket() {
    let db = getDB();
    let t = getActiveTournament(db);
    let badge = document.getElementById('statusBadge');
    let sub = document.getElementById('bracketSub');
    let grid = document.getElementById('bracketGrid');
    let roundInfo = document.getElementById('roundInfo');
    let championArea = document.getElementById('championArea');

    if (!t) {
        if (badge) badge.className = 'badge';
        if (badge) badge.textContent = 'Нет турнира';
        if (sub) sub.textContent = 'Создайте турнир в панели управления';
        if (grid) grid.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-3);"><h3>Нет активного турнира</h3><p>Перейдите в управление, чтобы создать.</p></div>';
        if (roundInfo) roundInfo.style.display = 'none';
        return;
    }

    if (badge) {
        badge.className = 'badge ' + (t.status === 'active' ? 'status-active' : 'status-completed');
        badge.textContent = t.status === 'active' ? '🔥 Активен' : '✅ Завершён';
    }
    if (sub) sub.textContent = t.name + (t.description ? ' — ' + t.description : '');

    // Таймер и инфо раунда
    let round = t.rounds[t.currentRound];
    if (round && t.status === 'active') {
        if (roundInfo) roundInfo.style.display = '';
        let rName = document.getElementById('roundName');
        let rProg = document.getElementById('roundProgress');
        if (rName) rName.textContent = round.name || ('Раунд ' + (t.currentRound + 1));
        if (rProg) rProg.textContent = `Матч ${round.matches.filter(m => m.done).length} / ${round.matches.length}`;
    } else {
        if (roundInfo) roundInfo.style.display = 'none';
    }

    // Рендер сетки
    if (grid) grid.innerHTML = renderBracketGrid(t, db);

    // Чемпион
    if (t.status === 'completed' && t.winner && championArea) {
        championArea.innerHTML = renderChampion(t.winner);
    } else if (championArea) {
        championArea.innerHTML = '';
    }
}

function renderBracketGrid(tournament, db) {
    if (!tournament.rounds || !tournament.rounds.length) return '';

    let html = '';
    let user = getCurrentUser();

    tournament.rounds.forEach((r, idx) => {
        let colClass = 'round-col';
        if (idx === tournament.currentRound && tournament.status === 'active') colClass += ' active';
        else if (idx < tournament.currentRound) colClass += ' past';
        else colClass += ' future';

        html += `<div class="${colClass}"><div class="round-title">${escapeHtml(r.name)}</div>`;

        r.matches.forEach((m, mi) => {
            let wa = m.done && m.winner && m.winner.id === m.a.id;
            let wb = m.done && m.winner && m.winner.id === m.b.id;
            let voteKey = `vote_${tournament.id}_${idx}_${mi}`;
            let hasVoted = localStorage.getItem(voteKey);
            let canVote = idx === tournament.currentRound && tournament.status === 'active' && !m.done && !m.a.isBye && !m.b.isBye && user && !hasVoted;

            // Проверка через базу
            if (user && user.votes) {
                let dbVoted = user.votes.some(v => v.tournamentId === tournament.id && v.roundIdx === idx && v.matchIdx === mi);
                if (dbVoted) canVote = false;
            }

            let total = m.votesA + m.votesB;
            let pctA = total > 0 ? Math.round(m.votesA / total * 100) : 0;
            let pctB = total > 0 ? Math.round(m.votesB / total * 100) : 0;

            let matchCls = 'bracket-match';
            if (canVote) matchCls += ' canvote';
            if (m.done) matchCls += ' done';
            if (!user && !m.done) matchCls += ' need-login';

            html += `<div class="${matchCls}">`;

            // Игрок A
            html += renderPlayer(m.a, wa, pctA, m.votesA, total, true);

            // VS зона
            html += '<div class="bm-vs">';
            if (canVote) {
                html += `<button class="vote-btn vote-a" onclick="doVote(${idx}, ${mi}, 0)" title="Голосовать за ${escapeHtml(m.a.name)}">▲</button>`;
                html += '<span class="vs-divider">VS</span>';
                html += `<button class="vote-btn vote-b" onclick="doVote(${idx}, ${mi}, 1)" title="Голосовать за ${escapeHtml(m.b.name)}">▲</button>`;
            } else if (m.done) {
                html += `<span class="vs-divider">${m.votesA} : ${m.votesB}</span>`;
            } else if (!user) {
                html += '<span class="vs-locked">🔒 VS</span>';
            } else if (hasVoted || (user && user.votes && user.votes.some(v => v.tournamentId === tournament.id && v.roundIdx === idx && v.matchIdx === mi))) {
                html += '<span class="vs-voted">✓ VS</span>';
            } else {
                html += '<span class="vs-divider">VS</span>';
            }
            html += '</div>';

            // Игрок B
            html += renderPlayer(m.b, wb, pctB, m.votesB, total, false);

            // Комментарии
            let matchComments = renderComments(tournament.id, idx, mi);
            html += `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">${matchComments}</div>`;

            html += '</div>'; // bracket-match
        });

        html += '</div>'; // round-col
    });

    return html;
}

function renderPlayer(p, isWinner, pct, votes, total, isA) {
    let cls = 'bm-player';
    if (isWinner) cls += ' winner';
    if (p.isBye) cls += ' bye';

    let img = '';
    if (p.url && p.url !== '#') {
        img = `<img src="${escapeHtml(p.url)}" alt="" onerror="this.style.display='none'">`;
    } else {
        let icon = isA ? '🔵' : '🔴';
        if (p.isBye) icon = '➖';
        img = `<div style="width:40px;height:40px;border-radius:50%;background:var(--bg-4);display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid var(--border-2);">${icon}</div>`;
    }

    let barCls = isA ? 'bm-fill' : 'bm-fill bm-fill-b';

    return `
        <div class="${cls}">
            ${img}
            <div class="bm-info">
                <span class="bm-name">${escapeHtml(p.name)}</span>
                <div class="bm-bar"><div class="${barCls}" style="width:${pct}%"></div></div>
            </div>
            <div class="bm-score">
                ${votes}<small> / ${total}</small>
            </div>
        </div>
    `;
}

function renderChampion(winner) {
    let img = '';
    if (winner.url && winner.url !== '#') {
        img = `<img src="${escapeHtml(winner.url)}" alt="" onerror="this.style.display='none'">`;
    } else {
        img = `<div style="width:160px;height:160px;border-radius:50%;background:var(--bg-4);display:flex;align-items:center;justify-content:center;font-size:64px;margin:0 auto;border:4px solid var(--accent);">👑</div>`;
    }

    return `
        <div class="champion page-enter">
            <h3>🏆 Чемпион турнира</h3>
            <div class="champion-avatar">
                ${img}
            </div>
            <div class="champ-name">${escapeHtml(winner.name)}</div>
            <div class="champ-wins">Победитель по решению сообщества</div>
        </div>
    `;
}

function doVote(roundIdx, matchIdx, side) {
    let db = getDB();
    let t = getActiveTournament(db);
    if (!t) { toast('Турнир не найден'); return; }

    let res = voteInMatch(t, roundIdx, matchIdx, side);
    if (!res.ok) { toast(res.err); return; }

    // Сохраняем изменения
    let tIdx = db.tournaments.findIndex(x => x.id === t.id);
    if (tIdx >= 0) db.tournaments[tIdx] = t;
    saveDB(db);

    toast(side === 0 ? 'Голос за 🔵 принят!' : 'Голос за 🔴 принят!');
    renderBracket();
}

function startTimer() {
    setInterval(() => {
        let db = getDB();
        let t = getActiveTournament(db);
        if (!t || t.status !== 'active') return;

        let round = t.rounds[t.currentRound];
        if (!round || !round.startedAt) return;

        let left = getTimeLeft(round.startedAt, t.config?.voteDurationHours || 24);
        let el = document.getElementById('timerDisplay');
        if (el) el.textContent = formatDuration(left);

        // Автозавершение
        if (left <= 0 && round.isActive && !round.endedAt) {
            t = autoFinalizeRound(t);
            let tIdx = db.tournaments.findIndex(x => x.id === t.id);
            if (tIdx >= 0) db.tournaments[tIdx] = t;
            saveDB(db);
            renderBracket();
            toast('Раунд завершён автоматически!');
        }
    }, 1000);
}

// Комментарии
function renderComments(tournamentId, roundIdx, matchIdx) {
    let comments = getComments(tournamentId, roundIdx, matchIdx);
    let user = getCurrentUser();
    let html = '<div style="font-size:12px;color:var(--text-3);margin-bottom:8px;">💬 Комментарии</div>';

    if (!comments.length) {
        html += '<div style="font-size:13px;color:var(--text-3);padding:8px 0;">Пока нет комментариев</div>';
    } else {
        comments.slice(0, 3).forEach(c => {
            let badge = c.userType === 'fandom' ? '✓' : '👤';
            let isAdmin = c.userType === 'fandom' && c.userName === 'Melanthe Weber';
            let adminBadge = isAdmin ? ' <span style="color:var(--accent);">👑</span>' : '';
            html += `
                <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
                    <b style="color:var(--text-2);">${badge} ${escapeHtml(c.userName)}${adminBadge}</b>
                    <span style="color:var(--text-3);font-size:11px;float:right;">${formatDate(c.createdAt)}</span>
                    <div style="margin-top:4px;color:var(--text);">${escapeHtml(c.text)}</div>
                    <button onclick="doLike('${c.id}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:12px;margin-top:4px;">❤ ${c.likes || 0}</button>
                    ${(isAdmin() || (user && user.id === c.userId)) ? `<button onclick="doDeleteComment('${c.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;margin-left:8px;">🗑</button>` : ''}
                </div>
            `;
        });
        if (comments.length > 3) {
            html += `<div style="font-size:12px;color:var(--text-3);text-align:center;padding:4px;">...и ещё ${comments.length - 3}</div>`;
        }
    }

    if (user) {
        html += `
            <div style="display:flex;gap:8px;margin-top:8px;">
                <input type="text" id="comment_${tournamentId}_${roundIdx}_${matchIdx}" placeholder="Написать комментарий..." maxlength="500" style="flex:1;padding:8px 12px;background:var(--bg);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-size:13px;">
                <button onclick="doComment('${tournamentId}', ${roundIdx}, ${matchIdx})" style="padding:8px 16px;background:var(--blue);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;">➤</button>
            </div>
        `;
    } else {
        html += '<div style="font-size:12px;color:var(--text-3);margin-top:8px;">🔐 Войдите, чтобы комментировать</div>';
    }

    return html;
}

function doComment(tid, ridx, midx) {
    let input = document.getElementById(`comment_${tid}_${ridx}_${midx}`);
    if (!input) return;
    let text = input.value.trim();
    if (!text) return;

    let res = addComment(tid, ridx, midx, text);
    if (!res.ok) { toast(res.err); return; }
    toast('Комментарий добавлен!');
    renderBracket();
}

function doDeleteComment(cid) {
    if (!confirm('Удалить комментарий?')) return;
    let res = deleteComment(cid);
    if (res.ok) {
        toast('Комментарий удалён');
        renderBracket();
    }
}

function doLike(cid) {
    let user = getCurrentUser();
    if (!user) { toast('Войдите, чтобы лайкать'); return; }
    let res = likeComment(cid, user.id);
    if (!res.ok) { toast(res.err); return; }
    toast('❤');
    renderBracket();
}

function escapeHtml(text) {
    let div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
