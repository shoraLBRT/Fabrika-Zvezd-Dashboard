// Чистые функции расчётов. Без DOM — покрыты tests/logic.test.mjs.

export const dateKey = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
export const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5) + 1;

/** Неделя понедельник–воскресенье, содержащая дату d. */
export function week(d) {
  const start = shift(d, -((d.getDay() + 6) % 7));
  return [dateKey(start), dateKey(shift(start, 6))];
}

/** Диапазон периода: '7' | '30' | '90' | '365' | 'all' | 'custom'. Пустые границы — без ограничения. */
export function range(p, d, from = '', to = '') {
  if (p === 'all') return ['', ''];
  if (p === 'custom') return [from, to];
  return [dateKey(shift(d, 1 - Number(p))), dateKey(d)];
}

/** Опубликованные публикации в диапазоне. Без диапазона — все, включая недатированные. */
export function selectPubs(p, a, b) {
  return p.filter(x => x['Статус'] === 'Опубликовано' && (!(a || b) || x['Дата публикации'] && (!a || x['Дата публикации'] >= a) && (!b || x['Дата публикации'] <= b)));
}

/** Тематический баланс по уникальным материалам. gap = цель − факт, п.п. */
export function balance(c, p, g) {
  const ids = new Set(p.flatMap(x => x['Материал'] || [])), items = c.filter(x => ids.has(x.id));
  return g.map(x => {
    const name = x['Тематика'], target = x['Целевая доля'] * 100, count = items.filter(y => y['Тематика'] === name).length;
    const actual = items.length ? 100 * count / items.length : null;
    return { name, target, actual, count, gap: actual === null ? null : target - actual };
  });
}

/** Фактические границы для отчёта: пустые заменяются крайними датами публикаций / сегодняшним днём. */
export function effectiveRange(pubs, [a, b], today) {
  const dated = pubs.map(x => x['Дата публикации']).filter(Boolean).sort();
  return [a || dated[0] || today, b || today];
}

/** Шаг агрегации графика по длине периода. */
export const granularity = days => days <= 31 ? 'day' : days <= 190 ? 'week' : 'month';

/** Корзины для графика динамики: [{key, from, to}] без пропусков, включая пустые. */
export function buckets(a, b, gran) {
  const out = [];
  let cur = parseKey(a);
  const end = parseKey(b);
  if (gran === 'week') cur = parseKey(week(cur)[0]);
  if (gran === 'month') cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
  while (cur <= end && out.length < 400) {
    let next;
    if (gran === 'day') next = shift(cur, 1);
    else if (gran === 'week') next = shift(cur, 7);
    else next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    out.push({ key: dateKey(cur), from: dateKey(cur), to: dateKey(shift(next, -1)) });
    cur = next;
  }
  return out;
}

/** Норма площадки за период из недельной цели: цель × дни / 7. */
export const proratedTarget = (weekly, days) => weekly * days / 7;

/** Публикации, сгруппированные по материалу (кросспосты — одна строка). Сортировка по последней дате. */
export function groupByMaterial(pubs) {
  const map = new Map();
  for (const p of pubs) {
    const key = (p['Материал'] || [])[0] || p.id;
    if (!map.has(key)) map.set(key, { id: key, pubs: [] });
    map.get(key).pubs.push(p);
  }
  const last = g => g.pubs.map(x => x['Дата публикации'] || '').sort().at(-1);
  return [...map.values()].sort((x, y) => last(y).localeCompare(last(x)));
}
