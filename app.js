const hs=document.getElementById('hours'),cs=document.getElementById('conds');
for(let i=0;i<24;i++){hs.innerHTML+=`<label><input type=radio name=h ${i==13?'checked':''} value=${i}>${i}:00</label><br>`}
['clear','rain'].forEach((c,j)=>cs.innerHTML+=`<label><input type=radio name=c ${j==0?'checked':''} value=${c}>${c}</label><br>`);
function upd(){let h=+document.querySelector('[name=h]:checked').value;document.body.className=((h>=6&&h<18)?'day':'night')+' '+document.querySelector('[name=c]:checked').value;}
document.onchange=upd;upd();