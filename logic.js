export const dateKey=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const shift=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
export function week(d){const start=shift(d,-((d.getDay()+6)%7));return [dateKey(start),dateKey(shift(start,6))]}
export function range(p,d,from='',to=''){if(p==='all')return ['',''];if(p==='custom')return [from,to];return [dateKey(shift(d,1-Number(p))),dateKey(d)]}
export function selectPubs(p,a,b){return p.filter(x=>x['Статус']==='Опубликовано'&&(!(a||b)||x['Дата публикации']&&(!a||x['Дата публикации']>=a)&&(!b||x['Дата публикации']<=b)))}
export function balance(c,p,g){const ids=new Set(p.flatMap(x=>x['Материал']||[])),items=c.filter(x=>ids.has(x.id));return g.map(x=>{const name=x['Тематика'],target=x['Целевая доля']*100,actual=items.length?100*items.filter(y=>y['Тематика']===name).length/items.length:null;return {name,target,actual,gap:actual===null?null:target-actual}})}
