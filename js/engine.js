/* 
 Tournament Hub
 Core tournament engine
*/

(function () {

    function shuffle(array) {
        const result = [...array];

        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));

            [result[i], result[j]] = [
                result[j],
                result[i]
            ];
        }

        return result;
    }


    function createMatches(players) {

        if (!players || players.length < 2) {
            return [];
        }


        let shuffled = shuffle(players);


        const matches = [];


        for (let i = 0; i < shuffled.length; i += 2) {

            matches.push({
                id: crypto.randomUUID
                    ? crypto.randomUUID()
                    : Date.now() + "_" + i,

                player1: shuffled[i] || null,
                player2: shuffled[i + 1] || null,

                votes1: 0,
                votes2: 0,

                winner: null,

                finished: false
            });

        }


        return matches;

    }



    function getWinner(match) {

        if (!match) {
            return null;
        }


        if (match.votes1 > match.votes2) {
            return match.player1;
        }


        if (match.votes2 > match.votes1) {
            return match.player2;
        }


        return null;

    }



    window.TournamentEngine = {

        shuffle,
        createMatches,
        getWinner

    };


})();