// js/export.js — экспорт результатов турнира v2 (фикс subjects)

function exportTournamentToJSON(tournament) {
    if (!tournament) return null;

    let exportData = {
        name: tournament.name,
        description: tournament.description,
        status: tournament.status,
        createdAt: tournament.createdAt,
        completedAt: tournament.completedAt,
        winner: tournament.winner ? {
            name: tournament.winner.name,
            url: tournament.winner.url
        } : null,
        rounds: tournament.rounds.map(r => ({
            name: r.name,
            matches: r.matches.map(m => ({
                playerA: { name: m.a.name, votes: m.votesA },
                playerB: { name: m.b.name, votes: m.votesB },
                winner: m.winner ? m.winner.name : null,
                done: m.done
            }))
        }))
    };

    return JSON.stringify(exportData, null, 2);
}

function exportTournamentToCSV(tournament) {
    if (!tournament) return '';

    let csv = 'Раунд,Игрок A,Голоса A,Игрок B,Голоса B,Победитель\n';

    tournament.rounds.forEach(r => {
        r.matches.forEach(m => {
            let winner = m.winner ? m.winner.name : '—';
            csv += `"${r.name}","${m.a.name}",${m.votesA},"${m.b.name}",${m.votesB},"${winner}"\n`;
        });
    });

    return csv;
}

function exportToFile(tournament, format) {
    let content, filename, mime;

    if (format === 'json') {
        content = exportTournamentToJSON(tournament);
        filename = `tournament_${tournament.id}.json`;
        mime = 'application/json';
    } else {
        content = exportTournamentToCSV(tournament);
        filename = `tournament_${tournament.id}.csv`;
        mime = 'text/csv;charset=utf-8;';
    }

    let blob = new Blob([content], { type: mime });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast(`Экспортировано: ${filename}`);
}

function renderExportButtons(tournamentId) {
    let db = getDB();
    let t = db.tournaments.find(x => x.id === tournamentId);
    if (!t) return '';

    return `
        <div style="display:flex;gap:12px;margin-top:16px;">
            <button class="btn-secondary" onclick="exportToFileById('${tournamentId}', 'json')">📄 JSON</button>
            <button class="btn-secondary" onclick="exportToFileById('${tournamentId}', 'csv')">📊 CSV</button>
        </div>
    `;
}

function exportToFileById(tournamentId, format) {
    let db = getDB();
    let t = db.tournaments.find(x => x.id === tournamentId);
    if (!t) { toast('Турнир не найден'); return; }
    exportToFile(t, format);
}

// Экспорт всех данных (бэкап)
function exportAllData() {
    let db = getDB();
    let data = {
        exportDate: new Date().toISOString(),
        version: '5.0',
        tournaments: db.tournaments,
        subjects: db.subjects,
        users: db.users.map(u => ({
            id: u.id,
            displayName: u.displayName,
            fandomName: u.fandomName,
            authType: u.authType,
            status: u.status,
            createdAt: u.createdAt,
            votesCount: u.votes ? u.votes.length : 0
        })),
        settings: db.settings,
        comments: db.comments
    };

    let blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `tournament_hub_backup_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast('Полный бэкап сохранён!');
}

// Импорт данных
function importAllData(jsonText) {
    try {
        let data = JSON.parse(jsonText);
        if (!data.tournaments || !data.subjects) {
            return { ok: false, err: "Неверный формат файла" };
        }

        let db = getDB();
        db.tournaments = data.tournaments || [];
        db.subjects = data.subjects || [];
        db.users = data.users || [];
        db.settings = data.settings || db.settings;
        db.comments = data.comments || [];

        saveDB(db);
        return { ok: true };
    } catch (e) {
        return { ok: false, err: "Ошибка парсинга JSON: " + e.message };
    }
}
