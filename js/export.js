/*
 Tournament Hub
 Export / backup system
*/


(function () {



    function getBackupData() {


        const db =
            DB.getDB();



        return {

            version:
                1,


            exportedAt:
                new Date()
                .toISOString(),



            data:
                db


        };


    }









    function downloadBackup() {



        const backup =
            getBackupData();





        const json =
            JSON.stringify(
                backup,
                null,
                2
            );





        const blob =
            new Blob(
                [
                    json
                ],
                {
                    type:
                    "application/json;charset=utf-8"
                }
            );





        const url =
            URL.createObjectURL(
                blob
            );






        const a =
            document.createElement(
                "a"
            );



        const date =
            new Date()
            .toISOString()
            .slice(
                0,
                10
            );





        a.href =
            url;



        a.download =
            "tournament-hub-backup-" +
            date +
            ".json";




        document.body.appendChild(a);



        a.click();



        a.remove();




        URL.revokeObjectURL(
            url
        );



    }









    function importBackup(file) {


        return new Promise(
            resolve => {



                const reader =
                    new FileReader();




                reader.onload =
                function(){


                    try {


                        const backup =
                            JSON.parse(
                                reader.result
                            );



                        if(
                            !backup.data
                        ) {


                            resolve(false);

                            return;

                        }






                        DB.saveDB(
                            backup.data
                        );



                        resolve(true);



                    }

                    catch(e) {


                        console.error(
                            "Import error",
                            e
                        );


                        resolve(false);


                    }



                };




                reader.readAsText(
                    file
                );



            }
        );



    }









    window.Export = {


        getBackupData,

        downloadBackup,

        importBackup


    };



})();
