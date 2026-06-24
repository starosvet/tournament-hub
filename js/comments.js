/*
 Tournament Hub
 Comments system
*/


(function () {



    function getComments(
        tournamentId
    ) {


        const db =
            DB.getDB();



        return db.comments
        .filter(
            c =>
            c.tournamentId === tournamentId
        )
        .sort(
            (a,b)=>
            b.createdAt -
            a.createdAt
        );


    }








    function addComment(
        tournamentId,
        text
    ) {



        const user =
            DB.getCurrentUser();



        if(!text || !text.trim()) {

            return false;

        }





        const comment = {


            id:
            crypto.randomUUID
            ?
            crypto.randomUUID()
            :
            Date.now().toString(),



            tournamentId,



            userId:
            user
            ?
            user.id
            :
            "guest",




            username:
            user
            ?
            user.username
            :
            "Гость",




            text:
            text.trim(),



            createdAt:
            Date.now()


        };






        DB.updateDB(
            db => {


                if(!Array.isArray(db.comments)) {

                    db.comments = [];

                }



                db.comments.push(
                    comment
                );


            }
        );




        return comment;


    }










    function deleteComment(id) {



        const user =
            DB.getCurrentUser();




        if(!user) {

            return false;

        }






        let removed =
            false;






        DB.updateDB(
            db => {


                const before =
                    db.comments.length;




                db.comments =
                    db.comments.filter(
                        c => {


                            if(
                                c.id === id
                                &&
                                c.userId === user.id
                            ) {

                                removed = true;

                                return false;

                            }



                            return true;


                        }
                    );



            }
        );





        return removed;


    }









    function renderComments(
        tournamentId,
        container
    ) {



        if(!container) {

            return;

        }




        const comments =
            getComments(
                tournamentId
            );





        if(!comments.length) {


            container.innerHTML =
            `

            <div class="empty">
                Комментариев пока нет
            </div>

            `;


            return;

        }








        container.innerHTML =
        comments
        .map(
            c => `


            <div class="comment">


                <div class="comment-head">


                    <b>
                    ${escapeHTML(c.username)}
                    </b>


                    <time>
                    ${
                        new Date(
                            c.createdAt
                        )
                        .toLocaleString()
                    }
                    </time>


                </div>




                <p>
                ${escapeHTML(c.text)}
                </p>




            </div>


            `
        )
        .join("");




    }










    function escapeHTML(text) {


        if(text === undefined) {
            return "";
        }



        return String(text)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");


    }








    window.Comments = {


        getComments,

        addComment,

        deleteComment,

        renderComments


    };




})();
