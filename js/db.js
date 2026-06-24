// js/db.js — база данных v4 (универсальные субъекты)

const DB_KEY = "TOURNAMENT_HUB_V4";

function getDB() {
    let raw = localStorage.getItem(DB_KEY);
    if (!raw) {
        return {
            // Универсальные субъекты (статьи, персонажи, картинки, и т.д.)
            subjects: [],
            // Пользователи
            users: [],
            // Турниры
            tournaments: [],
            activeTournamentId: null,
            // Настройки
            settings: {
                siteName: "Tournament Hub",
                siteDesc: "",
                siteLogo: "🏆",
                theme: "amber",
                defaultSubjectType: "character" // Тип субъекта по умолчанию
            },
            // Типы субъектов (категории)
            subjectTypes: [
                { id: "article", name: "📄 Статья", icon: "📄" },
                { id: "character", name: "👤 Персонаж", icon: "👤" },
                { id: "image", name: "🖼️ Картинка", icon: "🖼️" },
                { id: "weapon", name: "⚔️ Оружие", icon: "⚔️" },
                { id: "location", name: "🗺️ Локация", icon: "🗺️" },
                { id: "item", name: "📦 Предмет", icon: "📦" },
                { id: "other", name: "⭐ Другое", icon: "⭐" }
            ],
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

// Миграция со старой версии (players -> subjects)
function migrateFromV3() {
    let oldRaw = localStorage.getItem("TOURNAMENT_HUB_V3");
    if (!oldRaw) return;
    
    let old = JSON.parse(oldRaw);
    let db = getDB();
    
    // Мигрируем players в subjects
    if (old.players && old.players.length && !db.subjects.length) {
        db.subjects = old.players.map(p => ({
            id: p.id,
            name: p.name,
            url: p.url,
            type: "character", // По умолчанию персонаж
            typeId: "character",
            wins: p.wins || 0,
            description: "",
            tags: []
        }));
    }
    
    // Копируем остальное
    if (old.users) db.users = old.users;
    if (old.tournaments) db.tournaments = old.tournaments;
    if (old.activeTournamentId) db.activeTournamentId = old.activeTournamentId;
    if (old.settings) db.settings = { ...db.settings, ...old.settings };
    if (old.eloRatings) db.eloRatings = old.eloRatings;
    if (old.comments) db.comments = old.comments;
    
    saveDB(db);
    localStorage.removeItem("TOURNAMENT_HUB_V3");
    console.log("Миграция с V3 завершена");
}

// Запускаем миграцию при загрузке
migrateFromV3();
