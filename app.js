const STORAGE_KEY = "tournament_state_v1";

// 30 статей (замени на свои)
const ARTICLES = [
    "Веспера", "Фрида", "Оригрантие", "Эйрвен",
    "Адам-0", "Небула", "Скетцотеп", "Гримсфьёлл",
    "Арка", "Люмен", "Кайрос", "Мортис",
    "Сераф", "Ноктис", "Эреб", "Валькирия",
    "Соль", "Тень", "Пепел", "Сталь",
    "Кровь", "Прах", "Луна", "Солнце",
    "Пустота", "Шторм", "Лес", "Камень",
    "Огонь", "Вода"
];

// ---------------------------
// INIT TOURNAMENT
// ---------------------------

function initTournament() {
    let shuffled = [...ARTICLES].sort(() => Math.random() - 0.5);

    let pairs = [];

    for (let i = 0; i < shuffled.length; i += 2) {
        if (shuffled[i + 2] && Math.random() > 0.5) {
            // 3-way battle occasionally
            pairs.push([shuffled[i], shuffled[i+1], shuffled[i+2]]);
            i += 1;
        } else {
            pairs.push([shuffled[i], shuffled[i+1]]);
        }
    }

    return {
        round: 1,
        pairs: pairs,
        current: 0,
        winners: []
    };
}

// ---------------------------
// LOAD STATE
// ---------------------------

function loadState() {
    let saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);

    let state = initTournament();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
}

function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------------------------
// RENDER
// ---------------------------

function render() {
    let state = loadState();

    const container = document.getElementById("tournament");
    const battle = document.getElementById("battle");

    container.innerHTML = `<h2>Round ${state.round}</h2>`;

    if (state.current >= state.pairs.length) {
        container.innerHTML += "<h3>Round complete. Generating next...</h3>";
        nextRound(state);
        return;
    }

    let match = state.pairs[state.current];

    battle.innerHTML = `
        <h3>Match ${state.current + 1}</h3>
        ${match.map(m => `<button class="pick">${m}</button>`).join("")}
    `;

    document.querySelectorAll(".pick").forEach(btn => {
        btn.onclick = () => vote(btn.textContent);
    });
}

// ---------------------------
// VOTING
// ---------------------------

function vote(choice) {
    let state = loadState();

    state.winners.push(choice);
    state.current++;

    saveState(state);
    render();
}

// ---------------------------
// NEXT ROUND
// ---------------------------

function nextRound(oldState) {
    let winners = oldState.winners;

    if (winners.length <= 1) {
        document.getElementById("battle").innerHTML =
            `<h2>🏆 Winner: ${winners[0] || "None"}</h2>`;
        localStorage.removeItem(STORAGE_KEY);
        return;
    }

    let newPairs = [];

    for (let i = 0; i < winners.length; i += 2) {
        if (winners[i + 2] && Math.random() > 0.5) {
            newPairs.push([winners[i], winners[i+1], winners[i+2]]);
            i += 1;
        } else {
            newPairs.push([winners[i], winners[i+1]]);
        }
    }

    let newState = {
        round: oldState.round + 1,
        pairs: newPairs,
        current: 0,
        winners: []
    };

    saveState(newState);
    render();
}

// ---------------------------
// RESET
// ---------------------------

document.getElementById("reset").onclick = () => {
    localStorage.removeItem(STORAGE_KEY);
    render();
};

// start
render();
