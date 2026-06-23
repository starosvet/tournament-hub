function start(){

let db=getDB();


db.active={

round:1,

rounds:[
createRound(db.players)
]

};


saveDB(db);

}
