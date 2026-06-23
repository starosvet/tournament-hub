const KEY="TOURNAMENT_V6";


function getDB(){

let db=
localStorage.getItem(KEY);


if(!db){

return {

players:[],
rounds:[],
logs:[],
users:[],
active:null

};

}


return JSON.parse(db);

}



function saveDB(db){

localStorage.setItem(
KEY,
JSON.stringify(db)
);

}
