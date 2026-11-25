import assert from 'node:assert/strict';
import {week, range, selectPubs, balance, daysBetween, effectiveRange, granularity, buckets, proratedTarget, groupByMaterial, periodBounds, selectPlanned, channelOf, themeByChannel} from '../logic.js';

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

const d = new Date(2026, 10, 25);
assert.deepEqual(periodBounds('week', 0, d), ['2026-11-23', '2026-11-29']);
assert.deepEqual(periodBounds('week', -1, d), ['2026-11-16', '2026-11-22']);
assert.deepEqual(periodBounds('month', 0, d), ['2026-11-01', '2026-11-30']);
assert.deepEqual(periodBounds('month', -9, d), ['2026-02-01', '2026-02-28']);
assert.deepEqual(periodBounds('month', 2, d), ['2027-01-01', '2027-01-31']);
assert.deepEqual(periodBounds('quarter', 0, d), ['2026-10-01', '2026-12-31']);
assert.deepEqual(periodBounds('quarter', -4, d), ['2025-10-01', '2025-12-31']);
assert.deepEqual(periodBounds('year', -1, d), ['2025-01-01', '2025-12-31']);

const plan = [{'Статус': 'Запланировано', 'Плановая дата': '2026-11-28'}, {'Статус': 'Запланировано'}, {'Статус': 'Опубликовано', 'Плановая дата': '2026-11-28'}];
assert.equal(selectPlanned(plan).length, 1);
assert.equal(selectPlanned(plan, '2026-11-29').length, 0);
assert.equal(channelOf('YouTube Shorts'), 'Короткие видео');
assert.equal(channelOf('Telegram'), 'Telegram');
// кросспост Reels + Shorts — один материал в канале «Короткие видео»
const tc = themeByChannel([{id: 'a', 'Тематика': 'X'}, {id: 'b', 'Тематика': 'Y'}], [
  {'Площадка': 'Instagram Reels', 'Материал': ['a']}, {'Площадка': 'YouTube Shorts', 'Материал': ['a']}, {'Площадка': 'Telegram', 'Материал': ['a']}, {'Площадка': 'Telegram', 'Материал': ['b']}]);
assert.deepEqual(tc.cells, {X: {'Короткие видео': 1, Telegram: 1}, Y: {Telegram: 1}});
assert.deepEqual(tc.totals, {'Короткие видео': 1, Telegram: 2});

console.log('OK');

// Статистика аккаунтов
{
  const {accountPeriod, gains} = await import('../logic.js');
  const L = [{date: '2026-11-20', followers: 100, views: 1000}, {date: '2026-11-22', followers: 104, views: 1300}, {date: '2026-11-23', followers: 103, views: 1290}, {date: '2026-11-25', followers: 110, views: 1500}];
  const r = accountPeriod(L, '2026-11-22', '2026-11-25');
  assert.equal(r.points.length, 3);
  assert.equal(r.followersDelta, 10, 'от снимка до начала периода');
  assert.equal(r.viewsGained, 500);
  assert.equal(r.fromStart, false);
  const all = accountPeriod(L);
  assert.equal(all.followersDelta, 10);
  assert.equal(all.fromStart, true);
  assert.equal(accountPeriod([], '2026-11-01', '2026-11-30').followersDelta, null);
  assert.deepEqual(gains(L).map(x => x.views), [300, 0, 210]);
  assert.deepEqual(gains(L).map(x => x.followers), [4, -1, 7]);
  console.log('OK stats');
}

