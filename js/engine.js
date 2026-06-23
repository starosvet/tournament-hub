function shuffle(arr){

return [...arr]
.sort(()=>Math.random()-0.5);

}



function createMatches(players){


let result=[];


players=shuffle(players);


for(
let i=0;
i<players.length;
i+=2
){


if(!players[i+1])
break;


result.push({

a:players[i],

b:players[i+1],

votesA:0,

votesB:0,

winner:null,

done:false

});


}


return result;

}



function createRound(players){


return {

date:new Date(),

matches:
createMatches(players)

};


}
