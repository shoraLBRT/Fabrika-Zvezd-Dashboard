// Экспорт публичного снимка из приватного Content OS.
// Использование: node scripts/export.mjs <путь к репозиторию Fabrika-Zvezd> [выходной файл]
// В data.json попадают ТОЛЬКО поля из списков ниже. Тексты материалов, источники идей,
// примечания и обоснования дат не экспортируются.
import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const ALLOW = {
  content: ['id', 'Название', 'Тематика', 'Статус', 'Формат', 'Приоритет', 'Серия', 'Номер выпуска', 'Целевые площадки'],
  publications: ['id', 'Публикация', 'Материал', 'Площадка', 'Дата публикации', 'Плановая дата', 'Статус'],
  goals: ['id', 'Тип', 'Активна', 'Площадка', 'Тематика', 'Целевое количество', 'Целевая доля'],
  series: ['id', 'Название', 'Content', 'Количество выпусков'],
};

// Статистика площадок (data/metrics.json): только числа, даты и ссылки на сами посты — без текстов.
export const STATS = {
  account: ['date', 'followers', 'views', 'posts'],
  metrics: ['views', 'reach', 'likes', 'comments', 'replies', 'reposts', 'quotes', 'shares', 'saved', 'avg_watch_ms'],
};

const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] !== undefined && obj[k] !== '' && obj[k] !== null).map(k => [k, obj[k]]));

/** Front matter content/*.md: строки вида "ключ": JSON-значение (допускается и ключ без кавычек). */
export function parseFrontMatter(text) {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw Error('нет front matter');
  const out = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const q = line.match(/^"([^"]+)":\s*(.*)$/) || line.match(/^([^":][^:]*):\s*(.*)$/);
    if (!q) throw Error('строка не в формате "ключ": значение — ' + line);
    try { out[q[1].trim()] = JSON.parse(q[2].trim()); }
    catch { throw Error(`значение не JSON — ${line}`); }
  }
  return out;
}

/** Дата считается приблизительной по явному полю или по пометке в примечаниях (правило 05). */
export const isApproximate = p => p['Дата приблизительная'] === true || (p['Дата приблизительная'] !== false && /приблизительн/i.test(p['Примечания'] || ''));

/**
 * Неразобранные посты из data/inbox.json (раздел 17 Content OS): выход подтверждён API, но материал ещё не назначен.
 * В дашборд попадают как публикации без материала — считаются в активности площадок, но не в тематическом балансе.
 * Текст поста не экспортируется; «Игнорировать» (анонсы, служебное) пропускаются.
 */
export function unsortedPubs(inbox) {
  return inbox.filter(x => x['Решение'] !== 'Игнорировать' && x['Площадка'] && /^\d{4}-\d{2}-\d{2}$/.test(x['Дата публикации'] || '')).map(x => ({
    id: 'inbox:' + (x.key || x['Площадка'] + ':' + x['Внешний id']),
    'Публикация': 'Не разобранный пост',
    'Площадка': x['Площадка'],
    'Дата публикации': x['Дата публикации'],
    'Статус': 'Опубликовано',
    unsorted: true,
  }));
}

/** Публичная часть статистики. Ссылка на публикацию — только если она есть в снимке. */
export function buildStats(m, pubIds) {
  const num = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)));
  const accounts = {};
  for (const [acc, list] of Object.entries(m.accounts || {})) accounts[acc] = list.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date)).map(x => ({date: x.date, ...num(pick(x, STATS.account.slice(1)))}));
  const posts = (m.posts || []).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x['Дата'])).map(x => ({
    'Площадка': x['Площадка'], 'Дата': x['Дата'],
    ...(/^https:\/\//.test(x['Ссылка'] || '') ? {'Ссылка': x['Ссылка']} : {}),
    ...(pubIds.has(x['Публикация']) ? {'Публикация': x['Публикация']} : {}),
    metrics: num(pick(x.metrics || {}, STATS.metrics)),
  }));
  return {updated_at: m.updated_at || null, accounts, posts};
}

export function buildSnapshot(root) {
  const read = f => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));
  const content = readdirSync(join(root, 'content')).filter(f => f.endsWith('.md')).sort()
    .map(f => { try { return pick(parseFrontMatter(readFileSync(join(root, 'content', f), 'utf8')), ALLOW.content); } catch (e) { throw Error(`content/${f}: ${e.message}`); } });
  const publications = read('publications.json').map(p => {
    const x = pick(p, ALLOW.publications);
    if (p['Дата публикации'] && isApproximate(p)) x.approximate = true;
    return x;
  });
  const inboxFile = join(root, 'data', 'inbox.json');
  const unsorted = existsSync(inboxFile) ? unsortedPubs(JSON.parse(readFileSync(inboxFile, 'utf8'))) : [];
  const snapshot = {
    content,
    goals: read('goals.json').map(g => pick(g, ALLOW.goals)),
    publications: [...publications, ...unsorted],
    series: read('series.json').map(s => pick(s, ALLOW.series)),
  };
  validate(snapshot);
  const mf = join(root, 'data', 'metrics.json');
  if (existsSync(mf)) snapshot.stats = buildStats(JSON.parse(readFileSync(mf, 'utf8')), new Set(publications.map(p => p.id)));
  return snapshot;
}

/** Проверка связей: экспорт падает, если ссылка ведёт в никуда или id повторяется. */
export function validate(s) {
  const errors = [];
  const ids = new Map();
  for (const kind of ['content', 'goals', 'publications', 'series']) for (const x of s[kind]) {
    if (!x.id) errors.push(`${kind}: запись без id`);
    else if (ids.has(x.id)) errors.push(`повтор id ${x.id}`);
    else ids.set(x.id, kind);
  }
  const ref = (from, id, kind) => { if (ids.get(id) !== kind) errors.push(`${from}: ссылка на несуществующий ${kind} ${id}`); };
  for (const p of s.publications) {
    if (p.unsorted) continue;
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
  console.log(`Экспорт: ${s.content.length} материалов, ${s.publications.length} публикаций (из них не разобрано ${s.publications.filter(p => p.unsorted).length}), ${s.goals.length} целей, ${s.series.length} серий${s.stats ? `, статистика: ${Object.keys(s.stats.accounts).join(', ') || 'пусто'}` : ''} → ${out}`);
}