// Служебная тематика «Мусор»: не входит ни в баланс, ни в матрицу каналов.
{
  const c = [{id: 'a', 'Тематика': 'X'}, {id: 'm', 'Тематика': 'Мусор'}];
  const ps = [{'Материал': ['a'], 'Площадка': 'Telegram'}, {'Материал': ['m'], 'Площадка': 'Telegram'}];
  assert.equal(balance(c, ps, [{'Тематика': 'X', 'Целевая доля': 1}])[0].actual, 100, 'мусор не в знаменателе');
  assert.deepEqual(themeByChannel(c, ps), {cells: {X: {Telegram: 1}}, totals: {Telegram: 1}});
  // Threads — мусорная площадка: материал, вышедший только там, тематику не получает.
  const t = [{'Материал': ['a'], 'Площадка': 'Threads'}, {'Материал': ['b'], 'Площадка': 'Telegram'}];
  const cb = [{id: 'a', 'Тематика': 'X'}, {id: 'b', 'Тематика': 'Y'}];
  assert.deepEqual(balance(cb, t, [{'Тематика': 'X', 'Целевая доля': 0.5}, {'Тематика': 'Y', 'Целевая доля': 0.5}]).map(x => x.count), [0, 1]);
  assert.deepEqual(themeByChannel(cb, t), {cells: {Y: {Telegram: 1}}, totals: {Telegram: 1}});
  console.log('OK hidden themes');
}

// Что выкладываем на неделе
{
  const {weekNeeds, ideaChannels} = await import('../logic.js');
  const goals = [{'Площадка': 'Telegram', 'Целевое количество': 2}, {'Площадка': 'Threads', 'Целевое количество': 5}, {'Площадка': 'Instagram Reels', 'Целевое количество': 2}, {'Площадка': 'YouTube Shorts', 'Целевое количество': 2}];
  const content = [
    {id: 'v1', 'Статус': 'Идея', 'Формат': 'Короткое видео', 'Тематика': 'A'},
    {id: 'v2', 'Статус': 'Идея', 'Формат': 'Короткое видео', 'Тематика': 'B'},
    {id: 'v3', 'Статус': 'Готово к публикации', 'Формат': 'Короткое видео', 'Тематика': 'A'},
    {id: 't1', 'Статус': 'Идея', 'Формат': 'Текст', 'Тематика': 'B', 'Целевые площадки': ['Telegram']},
    {id: 't2', 'Статус': 'Идея', 'Формат': 'Текст', 'Тематика': 'Мусор'},
    {id: 'p', 'Статус': 'Идея', 'Формат': 'Короткое видео', 'Тематика': 'B'},
  ];
  const plans = [{'Площадка': 'Instagram Reels', 'Материал': ['p'], 'Статус': 'Запланировано'}, {'Площадка': 'YouTube Shorts', 'Материал': ['p'], 'Статус': 'Запланировано'}];
  const pubs = [{'Площадка': 'Telegram', 'Материал': ['x'], 'Статус': 'Опубликовано'}];
  const themes = [{name: 'A', gap: 1}, {name: 'B', gap: 10}];
  const r = weekNeeds({goals, content, pubs, plans, allPubs: [...pubs, ...plans], themes});
  const v = r.find(x => x.channel === 'Короткие видео'), tg = r.find(x => x.channel === 'Telegram');
  assert.equal(r.some(x => x.channel === 'Threads'), false, 'Threads не планируется');
  assert.equal(v.need, 1, 'план закрыл один ролик на обеих площадках');
  assert.deepEqual(v.ideas.map(x => x.c.id), ['v3'], 'готовое — первым');
  assert.equal(tg.need, 1);
  assert.deepEqual(tg.ideas.map(x => x.c.id), ['t1'], 'мусор не предлагается');
  const r2 = weekNeeds({goals, content: [], pubs: [], plans: [], allPubs: [], themes});
  assert.equal(r2.find(x => x.channel === 'Короткие видео').missing, 2);
  assert.deepEqual(r2[0].wanted.map(x => x.name), ['B', 'A'], 'нужная тематика — по дефициту');
  assert.deepEqual(ideaChannels({'Формат': 'Текст', 'Целевые площадки': ['Instagram Reels', 'YouTube Shorts']}), ['Короткие видео']);
  console.log('OK week needs');
}
