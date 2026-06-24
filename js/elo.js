// js/elo.js — Elo-рейтинг для СУБЪЕКТОВ (статей, персонажей, и т.д.)

const K_FACTOR = 32;
const INITIAL_ELO = 1000;

function getSubjectElo(subjectId) {
    let db = getDB();
    let s = db.subjects.find(x => x.id === subjectId);
    return s?.elo || INITIAL_ELO;
}

function setSubjectElo(subjectId, rating) {
    let db = getDB();
    let s = db.subjects.find(x => x.id === subjectId);
    if (s) {
        s.elo = Math.round(rating);
        saveDB(db);
    }
}

function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// Обновление Elo после матча
function updateEloAfterMatch(winnerSubjectId, loserSubjectId) {
    let ratingA = getSubjectElo(winnerSubjectId);
    let ratingB = getSubjectElo(loserSubjectId);

    let expectedA = expectedScore(ratingA, ratingB);
    let expectedB = expectedScore(ratingB, ratingA);

    let newRatingA = ratingA + K_FACTOR * (1 - expectedA);
    let newRatingB = ratingB + K_FACTOR * (0 - expectedB);

    setSubjectElo(winnerSubjectId, newRatingA);
    setSubjectElo(loserSubjectId, newRatingB);

    return {
        winnerChange: Math.round(newRatingA - ratingA),
        loserChange: Math.round(newRatingB - ratingB),
        winnerNew: Math.round(newRatingA),
        loserNew: Math.round(newRatingB)
    };
}

// Обновление Elo после завершения раунда
function updateEloAfterRound(tournament) {
    let round = tournament.rounds[tournament.currentRound];
    if (!round) return;

    round.matches.forEach(m => {
        if (!m.done || !m.winner) return;
        if (m.a.isBye || m.b.isBye) return;

        let winnerId = m.winner.id;
        let loser = m.winner.id === m.a.id ? m.b : m.a;
        let loserId = loser.id;

        // Находим реальные ID субъектов
        let db = getDB();
        let winnerSubject = db.subjects.find(s => s.id === winnerId) || 
                           db.subjects.find(s => s.name === m.winner.name);
        let loserSubject = db.subjects.find(s => s.id === loserId) ||
                          db.subjects.find(s => s.name === loser.name);

        if (winnerSubject && loserSubject) {
            updateEloAfterMatch(winnerSubject.id, loserSubject.id);
        }
    });
}

// Лидерборд по Elo
function getEloLeaderboard() {
    let db = getDB();
    return [...db.subjects]
        .map(s => ({ ...s, elo: s.elo || INITIAL_ELO }))
        .sort((a, b) => b.elo - a.elo);
}

// Лидерборд по победам
function getWinsLeaderboard() {
    let db = getDB();
    return [...db.subjects]
        .sort((a, b) => (b.wins || 0) - (a.wins || 0));
}

function renderEloLeaderboard() {
    let sorted = getEloLeaderboard();
    let html = '<h2 class="section-title">📊 Elo-рейтинг субъектов</h2>';
    
    if (!sorted.length) {
        html += '<p style="color:var(--text-3);">Пока нет субъектов</p>';
        return html;
    }
    
    sorted.slice(0, 10).forEach((s, i) => {
        let medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
        let change = (s.elo || INITIAL_ELO) - INITIAL_ELO;
        let changeColor = change > 0 ? 'var(--green)' : change < 0 ? 'var(--red)' : 'var(--text-3)';
        let changeSign = change > 0 ? '+' : '';
        let typeIcon = getSubjectTypeIcon(s.typeId);
        
        html += `
            <div class="lb-row" style="animation: fadeInUp 0.5s ease ${i * 0.05}s both;">
                <div class="lb-medal">${medal}</div>
                <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--bg-4),var(--border-2));display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:18px;">
                    ${typeIcon}
                </div>
                <div class="lb-name">
                    <span style="font-weight:600;color:var(--text);">${escapeHtml(s.name)}</span>
                    <div style="font-size:12px;color:var(--text-3);">${escapeHtml(s.type || 'Субъект')} | Побед: ${s.wins || 0}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:1.3em;font-weight:800;color:var(--accent);">${s.elo || INITIAL_ELO}</div>
                    <div style="font-size:12px;color:${changeColor};">${changeSign}${change}</div>
                </div>
            </div>
        `;
    });
    
    return html;
}

function getSubjectTypeIcon(typeId) {
    let db = getDB();
    let t = db.subjectTypes.find(x => x.id === typeId);
    return t?.icon || '⭐';
}

function escapeHtml(text) {
    let div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
