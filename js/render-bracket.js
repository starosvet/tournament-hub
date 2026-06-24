/*
 Tournament Hub
 Bracket renderer
*/


(function () {



    function escapeHTML(text) {

        if(text === null || text === undefined) {
            return "";
        }


        return String(text)
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");

    }








    function playerName(player) {


        if(!player) {

            return "—";

        }



        if(typeof player === "string") {

            return player;

        }



        return (
            player.name ||
            player.username ||
            "Без имени"
        );


    }









    function renderMatch(match) {


        if(!match) {
            return "";
        }




        const p1 =
            playerName(
                match.player1
            );



        const p2 =
            playerName(
                match.player2
            );





        const finished =
            match.finished
            ? "finished"
            : "";





        const winner =
            match.winner;





        return `

        <div class="match ${finished}">


            <div class="
            player 
            ${winner === match.player1 ? "winner" : ""}
            ">


                <span>
                    ${escapeHTML(p1)}
                </span>


                <b>
                    ${match.votes1 || 0}
                </b>


            </div>





            <div class="
            player
            ${winner === match.player2 ? "winner" : ""}
            ">


                <span>
                    ${escapeHTML(p2)}
                </span>


                <b>
                    ${match.votes2 || 0}
                </b>


            </div>





            ${
                !finished
                ?
                `

                <div class="vote-buttons">


                    <button
                    onclick="Bracket.vote('${match.id}',1)">
                    Голос
                    </button>


                    <button
                    onclick="Bracket.vote('${match.id}',2)">
                    Голос
                    </button>


                </div>

                `
                :
                `
                <div class="closed">
                    Завершён
                </div>
                `
            }




        </div>

        `;



    }









    function renderRound(round,container) {


        const matches =
            Bracket.getMatches(
                round
            );



        if(!container) {
            return;
        }




        if(!matches.length) {


            container.innerHTML =
            `

            <div class="empty">
                Нет матчей
            </div>

            `;


            return;

        }






        container.innerHTML =
            matches
            .map(
                renderMatch
            )
            .join("");



    }









    function renderBracket() {


        const root =
            document.querySelector(
                "#bracket"
            );



        if(!root) {
            return;
        }






        const db =
            DB.getDB();



        const rounds =
            [
                ...new Set(
                    db.matches.map(
                        m =>
                        m.round
                    )
                )
            ]
            .sort(
                (a,b)=>a-b
            );






        if(!rounds.length) {


            root.innerHTML =
            `

            <p>
            Турнир ещё не начат
            </p>

            `;


            return;

        }






        root.innerHTML =
        rounds
        .map(round => {


            const matches =
                Bracket
                .getMatches(round);



            return `


            <section class="round">


                <h3>
                    Раунд ${round}
                </h3>



                ${
                    matches
                    .map(
                        renderMatch
                    )
                    .join("")
                }


            </section>


            `;


        })
        .join("");



    }







    window.renderBracket =
        renderBracket;



})();
