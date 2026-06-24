// js/db.js — база данных v3 (с Elo, комментариями, экспортом)

const DB_KEY = "TOURNAMENT_HUB_V3";

function getDB() {
    let raw = localStorage.getItem(DB_KEY);
    if (!raw) {
        return {
            players: [],
            users: [],
            tournaments: [],
            activeTournamentId: null,
            settings: { 
                siteName: "Tournament Hub",
                siteDesc: "",
                siteLogo: "🏆",
                theme: "amber"
            },
            eloRatings: {},
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
