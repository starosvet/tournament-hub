/*
 Tournament Hub
 Local database layer
*/


(function () {


    const STORAGE_KEY = "tournament_hub_db";


    const defaultDB = {

        users: [],

        tournaments: [],

        matches: [],

        comments: [],

        settings: {

            siteName: "Tournament Hub",

            description: "Wiki tournaments"

        }

    };



    function loadDB() {


        let raw = localStorage.getItem(STORAGE_KEY);


        if (!raw) {

            saveDB(defaultDB);

            return structuredClone(defaultDB);

        }


        try {

            const data = JSON.parse(raw);


            return {

                ...structuredClone(defaultDB),

                ...data,

                settings: {

                    ...defaultDB.settings,

                    ...(data.settings || {})

                }

            };


        } catch (e) {


            console.error(
                "Database corrupted",
                e
            );


            return structuredClone(defaultDB);

        }

    }




    function saveDB(data) {

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(data)
        );

    }




    function getDB() {

        return loadDB();

    }




    function updateDB(callback) {


        const db = loadDB();


        callback(db);


        saveDB(db);


        return db;

    }





    function getCurrentUser() {

        const id =
            localStorage.getItem(
                "th_user"
            );


        if (!id) {
            return null;
        }


        const db = loadDB();


        return db.users.find(
            u => u.id === id
        ) || null;

    }





    function setCurrentUser(user) {

        if (!user) {

            localStorage.removeItem(
                "th_user"
            );

            return;

        }


        localStorage.setItem(
            "th_user",
            user.id
        );

    }





    window.DB = {

        loadDB,
        getDB,
        saveDB,
        updateDB,

        getCurrentUser,
        setCurrentUser

    };


})();