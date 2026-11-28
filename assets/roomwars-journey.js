/* Room Wars overview screens. Shared state and inputs remain in Room Wars. */
var completionHostTools=false;
var revealTimer=0, revealFrame=null;
var observedAssignment=null;

function stageIndicator(current){
 var stages=["Join","Compete","Rankings","Room picking","Complete"];
 return '<ol class="journey-stages" aria-label="Competition stages">'+stages.map(function(label,i){
  return '<li'+(i===current?' aria-current="step"':i<current?' class="stage-done"':'')+'><span aria-hidden="true">'+(i<current?'✓':i+1)+'</span>'+label+'</li>'
 }).join("")+'</ol>'
}
function resultCount(){
 return Object.keys(G).reduce(function(n,g){return n+Object.keys(S.sc[g]).length},0)
}
function playedGames(player){
 return Object.keys(G).filter(function(g){return S.sc[g][player]!==undefined})
}
function nextGame(){
 return Object.keys(G).find(function(g){return S.sc[g][me]===undefined})
}
function canPlay(g,pr){
 return me!==null&&G.hasOwnProperty(g)&&(pr?!U(g):S.sc[g][me]===undefined)&&!S.pick&&!S.roomResult&&!revealVisible()&&!S.tb
}
function progressHTML(played){
 return '<div class="journey-progress"><strong>'+played+' / 30</strong> <span>results recorded</span><progress max="30" value="'+played+'" aria-label="Competition results recorded"></progress></div>'
}
function pairDashboard(played){
 var pair=me>>1,partner=me^1;
 return '<section class="card pair-dashboard"><p class="journey-label">Pair '+(pair+1)+'</p><h2>'+esc(cn(pair))+'</h2><div class="pair-progress">'+
  '<div><b>'+esc(pn(me))+'</b><span>You · '+playedGames(me).length+' / 3</span></div>'+
  '<div><b>'+esc(pn(partner))+'</b><span>Partner · '+playedGames(partner).length+' / 3</span></div></div>'+progressHTML(played)+'</section>'
}
function queuedPersonal(type){
 return out.some(function(m){return m.t===type&&m.p===me&&(m.round||"0")===S.round&&(type!=="tbs"||m.tieId===S.tb?.id)})
}
function personalSubmission(type){
 if(queuedPersonal(type))return postFailed?"Saved on this device · retrying submission":"Saved on this device · awaiting submission";
 return "Results submitted to the relay"
}
function personalBackup(){
 return playedGames(me).length?'<details class="card backup" id="personal-backup"'+(A.querySelector("#personal-backup[open]")?' open':'')+'><summary>Share personal score backup</summary><p class="sub">Share your own results if the host cannot see them.</p><button class="alt" id="shh">Share backup</button></details>':''
}
function gameCards(){
 return '<h2>Your games</h2>'+Object.keys(G).map(function(g){
  var played=S.sc[g][me]!==undefined;
  var practiceButton=canPlay(g,true)?'<button class="alt" data-pr="'+g+'">Practice · 1 attempt left</button>':
   U(g)?'<p class="sub">Practice used</p>':'';
  return '<article class="card game journey-game game-'+g+'"><div class="gt"><span class="gi">'+spr(g,4)+'</span><h3 class="gn">'+G[g].n+'</h3>'+
   '<span class="tag">'+(played?'Complete':'Unplayed')+'</span></div>'+
   (played?'<p class="personal-score">'+G[g].f(S.sc[g][me])+'</p>':
    '<p class="sub">'+G[g].d+'</p><button data-g="'+g+'">Play scored round</button>')+practiceButton+'</article>'
 }).join("")
}
function bindPlayerOverview(){
 A.querySelectorAll('[data-g],[data-pr]').forEach(function(button){
  button.onclick=function(){run(button.dataset.g||button.dataset.pr,!!button.dataset.pr)}
 });
 var backup=document.getElementById("shh");if(backup)backup.onclick=function(){share(mine())};
 var change=document.getElementById("chg");if(change)change.onclick=function(event){event.preventDefault();me=null;render()};
 var tie=document.getElementById("tbp");if(tie)tie.onclick=tbG;
 bindTieHost()
}
function rankingsLocked(){
 return '<section class="card rankings-locked"><h2>Rankings locked</h2><p class="sub">The host will reveal the final order after all 30 results are recorded and any ties are settled.</p></section>'
}
function playerHome(){
 view="home";
 var finished=!nextGame(),review=selectionNeedsReview();
 var status=review?'Room picking is paused while the host checks corrected results.':S.roomResult?'The host has paused room picking. Your recorded room choice is kept.':'You and your partner can play in any order.';
 A.innerHTML=brand("ROOM WARS","trophy")+stageIndicator(S.roomResult?3:revealVisible()&&!review?2:1)+
  '<p class="live"><span id="stat"></span> · <a href="#" id="chg">Change player</a></p><p class="sub" id="syncHelp" hidden></p>'+
  pairDashboard(resultCount())+(finished?'<section class="card journey-wait"><h2>Your games are complete</h2><p>'+status+'</p><p class="sub" id="personal-submission" role="status"></p></section>':'')+
  reviewSelectionHTML()+(S.roomResult&&!S.roomResult.complete?roomResultHTML():"")+tbb()+(rankingsPublic()?'<button id="open-rankings">View final rankings</button>':rankingsLocked())+
  (finished?'<details class="card" id="personal-results"'+(A.querySelector('#personal-results[open]')?' open':'')+'><summary>Your results</summary>'+gameCards()+'</details>':gameCards())+personalBackup();
 roomEntrance(view,'.brand');
 bindPlayerOverview();
 observeAssignment();
 var rankings=document.getElementById("open-rankings");if(rankings)rankings.onclick=final;
 stat()
}
function bindTieHost(){
 var end=document.getElementById("tbx");
 if(end)end.onclick=function(){if(S.tb)send({t:"tb",pairs:null,tieId:S.tb.id,cancel:!tieFinished(S.tb)})}
}
function hostResultStatus(){
 return '<details class="card host-result-status"><summary>Result checklist by game</summary>'+Object.keys(G).map(function(g){
  var missing=standardNames().map(function(_,i){return i}).filter(function(i){return S.sc[g][i]===undefined});
  return '<section><h3>'+G[g].n+' · '+(10-missing.length)+' / 10 recorded</h3><p class="sub">'+
   (missing.length?'Missing: '+missing.map(function(i){return esc(pn(i))}).join(', '):'All results recorded')+'</p><p class="sub" data-host-pending="'+g+'" hidden></p></section>'
 }).join("")+'<p class="sub">This checklist shows results available on this device. Players can share a backup if a result is missing.</p></details>'
}
function updateHostPending(){
 var fields=A.querySelectorAll('[data-host-pending]');
 if(!fields.length)return;
 var pending=out.filter(function(message){return (message.round||"0")===S.round}).flatMap(function(message){
  return message.t==="scores"&&Array.isArray(message.rows)?message.rows:message.t==="score"?[message]:[]
 });
 fields.forEach(function(field){
  var players=Array.from(new Set(pending.filter(function(row){return validResultRow(row)&&row.g===field.dataset.hostPending}).map(function(row){return pn(row.p)})));
  var text=players.length?"Locally recorded, awaiting submission: "+players.join(", "):"";
  if(field.textContent!==text)field.textContent=text;
  field.hidden=!players.length
 })
}
function hostNextStep(){
 if(selectionNeedsReview())return readyToReveal()?"Review the corrected picking order.":"Resolve the remaining tie before reviewing the picking order.";
 if(S.roomResult?.complete)return "All rooms are confirmed. The room list is ready to share.";
 if(S.pick)return "Return to room picking to assign the next room.";
 if(S.tb)return tieFinished(S.tb)?"Close the tie-breaker to check the final order.":"Wait for the tied pairs to record their attempts.";
 if(ties().length)return "Start the required tie-breaker.";
 if(readyToReveal())return rankingsPublic()?"Start or resume room picking when everyone is ready.":"Show the final rankings.";
 return resultCount()?"Check the missing results for each game.":"Share the invite so players can join.";
}
function startRoomPicking(){
 if(!roomHostActive()||revealRunning()||!readyToReveal()||selectionNeedsReview()||S.pick||!rankingsPublic())return;
 var previous=S.roomResult,pickOrder=previous?previous.order:order();
 if(previous?.complete)return;
 var index=pickOrder.findIndex(function(pair){return !Object.values(S.claims).includes(pair)});
 if(index<0)return;
 send({t:"pick",order:pickOrder,i:index,rem:DUR[index]*1000,paused:false,start:!previous,resume:!!previous});
}
function restartRoomPicking(){
 if(!roomHostActive()||!selectionNeedsReview()||!readyToReveal())return;
 JialatUI.confirm({title:"Restart room picking?",message:"The corrected scores changed the picking order. Restarting clears every room choice and keeps the corrected results.",label:"Clear choices and restart"},function(){
  if(!selectionNeedsReview()||!readyToReveal())return;
  send({t:"pick",order:order(),i:0,rem:DUR[0]*1000,paused:false,start:true,restart:true})
 })
}
function reviewSelectionHTML(){
 if(!selectionNeedsReview())return "";
 return '<section class="card journey-wait"><h2>Room picking paused</h2><p>The scores changed. Existing assignments are kept while the host checks the new order.</p>'+
  (host&&readyToReveal()?'<button id="restart-picking" class="current-action">Review and restart picking</button>':
    host&&ties().length&&!S.tb?'<button id="review-tie" class="current-action">Start required tie-breaker</button>':'')+'</section>'
}
function bindReviewSelection(){
 var restart=document.getElementById("restart-picking");if(restart)restart.onclick=restartRoomPicking;
 var tie=document.getElementById("review-tie");if(tie)tie.onclick=function(){send({t:"tb",pairs:ties()})}
}
var COMPLETION_DURATION=2600;
var completionPageOpened=Date.now(), completionCue=null, completionTimer;

