// Экспорт публичного снимка из приватного Content OS.
// Использование: node scripts/export.mjs <путь к репозиторию Fabrika-Zvezd> [выходной файл]
// В data.json попадают ТОЛЬКО поля из списков ниже. Тексты материалов, источники идей,
// примечания и обоснования дат не экспортируются.
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const ALLOW = {
  content: ['id', 'Название', 'Тематика', 'Статус', 'Формат', 'Приоритет', 'Серия', 'Номер выпуска', 'Целевые площадки'],
  publications: ['id', 'Публикация', 'Материал', 'Площадка', 'Дата публикации', 'Плановая дата', 'Статус'],
  goals: ['id', 'Тип', 'Активна', 'Площадка', 'Тематика', 'Целевое количество', 'Целевая доля'],
  series: ['id', 'Название', 'Content', 'Количество выпусков'],
};

const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] !== undefined && obj[k] !== '' && obj[k] !== null).map(k => [k, obj[k]]));

/** Front matter content/*.md: строки вида "ключ": JSON-значение. */
export function parseFrontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw Error('нет front matter');
  const out = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const i = line.indexOf('":');
    if (!line.startsWith('"') || i < 0) throw Error('строка не в формате "ключ": значение — ' + line);
    out[line.slice(1, i)] = JSON.parse(line.slice(i + 2).trim());
  }
  return out;
}

/** Дата считается приблизительной по явному полю или по пометке в примечаниях (правило 05). */
export const isApproximate = p => p['Дата приблизительная'] === true || /приблизительн/i.test(p['Примечания'] || '');

export function buildSnapshot(root) {
  const read = f => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));
  const content = readdirSync(join(root, 'content')).filter(f => f.endsWith('.md')).sort()
    .map(f => pick(parseFrontMatter(readFileSync(join(root, 'content', f), 'utf8')), ALLOW.content));
  const publications = read('publications.json').map(p => {
    const x = pick(p, ALLOW.publications);
    if (p['Дата публикации'] && isApproximate(p)) x.approximate = true;
    return x;
  });
  const snapshot = {
    content,
    goals: read('goals.json').map(g => pick(g, ALLOW.goals)),
    publications,
    series: read('series.json').map(s => pick(s, ALLOW.series)),
  };
  validate(snapshot);
  return snapshot;
}

/** Проверка связей: экспорт падает, если ссылка ведёт в никуда или id повторяется. */
export function validate(s) {
  const errors = [];
  const ids = new Map();
  for (const [kind, list] of Object.entries(s)) for (const x of list) {
    if (!x.id) errors.push(`${kind}: запись без id`);
    else if (ids.has(x.id)) errors.push(`повтор id ${x.id}`);
    else ids.set(x.id, kind);
  }
  const ref = (from, id, kind) => { if (ids.get(id) !== kind) errors.push(`${from}: ссылка на несуществующий ${kind} ${id}`); };
  for (const p of s.publications) {
    if (!p['Материал']?.length) errors.push(`публикация ${p.id} без материала`);
    for (const id of p['Материал'] || []) ref(`публикация ${p.id}`, id, 'content');
    if (p['Статус'] === 'Запланировано' && !p['Плановая дата']) errors.push(`публикация ${p.id}: запланирована без плановой даты`);
    for (const k of ['Дата публикации', 'Плановая дата']) if (p[k] && !/^\d{4}-\d{2}-\d{2}$/.test(p[k])) errors.push(`публикация ${p.id}: дата ${k} не в формате ГГГГ-ММ-ДД`);
  }
  for (const c of s.content) for (const id of c['Серия'] || []) ref(`материал ${c.id}`, id, 'series');
  for (const x of s.series) for (const id of x.Content || []) ref(`серия ${x.id}`, id, 'content');
  if (errors.length) throw Error('Ошибки данных:\n' + errors.join('\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [root, out = 'data.json'] = process.argv.slice(2);
  if (!root) { console.error('Укажите путь к репозиторию Fabrika-Zvezd'); process.exit(2); }
  const s = buildSnapshot(root);
  writeFileSync(out, JSON.stringify(s, null, 2) + '\n');
  console.log(`Экспорт: ${s.content.length} материалов, ${s.publications.length} публикаций, ${s.goals.length} целей, ${s.series.length} серий → ${out}`);
}
