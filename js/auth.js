/*
 Tournament Hub
 Authentication
*/


(function () {


    const ADMIN_PASSWORD =
        "admin123";



    function hash(str) {

        let hash = 0;

        for (let i = 0; i < str.length; i++) {

            hash =
                ((hash << 5) - hash)
                + str.charCodeAt(i);

            hash |= 0;
        }


        return String(hash);

    }





    function register(username, password) {


        if (!username || !password) {

            return {
                success:false,
                error:"Заполни все поля"
            };

        }


        return DB.updateDB(db => {


            if (
                db.users.some(
                    u => u.username === username
                )
            ) {

                return {
                    success:false,
                    error:"Пользователь существует"
                };

            }



            const user = {

                id:
                    crypto.randomUUID
                    ? crypto.randomUUID()
                    : Date.now().toString(),

                username,

                password:
                    hash(password),

                created:
                    Date.now(),

                votes:0

            };



            db.users.push(user);


            DB.setCurrentUser(user);



            return {
                success:true,
                user
            };


        });


    }






    function login(username,password) {


        const db =
            DB.getDB();



        const user =
            db.users.find(
                u =>
                    u.username === username
                    &&
                    u.password === hash(password)
            );



        if (!user) {

            return {

                success:false,

                error:"Неверный логин или пароль"

            };

        }



        DB.setCurrentUser(user);



        return {

            success:true,

            user

        };


    }






    function logout() {

        DB.setCurrentUser(null);

    }






    function isAdmin() {


        return (
            localStorage.getItem(
                "th_admin"
            )
            === "yes"
        );

    }






    function adminLogin(password) {


        if (
            password !== ADMIN_PASSWORD
        ) {

            return false;

        }


        localStorage.setItem(
            "th_admin",
            "yes"
        );


        return true;

    }







    function canUserVote(id) {


        const user =
            DB.getCurrentUser();



        const key =
            "vote_" + id;



        if (user) {


            return !localStorage.getItem(
                key + "_" + user.id
            );

        }




        return !localStorage.getItem(key);

    }







    function markVote(id) {


        const user =
            DB.getCurrentUser();



        const key =
            "vote_" + id;



        localStorage.setItem(

            user
            ? key + "_" + user.id
            : key,

            "true"

        );


    }






    function renderNavUser() {


        const box =
            document.querySelector(
                "#user-area"
            );


        if (!box) {
            return;
        }



        const user =
            DB.getCurrentUser();



        if (user) {


            box.innerHTML = `

            <span>
                ${user.username}
            </span>

            <button id="logout">
                Выйти
            </button>

            `;


            document
            .querySelector("#logout")
            ?.addEventListener(
                "click",
                logout
            );


        } else {


            box.innerHTML = `

            <a href="login.html">
                Войти
            </a>

            `;


        }


    }






    window.Auth = {

        register,

        login,

        logout,

        isAdmin,

        adminLogin,

        canUserVote,

        markVote,

        renderNavUser

    };



})();