function resetCompletionCue(){
 clearTimeout(completionTimer);
 completionCue=null;
 observedAssignment=null;
 roomResultFocus=false;
}
function restartCompletedPicking(){
 var result=S.roomResult;
 if(!roomHostActive()||!result?.complete||selectionNeedsReview())return;
 JialatUI.confirm({
  title:"Restart room picking?",
  message:"This clears all five room assignments and returns everyone to the first pick. Scores, rankings and picking order are kept.",
  label:"Clear assignments and restart"
 },function(){
  if(S.roomResult!==result||!roomHostActive()||selectionNeedsReview())return;
  send({t:"pick",order:result.order,i:0,rem:DUR[0]*1000,paused:false,start:true,restartComplete:true})
 });
}
function armCompletion(result){
 if(result.complete&&F(result.endedAt)&&result.endedAt>=completionPageOpened){
  var now=Date.now();
  completionCue={start:result.endedAt,end:Math.min(now,result.endedAt)+COMPLETION_DURATION};
 }
}
function completeCompetition(){
 var result=S.roomResult,pair=me>>1;
 var cue=completionCue;
 var remaining=cue&&cue.start===result.endedAt?cue.end-Date.now():0;
 clearTimeout(completionTimer);
 if(remaining>0){
  completionTimer=setTimeout(function(){if(view==="complete"&&S.roomResult?.complete)home()},remaining);
  if(view==="complete"&&A.querySelector(".completion-finale"))return;
  view="complete";
  A.innerHTML='<section class="completion-finale" role="status" style="--finale-offset:'+(remaining-COMPLETION_DURATION)+'ms">'+
   '<div class="completion-trophy">'+spr("trophy",12)+'</div>'+
   '<h1>ROOM WARS COMPLETE!</h1><p>5/5 ROOMS SECURED</p></section>';
  if(!cue.played){
   cue.played=true;
   if(remaining>=1800)chime([523,659,784,1047],true);
   A.querySelector(".completion-finale").scrollIntoView({block:"nearest",behavior:"instant"});
  }
  return;
 }
 var previous=A.querySelector(".completion-finale");
 var open=A.querySelector("#completion-results[open]");
 var settingsOpen=A.querySelector("#completion-settings[open]");
 var focusId=document.activeElement.closest("#completion-results,#completion-settings")?document.activeElement.id:"";
 view="complete";
 roomResultFocus=false;
 var room=Object.keys(result.claims).find(function(r){return result.claims[r]===pair});
 A.innerHTML='<section class="completion-mission"><h1 id="mission-title" tabindex="-1">MISSION COMPLETE</h1>'+
  '<p class="completion-placement"><span>Final rank</span><strong>'+ordinalPick(result.order.indexOf(pair))+'</strong></p>'+
  roomTag(result.rooms[room],resultPair(result,pair),"Your confirmed room",room)+'</section>'+
  '<details class="card completion-results" id="completion-results"'+(open?' open':'')+'><summary id="completion-summary">View final results</summary>'+
  '<h2>Room assignments</h2>'+roomAssignmentList(result)+roomCopyControls()+
  '<h2>Final pair rankings</h2><section class="final-order" aria-label="Final pair rankings">'+finalRankRows(5,true)+'</section>'+
  '<h2>Individual mini-game results</h2>'+individualScores()+
  '<button class="alt" id="st1">Share rankings</button>'+(resultCount()===30?'<button class="alt" id="st2">Share as image</button>':'')+
  (playedGames(me).length?'<button class="alt" id="shh">Share personal score backup</button>':'')+'<div id="cb"></div></details>'+
  (host?'<details class="card completion-results" id="completion-settings"'+(settingsOpen?' open':'')+'><summary id="completion-settings-summary">Host settings</summary>'+
   '<button class="alt" id="restart-completed-picking">Restart room picking</button>'+
   '<button class="alt" id="organiser-tools">Open host tools</button></details><p class="live" id="stat"></p>':'');
 observedAssignment=A.querySelector(".key-tag").dataset.roomKey;
 var copy=document.getElementById("copy-rooms");if(copy)copy.onclick=copyRooms;
 document.getElementById("st1").onclick=function(){if(rankingsPublic())share(rtext())};
 var image=document.getElementById("st2");if(image)image.onclick=function(){if(rankingsPublic())cardImg()};
 var tools=document.getElementById("organiser-tools");if(tools)tools.onclick=function(){completionHostTools=true;home()};
 var restart=document.getElementById("restart-completed-picking");if(restart)restart.onclick=restartCompletedPicking;
 if(previous)document.getElementById("mission-title").focus();
 else if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
 bindPlayerOverview();stat()
}
function ordinalPick(i){return ["1st","2nd","3rd","4th","5th"][i]||"Unranked"}
function finalRankRows(visible,complete){
 var selection=S.pick||S.roomResult;
 if(resultCount()<30&&selection)return selection.order.map(function(pair,i){
  return '<div class="rank pair-rank"><div class="n">'+(i+1)+'</div><div class="g"><b>'+esc(cn(pair))+'</b></div></div>'
 }).join("");
 var ranks=pairStandings(),shown=complete?ranks:ranks.slice(5-visible).reverse();
 return shown.map(function(pair){
  return pairRankRow(pair,ranks[0].t,null,ordinalPick(pair.r-1)+" pick",roomOf(pair.c))
 }).join("")
}
function final(){
 if(!revealRunning()&&!rankingsPublic())return home();
 var plan=S.revealPlan,age=plan?Date.now()-plan.start:REVEAL_END;
 var complete=!plan||age>=REVEAL_END||!!S.pick||!!S.roomResult;
 var step=complete?5:Math.max(0,Math.min(5,Math.floor((age-REVEAL_FIRST)/REVEAL_STEP)+1));
 var key=S.round+":"+(plan?.start||"legacy")+":"+(S.pick?"pick":S.roomResult?"assigned":"reveal");
 var previous=revealFrame;
 var sameFrame=view==="final"&&previous?.key===key&&previous.step===step&&previous.complete===complete&&!complete;
 var animate=!complete&&step>0&&previous?.key===key&&step===previous.step+1&&age-(REVEAL_FIRST+(step-1)*REVEAL_STEP)<550;
 view="final";
 revealFrame={key:key,step:step,complete:complete};
 clearTimeout(revealTimer);
 if(!complete){
  var next=step===5?REVEAL_END:REVEAL_FIRST+step*REVEAL_STEP;
  revealTimer=setTimeout(function(){if(view==="final")home()},Math.max(0,next-age));
 }
 if(sameFrame)return;
 var winner=!complete&&step===5||complete;
 A.innerHTML=brand(complete?"Final Rankings":step===0?"Calculating final rankings…":"Ranking Reveal","trophy")+stageIndicator(S.roomResult?.complete?4:S.pick||S.roomResult?3:2)+
  (winner?'<section class="card win reveal-winner"><p class="journey-label">Winning pair</p><h2>'+esc(cn((S.pick||S.roomResult)?.order[0]??order()[0]))+'</h2></section>':'')+
  '<section class="final-order" aria-label="Revealed pairs">'+finalRankRows(step,complete)+'</section>'+
  (complete?'<div class="final-actions">'+(host&&!S.roomResult&&!S.pick?'<button id="begin-picking" class="current-action">Start room picking</button>':'')+
   (host&&!S.pick&&!S.roomResult?'<button class="alt" id="hide-rankings">Hide rankings for everyone</button>':'')+
   '<button class="alt" id="st1">Share rankings</button>'+(resultCount()===30?'<button class="alt" id="st2">Share as image</button>':'')+
   '<button class="alt" id="sb">'+(S.roomResult?.complete?'Back to completion':S.pick?'Back to room picking':host?'Back to host controls':'Back to your pair')+'</button><div id="cb"></div></div>'+
   '<details class="card"><summary>Individual game results</summary>'+individualScores()+'</details>':'');
 roomEntrance(view,'.brand');
 if(animate){
  var row=A.querySelector('.final-order .rank:last-child');
  window.JialatMotion?.play(row,step===5?'reveal':'enter');
  if(step===5)window.JialatMotion?.burst(A.querySelector('.reveal-winner'),'room');
  chime(step===5?[523,659,784]:[420+step*65],true)
 }
 if(complete){
  document.getElementById("sb").onclick=function(){skip=true;completionHostTools=false;view="home";home()};
  document.getElementById("st1").onclick=function(){if(rankingsPublic())share(rtext())};
  var image=document.getElementById("st2");if(image)image.onclick=function(){if(rankingsPublic())cardImg()};
  var hide=document.getElementById("hide-rankings");if(hide)hide.onclick=function(){if(!revealRunning())send({t:"reveal",on:false})};
  var start=document.getElementById("begin-picking");if(start)start.onclick=startRoomPicking
 }
 roomHostAccess()
}
function observeAssignment(){
 var tag=A.querySelector('.key-tag');
 var next=tag?.dataset.roomKey||"";
 if(!document.hidden&&observedAssignment!==null&&next&&observedAssignment!==next&&tag){
  window.JialatMotion?.play(tag.querySelector('strong'),'reveal');
  chime([587,784],true)
 }
 observedAssignment=next
}
