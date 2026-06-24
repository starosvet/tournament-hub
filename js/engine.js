// js/engine.js — турнирный движок v2 (универсальные субъекты)

function createBracket(subjects) {
    let shuffled = [...subjects].sort(() => Math.random() - 0.5);
    let n = shuffled.length;
    let p = 1;
    while (p < n) p *= 2;
    let byes = p - n;

    let roundSubjects = shuffled.map(s => ({
        id: s.id,
        name: s.name,
        url: s.url,
        type: s.type || 'character',
        isBye: false
    }));

    for (let i = 0; i < byes; i++) {
        roundSubjects.push({ id: 'bye_' + i, name: '—', url: '#', type: 'bye', isBye: true });
    }

    let rounds = [];
    let matches = createMatches(roundSubjects);
    rounds.push({
        id: 0,
        name: roundName(matches.length * 2),
        matches: matches,
        isActive: true,
        startedAt: new Date().toISOString(),
        endedAt: null
    });

    let remaining = matches.length;
    while (remaining > 1) {
        remaining = Math.ceil(remaining / 2);
        rounds.push({
            id: rounds.length,
            name: roundName(remaining * 2),
            matches: [],
            isActive: false,
            startedAt: null,
            endedAt: null
        });
    }

    let tournament = {
        id: 't_' + Date.now(),
        name: '',
        description: '',
        subjectType: subjects[0]?.type || 'character',
        createdAt: new Date().toISOString(),
        status: 'active',
        currentRound: 0,
        rounds: rounds,
        winner: null,
        completedAt: null,
        config: { voteDurationHours: 24, minVotes: 1, allowGuest: true },
        _playerMap: {}
    };

    rounds[0].matches.forEach(m => {
        if (!m.a.isBye) {
            let orig = subjects.find(s => s.name === m.a.name);
            if (orig) tournament._playerMap[m.a.id] = orig.id;
        }
        if (!m.b.isBye) {
            let orig = subjects.find(s => s.name === m.b.name);
            if (orig) tournament._playerMap[m.b.id] = orig.id;
        }
    });

    return tournament;
}

function createMatches(subjects) {
    let out = [];
    for (let i = 0; i < subjects.length; i += 2) {
        out.push({
            a: subjects[i],
            b: subjects[i + 1] || { id: 'bye_' + i, name: '—', url: '#', type: 'bye', isBye: true },
            votesA: 0,
            votesB: 0,
            winner: null,
            done: false
        });
    }
    return out;
}

function roundName(totalSubjects) {
    if (totalSubjects <= 2) return 'Финал';
    if (totalSubjects <= 4) return '1/2 финала';
    if (totalSubjects <= 8) return '1/4 финала';
    if (totalSubjects <= 16) return '1/8 финала';
    if (totalSubjects <= 32) return '1/16 финала';
    if (totalSubjects <= 64) return '1/32 финала';
    return '1/' + (totalSubjects / 2) + ' финала';
}

function getTimeLeft(startedAt, hours) {
    let end = new Date(startedAt).getTime() + hours * 3600000;
    return Math.max(0, end - Date.now());
}

function formatDuration(ms) {
    if (ms <= 0) return '00:00:00';
    let s = Math.floor(ms / 1000);
    let h = Math.floor(s / 3600);
    let m = Math.floor((s % 3600) / 60);
    let sec = s % 60;
    return [h, m, sec].map(x => String(x).padStart(2, '0')).join(':');
}

function formatDate(iso) {
    if (!iso) return '—';
    let d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
