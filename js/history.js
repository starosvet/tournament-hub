function showHistory(){

let db=getDB();


history.innerHTML=
db.logs.map(x=>`

<div class="card">

${x.match.a.name}

VS

${x.match.b.name}


<br>

🏆 ${x.winner}

</div>


`).join("");

}
