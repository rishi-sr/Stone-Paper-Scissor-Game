let usercount=0;
let compcount=0;

const choices=document.querySelectorAll(".select-panel");
let msg=document.querySelector("#msg");
let msgbox=document.querySelector(".msg-box");
let userscore=document.querySelector(".userScore");
let compscore=document.querySelector(".compScore");
let userchoiceimg=document.querySelector("#user-panel-img");
let compchoiceimg=document.querySelector("#computer-panel-img");

const genCompChoice=()=>{
    const option=["stone", "paper", "scissor"]
    const randIdx=Math.floor(Math.random()*3);
    if (randIdx===0){
        compchoiceimg.style.backgroundImage="url('Stone.png')";
    }
    else if(randIdx===1){
        compchoiceimg.style.backgroundImage="url('paper.png')";
    }
    else{
        compchoiceimg.style.backgroundImage="url('scissors.png')";
    }
    return option[randIdx];
   
}



let drawGame=() =>{
    console.log("The match is Draw!!");
    msgbox.style.backgroundColor="#221133"
    msg.innerText="The match was Draw, play again!";
}

const showWinner=(userwin)=>{
    if(userwin){
        console.log("You Win!");
        msg.innerText="You Win!";
        msgbox.style.backgroundColor="Green";
        usercount++;
        userscore.innerText=usercount;

    }
    else{
        console.log("You Lose!");
        msg.innerText="You Lose!";
        msgbox.style.backgroundColor="Red";
        compcount++;
        compscore.innerText=compcount;
    }
}

const playGame=(userChoice)=>{
    console.log("User Choice = ",userChoice)
    const compChoice=genCompChoice();
    console.log("Robot Choice = ", compChoice);

    if(userChoice==="stone"){
        userchoiceimg.style.backgroundImage="url('Stone.png')";
    }
    else if(userChoice==="paper"){
        userchoiceimg.style.backgroundImage="url('paper.png')";
    }
    else{
        userchoiceimg.style.backgroundImage="url('scissors.png')";
    }

    if(userChoice===compChoice){
        drawGame();
    }
    else{
        let userwin=true;
        if(userChoice==="stone"){
            userwin = compChoice === "paper" ? false : true;
        }
        else if(userChoice==="paper"){
            userwin=compChoice=== "scissor"? false:true;
        }
        else{
            userwin=compChoice==="stone"? false:true;
        }
        showWinner(userwin);
    } 
    
}
choices.forEach((choice) =>{
    choice.addEventListener("click", ()=>{
        const userChoice=choice.getAttribute('id')
        playGame(userChoice);
    })
})
