import assert from 'node:assert/strict';
import {week, range, selectPubs, balance, daysBetween, effectiveRange, granularity, buckets, proratedTarget, groupByMaterial} from '../logic.js';

assert.deepEqual(week(new Date(2026, 10, 25)), ['2026-11-23', '2026-11-29']);
assert.deepEqual(week(new Date(2026, 10, 29)), ['2026-11-23', '2026-11-29']);
assert.deepEqual(range('7', new Date(2026, 10, 25)), ['2026-11-19', '2026-11-25']);

const p = [
  {id: '1', 'Статус': 'Опубликовано', 'Дата публикации': '2026-11-23', 'Материал': ['a']},
  {id: '2', 'Статус': 'Опубликовано', 'Дата публикации': '2026-11-24', 'Материал': ['a']},
  {id: '3', 'Статус': 'Опубликовано', 'Материал': ['b']},
  {id: '4', 'Статус': 'Черновик', 'Дата публикации': '2026-11-23', 'Материал': ['c']},
];
assert.equal(selectPubs(p, '2026-11-23', '2026-11-29').length, 2);
assert.equal(selectPubs(p, '', '').length, 3, 'без диапазона — включая недатированные');

// кросспост не дублирует материал
const b = balance([{id: 'a', 'Тематика': 'X'}], p.slice(0, 2), [{'Тематика': 'X', 'Целевая доля': 0.5}])[0];
assert.equal(b.actual, 100);
assert.equal(b.count, 1);
assert.equal(b.gap, -50);
assert.equal(balance([], [], [{'Тематика': 'X', 'Целевая доля': 0.5}])[0].actual, null);

assert.equal(daysBetween('2026-11-01', '2026-11-30'), 30);
assert.deepEqual(effectiveRange(p, ['', ''], '2026-11-25'), ['2026-11-23', '2026-11-25']);
assert.deepEqual(effectiveRange([], ['', ''], '2026-11-25'), ['2026-11-25', '2026-11-25']);

assert.equal(granularity(30), 'day');
assert.equal(granularity(90), 'week');
assert.equal(granularity(365), 'month');
assert.equal(buckets('2026-11-19', '2026-11-25', 'day').length, 7, 'пустые дни тоже попадают в график');
const w = buckets('2026-11-19', '2026-11-25', 'week');
assert.deepEqual(w.map(x => x.from), ['2026-11-16', '2026-11-23']);
assert.equal(w[0].to, '2026-11-22');
const m = buckets('2026-01-15', '2026-03-02', 'month');
assert.deepEqual(m.map(x => [x.from, x.to]), [['2026-01-01', '2026-01-31'], ['2026-02-01', '2026-02-28'], ['2026-03-01', '2026-03-31']]);

assert.equal(proratedTarget(2, 7), 2);
assert.equal(proratedTarget(7, 30), 30);

const g = groupByMaterial(p.slice(0, 3));
assert.equal(g.length, 2);
assert.equal(g[0].id, 'a');
assert.equal(g[0].pubs.length, 2);

console.log('OK');
