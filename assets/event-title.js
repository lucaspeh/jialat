/* Shared title markup for both JIALAT TV activities. */
window.JialatEventTitle=(()=>{
function holidayIcon(kind){
 const tree=['.......Y.......','......GGG......','.....GGGGG.....','....GGIGGGG....','...GGGGGGGGG...','.....GGGGG.....','....GGGGGGG....','...GGGGGYGGG...','..GGGGGGGGGGG..','....GGGGGGG....','...GGGGGGGGG...','..GGIGGGGGGGG..','.GGGGGGGGGRGGG.','GGGGGGGGGGGGGGG','......BBB......','......BBB......','.....BBBBB.....'];
 const santa=['.....RRRR......','....RRRRRR.....','...RRRRRRRR....','..WWWWWWWWWW...','..WSSSSSSSSW...','...SKSSSSKS....','...SSSSSSSS....','..WWWWSSWWWW...','...WWWWWWWW....','....WWWWWW.....','...RRWWWWRRR...','..RRRRWWRRRRR..','.WRRRRRRRRRRW..','..RRRBBBBRRR...','...RRRYYRRR....','...RRRRRRRR....','....RR..RR.....','...BBB..BBB....'];
 const a=kind==='tree'?tree:santa,colors={G:'#4da67c',Y:'#f3d77a',I:'#86baff',R:kind==='tree'?'#ff8b78':'#e76365',B:'#8a5a2b',W:'#fff5e5',S:'#f5bd94',K:'#231917'};let h='',i=0;
 a.forEach((r,y)=>[...r].forEach((c,x)=>{if(colors[c])h+=`<rect ${kind==='tree'&&['Y','I','R'].includes(c)?'class="tree-light" style="--i:'+i+++'"':''} x="${x}" y="${y}" width="1" height="1" fill="${colors[c]}"/>`}));
 if(kind==='santa')h+='<g class="santa-wave"><rect x="14" y="10" width="2" height="4" fill="#e76365"/><rect x="14" y="9" width="2" height="2" fill="#fff5e5"/></g>';
 return `<div class="title-side title-${kind}" aria-hidden="true"><svg viewBox="0 0 ${kind==='tree'?15:18} ${a.length}" role="presentation">${h}</svg></div>`
}
function eventScreenIcon(){const rows=['BBBBBBBBBBBB','B..........B','B.II..Y....B','B.II.YYY...B','B.II..Y....B','B....YYY...B','B..........B','BBBBBBBBBBBB','....BBBB....','...BBBBBB...'],colors={Y:'#f3d77a',I:'#86baff',B:'#8a5a2b'};let h='';rows.forEach((r,y)=>[...r].forEach((c,x)=>{if(colors[c])h+='<rect x="'+x+'" y="'+y+'" width="1" height="1" fill="'+colors[c]+'"/>'}));return '<svg viewBox="0 0 12 10" aria-hidden="true" shape-rendering="crispEdges">'+h+'</svg>'}

 let markup;
 return function eventCover(){
  if(!markup)markup=`<section class="event-cover event-title seasonal-art" id="event-title" aria-label="Event title">
   <div class="seasonal-snow" aria-hidden="true">${'<i></i>'.repeat(18)}</div>
   <div class="event-marquee">
    <div class="title-icons">${holidayIcon('tree')}<div class="title-middle">${eventScreenIcon()}</div>${holidayIcon('santa')}</div>
    <h1>JIALAT 2026</h1><p class="event-season">Christmas</p>
   </div>
  </section>`;
  return markup;
 };
})();
