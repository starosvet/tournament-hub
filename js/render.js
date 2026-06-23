function loadPage(){

let db=getDB();


renderTop(db);

renderRound(db);


}



function renderTop(db){


let html="";


let list=
[...db.players]
.sort(
(a,b)=>(b.wins||0)-(a.wins||0)
);



list.slice(0,10)
.forEach(p=>{

html+=`

<div class="card">

${p.name}

<br>

Побед:
${p.wins||0}

</div>

`;

});


leaderboard.innerHTML=html;

}



function renderRound(db){


if(!db.active)
return;


let html="";


db.active.rounds
.at(-1)
.matches
.forEach((m,i)=>{


html+=`

<div class="match">


<a href="${m.a.url}">
${m.a.name}
</a>


<button onclick="vote(${i},0)">
${m.votesA}
</button>


VS


<button onclick="vote(${i},1)">
${m.votesB}
</button>


<a href="${m.b.url}">
${m.b.name}
</a>


</div>

`;

});


round.innerHTML=html;

}



function vote(id,side){

let db=getDB();

let m=
db.active.rounds.at(-1)
.matches[id];


if(side===0)m.votesA++;
else m.votesB++;


if(m.votesA+m.votesB>=10){


m.done=true;


m.winner=
m.votesA>m.votesB?
m.a:
m.b;



db.logs.push({

date:new Date(),

winner:m.winner.name,

match:m

});


}


saveDB(db);

loadPage();

}



function renderBracket(){

let db=getDB();


bracket.innerHTML=
JSON.stringify(
db.active,
null,
2
);

}
