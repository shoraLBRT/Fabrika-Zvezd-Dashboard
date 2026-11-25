import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSnapshot, isApproximate, parseFrontMatter, validate} from '../scripts/export.mjs';

const root = mkdtempSync(join(tmpdir(), 'cos-'));
mkdirSync(join(root, 'content')); mkdirSync(join(root, 'data'));
const md = fm => '---\n' + Object.entries(fm).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join('\n') + '\n---\n\n# Текст\n\nСекретный черновик';
writeFileSync(join(root, 'content', 'a.md'), md({id: 'a', 'Название': 'А', 'Тематика': 'X', 'Статус': 'Идея', 'Источник идеи': 'личное', 'Серия': ['s']}));
writeFileSync(join(root, 'data', 'publications.json'), JSON.stringify([
  {id: 'p1', 'Материал': ['a'], 'Площадка': 'Telegram', 'Статус': 'Опубликовано', 'Дата публикации': '2026-11-23', 'Примечания': 'Дата приблизительная'},
  {id: 'p2', 'Материал': ['a'], 'Площадка': 'Threads', 'Статус': 'Запланировано', 'Плановая дата': '2026-11-30', 'Обоснование даты': 'внутреннее'},
]));
writeFileSync(join(root, 'data', 'goals.json'), JSON.stringify([{id: 'g', 'Тип': 'Площадка', 'Активна': true, 'Площадка': 'Telegram', 'Целевое количество': 2, 'Цель': 'текст', created_at: 'x'}]));
writeFileSync(join(root, 'data', 'series.json'), JSON.stringify([{id: 's', 'Название': 'S', Content: ['a'], 'Концепция': 'внутреннее'}]));

writeFileSync(join(root, 'data', 'metrics.json'), JSON.stringify({updated_at: 't', accounts: {Telegram: [{date: '2026-11-25', followers: 10, views: 50, posts: 2, secret: 'x'}]},
  posts: [{key: 'Telegram:1', 'Площадка': 'Telegram', 'Дата': '2026-11-23', 'Ссылка': 'https://t.me/c/1', 'Публикация': 'p1', metrics: {views: 40, text: 'Секретный черновик'}},
    {key: 'Telegram:2', 'Площадка': 'Telegram', 'Дата': '2026-11-24', 'Ссылка': 'javascript:alert(1)', 'Публикация': 'нет', metrics: {views: 10}}]}));
writeFileSync(join(root, 'data', 'inbox.json'), JSON.stringify([
  {key: 'Threads:9', 'Площадка': 'Threads', 'Дата публикации': '2026-11-24', 'Ссылка': 'https://www.threads.com/p/9', 'Внешний id': '9', 'Текст': 'Секретный черновик', 'Похожие публикации': []},
  {key: 'Threads:10', 'Площадка': 'Threads', 'Дата публикации': '2026-11-24', 'Текст': 'анонс', 'Решение': 'Игнорировать'},
]));
const s = buildSnapshot(root);
const text = JSON.stringify(s);
for (const secret of ['Источник идеи', 'личное', 'Примечания', 'Обоснование даты', 'Концепция', 'Секретный черновик', 'created_at']) assert.ok(!text.includes(secret), 'утечка: ' + secret);
assert.equal(s.publications[0].approximate, true);
assert.equal(s.publications[1]['Плановая дата'], '2026-11-30');
assert.equal(s.publications[1].approximate, undefined);
assert.deepEqual(s.publications.filter(p => p.unsorted), [{id: 'inbox:Threads:9', 'Публикация': 'Не разобранный пост', 'Площадка': 'Threads', 'Дата публикации': '2026-11-24', 'Статус': 'Опубликовано', unsorted: true}], 'очередь: без текста, без игнорируемых');

assert.deepEqual(s.stats.accounts.Telegram, [{date: '2026-11-25', followers: 10, views: 50, posts: 2}]);
assert.deepEqual(s.stats.posts[0], {'Площадка': 'Telegram', 'Дата': '2026-11-23', 'Ссылка': 'https://t.me/c/1', 'Публикация': 'p1', metrics: {views: 40}});
assert.deepEqual(s.stats.posts[1], {'Площадка': 'Telegram', 'Дата': '2026-11-24', metrics: {views: 10}});
assert.equal(isApproximate({'Дата приблизительная': false, 'Примечания': 'Дата приблизительная'}), false, 'уточнено по API');
assert.deepEqual(parseFrontMatter('---\n"id": "x"\n"n": 1\n---\ntext'), {id: 'x', n: 1});
assert.deepEqual(parseFrontMatter('---\r\nid: "x"\r\nИсточник идеи: "a: b"\r\nЦелевые площадки: ["Telegram"]\r\n---\r\ntext'), {id: 'x', 'Источник идеи': 'a: b', 'Целевые площадки': ['Telegram']}, 'ключи без кавычек');
assert.throws(() => parseFrontMatter('---\nid: x\n---'), /не JSON/);
assert.throws(() => validate({content: [], goals: [], series: [], publications: [{id: 'p', 'Материал': ['нет']}]}), /несуществующий/);
assert.throws(() => validate({content: [{id: 'a'}], goals: [], series: [], publications: [{id: 'p', 'Материал': ['a'], 'Статус': 'Запланировано'}]}), /без плановой даты/);
console.log('OK export');
