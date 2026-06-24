/*
 Tournament Hub
 Bracket logic
*/


(function () {



    function finishMatch(matchId,winnerId) {


        const db =
            DB.getDB();



        const match =
            db.matches.find(
                m =>
                m.id === matchId
            );



        if (!match) {
            return;
        }



        match.winner =
            winnerId;



        match.finished =
            true;



        DB.saveDB(db);


    }







    function finalizeRound(round) {


        const db =
            DB.getDB();



        const matches =
            db.matches.filter(
                m =>
                m.round === round
            );



        const winners = [];



        matches.forEach(match => {


            if(match.winner) {


                winners.push(
                    match.winner
                );


            }

        });





        createNextRound(
            winners,
            round + 1
        );


    }






    function autoFinalizeRound(round) {


        const db =
            DB.getDB();



        const matches =
            db.matches.filter(
                m =>
                m.round === round
            );



        matches.forEach(match => {


            if(match.finished) {
                return;
            }




            if(
                match.votes1 >
                match.votes2
            ) {

                match.winner =
                    match.player1;

            }

            else if(
                match.votes2 >
                match.votes1
            ) {

                match.winner =
                    match.player2;

            }



            match.finished =
                true;



        });




        DB.saveDB(db);



        finalizeRound(round);


    }








    function createNextRound(players,round) {


        if (
            !players ||
            players.length < 2
        ) {

            return;

        }



        const matches =
            TournamentEngine
            .createMatches(players);



        const db =
            DB.getDB();




        matches.forEach(m => {


            m.round =
                round;



            db.matches.push(m);


        });




        DB.saveDB(db);


    }







    function vote(matchId,player) {


        if(
            !Auth.canUserVote(matchId)
        ) {

            return false;

        }



        const db =
            DB.getDB();



        const match =
            db.matches.find(
                m =>
                m.id === matchId
            );



        if(!match) {
            return false;
        }





        if(
            player === 1
        ) {

            match.votes1++;

        }


        else if(
            player === 2
        ) {

            match.votes2++;

        }





        DB.saveDB(db);



        Auth.markVote(
            matchId
        );



        return true;


    }






    window.Bracket = {

        finishMatch,

        finalizeRound,

        autoFinalizeRound,

        createNextRound,

        vote

    };




})();