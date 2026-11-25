import assert from 'node:assert/strict';
import {week,range,selectPubs,balance} from '../logic.js';
assert.deepEqual(week(new Date(2026,10,25)),['2026-11-23','2026-11-29']);
assert.deepEqual(range('7',new Date(2026,10,25)),['2026-11-19','2026-11-25']);
const p=[{'Статус':'Опубликовано','Дата публикации':'2026-11-23','Материал':['a']},{'Статус':'Опубликовано','Дата публикации':'2026-11-23','Материал':['a']},{'Статус':'Опубликовано','Материал':['b']}];
assert.equal(selectPubs(p,'2026-11-23','2026-11-29').length,2);
assert.equal(balance([{id:'a','Тематика':'X'}],p.slice(0,2),[{'Тематика':'X','Целевая доля':0.5}])[0].actual,100);
assert.equal(balance([],[],[{'Тематика':'X','Целевая доля':0.5}])[0].actual,null);
console.log('OK');
