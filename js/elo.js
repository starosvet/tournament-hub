// js/elo.js — система рейтинга Elo

const K_FACTOR = 32; // Коэффициент изменения рейтинга
const INITIAL_ELO = 1000;

function getElo(playerId) {
    let db = getDB();
    let ratings = db.eloRatings || {};
    return ratings[playerId] || INITIAL_ELO;
}

function setElo(playerId, rating) {
    let db = getDB();
    db.eloRatings = db.eloRatings || {};
    db.eloRatings[playerId] = Math.round(rating);
    saveDB(db);
}

function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function updateElo(winnerId, loserId) {
    let ratingA = getElo(winnerId);
    let ratingB = getElo(loserId);

    let expectedA = expectedScore(ratingA, ratingB);
    let expectedB = expectedScore(ratingB, ratingA);

    let newRatingA = ratingA + K_FACTOR * (1 - expectedA);
    let newRatingB = ratingB + K_FACTOR * (0 - expectedB);

    setElo(winnerId, newRatingA);
    setElo(loserId, newRatingB);

    return {
        winnerChange: Math.round(newRatingA - ratingA),
        loserChange: Math.round(newRatingB - ratingB),
        winnerNew: Math.round(newRatingA),
        loserNew: Math.round(newRatingB)
    };
}

// Обновление Elo после завершения раунда
function updateEloAfterRound(tournament, allPlayers) {
    let round = tournament.rounds[tournament.currentRound];
    if (!round) return;

    round.matches.forEach(m => {
        if (!m.done || !m.winner) return;
        if (m.a.isBye || m.b.isBye) return;

        let winnerId = findPlayerId(m.winner, allPlayers);
        let loser = m.winner.id === m.a.id ? m.b : m.a;
        let loserId = findPlayerId(loser, allPlayers);

        if (winnerId && loserId) {
            updateElo(winnerId, loserId);
        }
    });
}

function findPlayerId(matchPlayer, allPlayers) {
    let p = allPlayers.find(ap => ap.name === matchPlayer.name);
    return p ? p.id : null;
}

function getEloLeaderboard(allPlayers) {
    let db = getDB();
    let ratings = db.eloRatings || {};
    
    return allPlayers
        .map(p => ({
            ...p,
            elo: ratings[p.id] || INITIAL_ELO
        }))
        .sort((a, b) => b.elo - a.elo);
}

function renderEloLeaderboard(allPlayers) {
    let sorted = getEloLeaderboard(allPlayers);
    let html = '<h2 class="section-title">📊 Elo-рейтинг</h2>';
    
    sorted.forEach((p, i) => {
        let medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
        let change = p.elo - INITIAL_ELO;
        let changeColor = change > 0 ? 'var(--green)' : change < 0 ? 'var(--red)' : 'var(--text-3)';
        let changeSign = change > 0 ? '+' : '';
        
        html += `
            <div class="lb-row" style="animation: fadeInUp 0.5s ease ${i * 0.05}s both;">
                <div class="lb-medal">${medal}</div>
                <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--bg-4),var(--border-2));display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);">${p.name.charAt(0)}</div>
                <div class="lb-name">
                    <a href="#">${escapeHtml(p.name)}</a>
                    <div style="font-size:12px;color:var(--text-3);">Турнирных побед: ${p.wins || 0}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:1.3em;font-weight:800;color:var(--accent);">${p.elo}</div>
                    <div style="font-size:12px;color:${changeColor};">${changeSign}${change}</div>
                </div>
            </div>
        `;
    });
    
    return html;
}

function escapeHtml(text) {
    let div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
