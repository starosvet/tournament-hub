function enter(){

let p=password.value;


if(loginAdmin(p)){


login.style.display="none";

panel.style.display="block";

}


}



function importPlayers(){


let lines=
importBox.value.split("\n");


let db=getDB();


db.players=
lines.map(x=>{


let [name,url]=
x.split("|");


return {

id:name,

name:name,

url:url,

wins:0

};


});


saveDB(db);


alert("Imported");

}



function newTournament(){

start();

}


function newRound(){

let db=getDB();

db.active.round++;

db.active.rounds.push(
createRound(db.players)
);


saveDB(db);

}



function clearDB(){

localStorage.clear();

location.reload();

}
