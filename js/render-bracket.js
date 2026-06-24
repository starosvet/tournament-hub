// js/render-bracket.js — рендер сетки v3 (Shikimori-style)

function renderBracket(tournament, allPlayers) {
    let el = document.getElementById('bracketGrid');
    if (!el) return;
    
    let user = getCurrentUser();
    let html = '';
    
    t.rounds.forEach((r, idx) => {
        let cls = idx === t.currentRound && t.status === "active" ? "round-col active" :
                  idx < t.currentRound || t.status === "completed" ? "round-col past" : "round-col future";
        
        html += `
            <div class="${cls}">
                <div class="round-title">${r.name}</div>
        `;
        
        r.matches.forEach((m, mi) => {
            let wa = m.done && m.winner?.id === m.a.id;
            let wb = m.done && m.winner?.id === m.b.id;
            let voteKey = `vote_${t.id}_${idx}_${mi}`;
            let hasVoted = localStorage.getItem(voteKey);
            let canVote = idx === t.currentRound && t.status === "active" && !m.done && !m.a.isBye && !m.b.isBye
                          && user && !hasVoted;
            
            // Проверка через базу (анти-накрутка)
            if (user && user.votes) {
                let dbVoted = user.votes.some(v => 
                    v.tournamentId === t.id && v.roundIdx === idx && v.matchIdx === mi
                );
                if (dbVoted) canVote = false;
            }
            
            // Проценты для визуализации
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
                html += `<span class="vs-divider">VS</span>`;
                html += `<button class="vote-btn vote-b" onclick="doVote(${idx}, ${mi}, 1)" title="Голосовать за ${escapeHtml(m.b.name)}">▲</button>`;
            } else if (m.done) {
                html += `<span class="final-sc">${m.votesA} : ${m.votesB}</span>`;
            } else if (!user) {
                html += `<span class="vs-locked">🔒 <span class="vs-divider">VS</span></span>`;
            } else if (hasVoted || (user && user.votes && user.votes.some(v => v.tournamentId === t.id && v.roundIdx === idx && v.matchIdx === mi))) {
                html += `<span class="vs-voted">✓ <span class="vs-divider">VS</span></span>`;
            } else {
                html += `<span class="vs-divider">VS</span>`;
            }
            
            html += '</div>';
            
            // Игрок B
            html += renderPlayer(m.b, wb, pctB, m.votesB, total, false);
            
            html += '</div>';
        });
        
        html += '</div>';
    });
    
    el.innerHTML = html;
}

function renderPlayer(player, isWinner, pct, votes, total, isA) {
    let cls = 'bm-player';
    if (isWinner) cls += ' winner';
    if (player.isBye) cls += ' bye';
    
    let img = player.url !== '#' && player.url ? 
        `<img src="${player.url}" alt="" onerror="this.style.display='none'">` : 
        `<div style="width:40px;height:40px;border-radius:50%;background:var(--bg-4);display:flex;align-items:center;justify-content:center;font-size:18px;">${player.name.charAt(0)}</div>`;
    
    let barCls = isA ? 'bm-fill' : 'bm-fill bm-fill-b';
    let voteText = total > 0 ? ` (${pct}%)` : '';
    
    return `
        <div class="${cls}">
            ${img}
            <div class="bm-info">
                <span class="bm-name">${player.name}</span>
                ${!player.isBye ? `
                    <div class="bm-bar">
                        <div class="${barCls}" style="width:${pct}%"></div>
                    </div>
                ` : ''}
            </div>
            <div class="bm-score">
                <b>${votes}</b><small>${voteText}</small>
            </div>
        </div>
    `;
}

function escapeHtml(text) {
    let div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
