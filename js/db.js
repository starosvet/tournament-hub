// js/db.js — база данных v5 (Elo у субъектов, победы у субъектов)

const DB_KEY = "TOURNAMENT_HUB_V5";

function getDB() {
    let raw = localStorage.getItem(DB_KEY);
    if (!raw) {
        return {
            subjects: [],
            users: [],
            tournaments: [],
            activeTournamentId: null,
            settings: {
                siteName: "Tournament Hub",
                siteDesc: "",
                siteLogo: "🏆",
                theme: "amber",
                defaultSubjectType: "character"
            },
            subjectTypes: [
                { id: "article", name: "📄 Статья", icon: "📄" },
                { id: "character", name: "👤 Персонаж", icon: "👤" },
                { id: "image", name: "🖼️ Картинка", icon: "🖼️" },
                { id: "weapon", name: "⚔️ Оружие", icon: "⚔️" },
                { id: "location", name: "🗺️ Локация", icon: "🗺️" },
                { id: "item", name: "📦 Предмет", icon: "📦" },
                { id: "other", name: "⭐ Другое", icon: "⭐" }
            ],
            comments: []
        };
    }
    return JSON.parse(raw);
}

function saveDB(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function getActiveTournament(db) {
    if (!db.activeTournamentId) return null;
    return db.tournaments.find(t => t.id === db.activeTournamentId) || null;
}

function getCurrentUser() {
    let uid = localStorage.getItem("th_user_id");
    if (!uid) return null;
    let db = getDB();
    return db.users.find(u => u.id === uid) || null;
}

function setCurrentUser(userId) {
    if (userId) localStorage.setItem("th_user_id", userId);
    else localStorage.removeItem("th_user_id");
}

function resetVotes(tournamentId) {
    for (let key in localStorage) {
        if (key.startsWith("vote_" + tournamentId + "_")) {
            localStorage.removeItem(key);
        }
    }
}

// Миграция со старых версий
function migrateOldData() {
    // V4 -> V5
    let v4 = localStorage.getItem("TOURNAMENT_HUB_V4");
    if (v4) {
        let old = JSON.parse(v4);
        let db = getDB();
        if (old.subjects) db.subjects = old.subjects;
        if (old.users) db.users = old.users;
        if (old.tournaments) db.tournaments = old.tournaments;
        if (old.activeTournamentId) db.activeTournamentId = old.activeTournamentId;
        if (old.settings) db.settings = { ...db.settings, ...old.settings };
        if (old.comments) db.comments = old.comments;
        // Переносим eloRatings из старой структуры в subjects
        if (old.eloRatings && old.subjects) {
            Object.entries(old.eloRatings).forEach(([id, elo]) => {
                let s = db.subjects.find(x => x.id === id);
                if (s) s.elo = elo;
            });
        }
        saveDB(db);
        localStorage.removeItem("TOURNAMENT_HUB_V4");
        console.log("Миграция V4 -> V5 завершена");
        return;
    }
    
    // V3 -> V5
    let v3 = localStorage.getItem("TOURNAMENT_HUB_V3");
    if (v3) {
        let old = JSON.parse(v3);
        let db = getDB();
        if (old.players) {
            db.subjects = old.players.map(p => ({
                id: p.id,
                name: p.name,
                url: p.url,
                type: "character",
                typeId: "character",
                wins: p.wins || 0,
                elo: 1000,
                description: "",
                tags: []
            }));
        }
        if (old.users) db.users = old.users;
        if (old.tournaments) db.tournaments = old.tournaments;
        if (old.activeTournamentId) db.activeTournamentId = old.activeTournamentId;
        if (old.settings) db.settings = { ...db.settings, ...old.settings };
        if (old.comments) db.comments = old.comments;
        saveDB(db);
        localStorage.removeItem("TOURNAMENT_HUB_V3");
        console.log("Миграция V3 -> V5 завершена");
    }
}

migrateOldData();
