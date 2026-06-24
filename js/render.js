/*
 Tournament Hub
 Main renderer
*/


(function () {



    function escapeHTML(text) {


        if(
            text === null ||
            text === undefined
        ) {

            return "";

        }



        return String(text)

        .replaceAll("&","&amp;")

        .replaceAll("<","&lt;")

        .replaceAll(">","&gt;")

        .replaceAll('"',"&quot;")

        .replaceAll("'","&#039;");


    }








    function renderSiteName() {


        const elements =
            document.querySelectorAll(
                "[data-site-name]"
            );



        if(!elements.length) {
            return;
        }




        const db =
            DB.getDB();



        const name =
            db.settings?.siteName
            ||
            "Tournament Hub";






        elements.forEach(
            el => {

                el.textContent =
                    name;

            }
        );


    }









    function renderDescription() {


        const el =
            document.querySelector(
                "#site-description"
            );



        if(!el) {
            return;
        }






        const db =
            DB.getDB();





        el.textContent =
            db.settings?.description
            ||
            "";



    }










    function renderTournamentList(
        container
    ) {



        if(!container) {
            return;
        }




        const tournaments =
            Tournament
            .listTournaments();







        if(!tournaments.length) {


            container.innerHTML =

            `

            <div class="empty">

                Турниров пока нет

            </div>

            `;


            return;


        }








        container.innerHTML =

        tournaments

        .map(

            t => `


            <article class="tournament-card">


                <h3>

                ${escapeHTML(
                    t.title
                )}

                </h3>




                <p>

                ${escapeHTML(
                    t.description
                )}

                </p>




                <span class="status">

                ${escapeHTML(
                    t.status
                )}

                </span>





                <a href="bracket.html?id=${encodeURIComponent(t.id)}">

                    Открыть

                </a>



            </article>


            `

        )

        .join("");



    }









    function renderStats() {


        const el =
            document.querySelector(
                "#stats"
            );



        if(!el) {
            return;
        }







        const db =
            DB.getDB();




        el.innerHTML = `


        <div>

        Турниры:
        ${db.tournaments.length}

        </div>



        <div>

        Игроки:
        ${db.users.length}

        </div>



        <div>

        Матчи:
        ${db.matches.length}

        </div>


        `;


    }









    function initRender() {


        renderSiteName();

        renderDescription();

        renderStats();




        const list =
            document.querySelector(
                "#tournament-list"
            );



        renderTournamentList(
            list
        );



        if(
            window.Auth &&
            Auth.renderNavUser
        ) {

            Auth.renderNavUser();

        }



    }







    window.Render = {


        initRender,

        renderTournamentList,

        renderStats


    };







    document.addEventListener(

        "DOMContentLoaded",

        initRender

    );



})();
