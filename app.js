import {dateKey, parseKey, shift, daysBetween, week, range, selectPubs, balance, effectiveRange, granularity, buckets, proratedTarget, groupByMaterial} from './logic.js';

// ---------- Состояние ----------
const TABS = {overview: 'Обзор', content: 'Контент', analytics: 'Аналитика', series: 'Длительные темы'};
const PERIODS = [['7', '7 дн'], ['30', '30 дн'], ['90', '90 дн'], ['365', 'Год'], ['all', 'Всё'], ['custom', 'Свой']];
// Порядок = порядок в стеке графика; цвета проверены на различимость при дальтонизме (соседние пары).
const PLATFORM_ORDER = ['Telegram', 'Instagram Reels', 'YouTube Shorts', 'Threads'];
const PRIORITY = {'Высокий': 0, 'Обычный': 1, 'Низкий': 2};

const app = document.querySelector('#app');
const state = {tab: 'overview', period: '30', from: '', to: '', category: '', platform: '', weekOffset: 0};
let data;

// ---------- Утилиты ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = (x, d = 1) => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: d}).format(x);
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const dShort = k => { const d = parseKey(k); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const dRange = (a, b) => {
  if (!a || !b) return 'всё время';
  const x = parseKey(a), y = parseKey(b);
  if (a === b) return dShort(a);
  if (x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear()) return `${x.getDate()}–${y.getDate()} ${MONTHS[y.getMonth()]}`;
  return `${dShort(a)} – ${dShort(b)}`;
};
const plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many; };
const today = () => dateKey(new Date());

const platformIdx = name => { const i = PLATFORM_ORDER.indexOf(name); return i < 0 ? 4 : i; };
const dot = name => `<i class="dot p${platformIdx(name)}" aria-hidden="true"></i>`;
const chip = (text, cls = '') => `<span class="chip ${cls}">${text}</span>`;

const platformGoals = () => data.goals.filter(g => g['Активна'] && g['Тип'] === 'Площадка').sort((a, b) => platformIdx(a['Площадка']) - platformIdx(b['Площадка']));
const themeGoals = () => data.goals.filter(g => g['Активна'] && g['Тип'] === 'Тематика');
const published = () => selectPubs(data.publications, '', '');
const materialIds = p => new Set(p.flatMap(x => x['Материал'] || []));
const contentById = id => data.content.find(c => c.id === id);
const periodRange = () => range(state.period, new Date(), state.from, state.to);
const periodPubs = () => selectPubs(data.publications, ...periodRange());
const periodLabel = () => { const [a, b] = periodRange(); return state.period === 'all' ? 'всё время' : dRange(a, b); };

/** Бар с отметкой цели. value и target — в одних единицах, max — шкала. */
function meter(value, target, max, {ok = value >= target, label = ''} = {}) {
  const w = max ? Math.min(100, value / max * 100) : 0, t = max ? Math.min(100, target / max * 100) : 0;
  return `<div class="meter ${ok ? 'ok' : ''}" role="img" aria-label="${esc(label)}">
    <div class="meter-fill" style="width:${w}%"></div>
    ${target ? `<div class="meter-target" style="left:${t}%"></div>` : ''}
  </div>`;
}

/** Точки «сделано / норма» для малых целых чисел. */
function pips(n, target) {
  const total = Math.max(n, target), shown = Math.min(total, 12);
  let s = '';
  for (let i = 0; i < shown; i++) s += `<i class="pip ${i < n ? (i < target ? 'on' : 'extra') : ''}"></i>`;
  return `<span class="pips" aria-hidden="true">${s}${total > shown ? '<b>…</b>' : ''}</span>`;
}

function segmented(id, options, value) {
  return `<div class="seg" role="group" id="${id}">${options.map(([v, n]) => `<button type="button" data-value="${v}" aria-pressed="${v === value}">${n}</button>`).join('')}</div>`;
}

function periodControl() {
  return `<div class="toolbar">
    ${segmented('period', PERIODS, state.period)}
    ${state.period === 'custom' ? `<span class="dates"><input aria-label="Начало" id="from" type="date" value="${esc(state.from)}"><span>—</span><input aria-label="Конец" id="to" type="date" value="${esc(state.to)}"></span>` : ''}
    <span class="muted">${esc(periodLabel())}</span>
  </div>`;
}

const card = (title, body, {cls = '', aside = ''} = {}) => `<section class="card ${cls}"><header class="card-h"><h2>${title}</h2>${aside}</header>${body}</section>`;
const stat = (label, value, sub = '') => `<div class="stat"><div class="stat-l">${label}</div><div class="stat-v">${value}</div>${sub ? `<div class="stat-s">${sub}</div>` : ''}</div>`;
const empty = text => `<p class="empty">${text}</p>`;

/** Столбчатый график по корзинам, сложенный по площадкам. */
function columns(pubs, a, b, gran = granularity(daysBetween(a, b)), {weekdays = false} = {}) {
  const bs = buckets(a, b, gran);
  const per = bs.map(x => {
    const ps = pubs.filter(p => p['Дата публикации'] >= x.from && p['Дата публикации'] <= x.to);
    const by = {};
    for (const p of ps) by[p['Площадка']] = (by[p['Площадка']] || 0) + 1;
    return {...x, total: ps.length, by};
  });
  const max = Math.max(1, ...per.map(x => x.total));
  const todayKey = today();
  const label = x => gran === 'month' ? MONTHS_FULL[parseKey(x.from).getMonth()].slice(0, 3)
    : gran === 'week' ? dShort(x.from) : weekdays ? WD[(parseKey(x.from).getDay() + 6) % 7] : String(parseKey(x.from).getDate());
  const every = Math.ceil(per.length / (weekdays ? 7 : 10));
  const platforms = [...new Set(pubs.map(p => p['Площадка']))].sort((x, y) => platformIdx(x) - platformIdx(y));
  const tip = x => {
    const when = gran === 'day' ? dShort(x.from) : dRange(x.from, x.to);
    const lines = Object.entries(x.by).sort((p, q) => platformIdx(p[0]) - platformIdx(q[0])).map(([k, v]) => `${k}: ${v}`);
    return `${when} — ${x.total} ${plural(x.total, 'публикация', 'публикации', 'публикаций')}${lines.length ? '\n' + lines.join('\n') : ''}`;
  };
  const bars = per.map((x, i) => `<div class="col ${x.from <= todayKey && todayKey <= x.to ? 'now' : ''} ${x.from > todayKey ? 'future' : ''}" data-tip="${esc(tip(x))}" tabindex="0" aria-label="${esc(tip(x))}">
      <div class="col-val">${x.total || ''}</div>
      <div class="col-bar" style="height:${x.total / max * 100}%">${Object.entries(x.by).sort((p, q) => platformIdx(p[0]) - platformIdx(q[0])).map(([k, v]) => `<i class="p${platformIdx(k)}" style="flex:${v}"></i>`).join('')}</div>
      <div class="col-x">${i % every === 0 || weekdays ? esc(label(x)) : ''}</div>
    </div>`).join('');
  const legend = platforms.length > 1 ? `<div class="legend">${platforms.map(p => `<span>${dot(p)}${esc(p)}</span>`).join('')}</div>` : '';
  const unit = {day: 'по дням', week: 'по неделям', month: 'по месяцам'}[gran];
  return {html: `<div class="cols" style="--n:${per.length}">${bars}</div>${legend}`, unit};
}

/** Сноска о полноте данных для датированного отчёта. */
function completeness(pubs) {
  const approx = pubs.filter(p => p.approximate).length;
  const undated = published().filter(p => !p['Дата публикации']).length;
  const parts = [];
  if (approx) parts.push(`≈ ${approx} ${plural(approx, 'дата приблизительная', 'даты приблизительные', 'дат приблизительные')}`);
  if (undated && state.period !== 'all') parts.push(`${undated} без даты исключено`);
  return parts.length ? `<span class="note">${parts.join(' · ')}</span>` : '';
}

// ---------- Обзор ----------
function overview() {
  const ref = shift(new Date(), state.weekOffset * 7);
  const [a, b] = week(ref);
  const pubs = selectPubs(data.publications, a, b);
  const goals = platformGoals();
  const isCurrent = state.weekOffset === 0;
  const dayN = isCurrent ? daysBetween(a, today()) : 7;

  const rows = goals.map(g => {
    const name = g['Площадка'], n = pubs.filter(p => p['Площадка'] === name).length, t = g['Целевое количество'];
    const left = t - n;
    const status = left <= 0 ? `<span class="badge good">✓ норма</span>` : `<span class="badge ${isCurrent ? 'neutral' : 'warn'}">${isCurrent ? 'ещё' : 'недобор'} ${left}</span>`;
    return `<div class="norm">${dot(name)}<span class="norm-name">${esc(name)}</span>${pips(n, t)}<span class="norm-n"><b>${n}</b>/${t}</span>${status}</div>`;
  }).join('');
  const met = goals.filter(g => pubs.filter(p => p['Площадка'] === g['Площадка']).length >= g['Целевое количество']).length;
  const done = goals.reduce((s, g) => s + Math.min(g['Целевое количество'], pubs.filter(p => p['Площадка'] === g['Площадка']).length), 0);
  const target = goals.reduce((s, g) => s + g['Целевое количество'], 0);

  const nav = `<div class="weeknav">
    <button type="button" id="wprev" aria-label="Предыдущая неделя">‹</button>
    <div class="weeknav-t"><b>${dRange(a, b)}</b><span class="muted">${isCurrent ? `текущая · день ${dayN} из 7` : state.weekOffset === -1 ? 'прошлая неделя' : `${-state.weekOffset} ${plural(-state.weekOffset, 'неделя', 'недели', 'недель')} назад`}</span></div>
    <button type="button" id="wnext" aria-label="Следующая неделя" ${isCurrent ? 'disabled' : ''}>›</button>
    ${isCurrent ? '' : '<button type="button" id="wnow" class="link">к текущей</button>'}
  </div>`;

  const head = `<div class="hero">
    <div><div class="hero-v">${met}<span>/${goals.length}</span></div><div class="muted">норм площадок выполнено</div></div>
    <div class="hero-meter">${meter(done, isCurrent ? target * dayN / 7 : target, target, {ok: done >= target * dayN / 7, label: `${done} из ${target} публикаций по нормам`})}<div class="muted">${done} из ${target} публикаций по нормам${isCurrent && dayN < 7 ? ` · │ — темп к сегодня ≈ ${num(target * dayN / 7, 0)}` : ''}</div></div>
  </div>`;

  const chart = columns(pubs, a, b, 'day', {weekdays: true});
  const all = published(), allIds = materialIds(all);
  const ideas = data.content.filter(c => !allIds.has(c.id)).length;
  const weekMaterials = materialIds(pubs).size;

  return `<div class="layout-2">
    ${card('Неделя', nav + head + `<div class="norms">${rows}</div>`, {cls: 'span-r2'})}
    ${card('По дням', pubs.length ? chart.html : empty('Нет зарегистрированных публикаций за неделю'), {aside: `<span class="muted">${pubs.length} ${plural(pubs.length, 'публикация', 'публикации', 'публикаций')} · ${weekMaterials} ${plural(weekMaterials, 'материал', 'материала', 'материалов')}</span>`})}
    <div class="stats">
      ${stat('Публикаций', all.length, 'за всё время')}
      ${stat('Материалов', allIds.size, 'опубликовано')}
      ${stat('Банк идей', ideas, 'не опубликовано')}
    </div>
  </div>`;
}

// ---------- Контент ----------
function content() {
  const pubs = periodPubs(), stats = balance(data.content, pubs, themeGoals()), pubIds = materialIds(published());
  const cats = [...new Set([...stats.map(x => x.name), ...data.content.map(c => c['Тематика']).filter(Boolean)])];
  const byName = n => stats.find(x => x.name === n);
  const gapOf = n => byName(n)?.gap ?? -Infinity;

  const filters = `<div class="toolbar">
    ${segmented('category', [['', 'Все тематики'], ...cats.map(c => [c, c])], state.category)}
    <select id="platform" aria-label="Площадка"><option value="">Все площадки</option>${platformGoals().map(g => `<option ${state.platform === g['Площадка'] ? 'selected' : ''}>${esc(g['Площадка'])}</option>`).join('')}</select>
  </div>`;

  const ideasOf = c => data.content
    .filter(x => x['Тематика'] === c && !pubIds.has(x.id) && (!state.platform || !x['Целевые площадки']?.length || x['Целевые площадки'].includes(state.platform)))
    .sort((x, y) => (PRIORITY[x['Приоритет']] ?? 1) - (PRIORITY[y['Приоритет']] ?? 1));
  const seriesName = id => data.series.find(s => s.id === id)?.['Название'];

  const ideaRow = x => {
    const meta = [x['Формат'], x['Статус'] !== 'Идея' ? x['Статус'] : '', x['Серия']?.length ? `${seriesName(x['Серия'][0]) || 'Серия'}${x['Номер выпуска'] ? ' · №' + x['Номер выпуска'] : ''}` : '', x['Целевые площадки']?.join(', ')].filter(Boolean);
    return `<li class="idea">${x['Приоритет'] === 'Высокий' ? '<span class="prio" title="Высокий приоритет">↑</span>' : ''}<div><div class="idea-t">${esc(x['Название'])}</div><div class="meta">${meta.map(esc).join(' · ')}</div></div></li>`;
  };

  const blocks = cats.filter(c => !state.category || c === state.category).sort((x, y) => gapOf(y) - gapOf(x)).map(c => {
    const s = byName(c), ideas = ideasOf(c);
    const deficit = s?.gap > 0.05;
    const badge = s?.actual == null ? chip('нет данных', 'neutral') : deficit ? chip(`▼ дефицит ${num(s.gap)} п.п.`, 'warn') : chip('✓ в норме', 'good');
    const bal = s ? `<div class="cat-bal">${meter(s.actual ?? 0, s.target, Math.max(50, s.target * 2, s.actual ?? 0), {ok: !deficit, label: `Факт ${num(s.actual ?? 0)}%, цель ${num(s.target)}%`})}<span class="muted">${s.actual == null ? '—' : num(s.actual) + '%'} из ${num(s.target)}%</span></div>` : '';
    const warnEmpty = deficit && !ideas.length;
    return `<section class="cat ${deficit ? 'attention' : ''}">
      <header class="cat-h"><h3>${esc(c)}</h3><span class="count">${ideas.length}</span>${badge}</header>
      ${bal}
      ${ideas.length ? `<ul class="ideas">${ideas.map(ideaRow).join('')}</ul>` : `<p class="empty ${warnEmpty ? 'warn-text' : ''}">${warnEmpty ? 'Нет идей при дефиците — стоит пополнить банк' : 'Нет идей'}</p>`}
    </section>`;
  }).join('');

  const hist = groupByMaterial(pubs.filter(x => (!state.platform || x['Площадка'] === state.platform) && (!state.category || (x['Материал'] || []).some(id => contentById(id)?.['Тематика'] === state.category))));
  const histRow = g => {
    const c = contentById(g.id), title = c?.['Название'] || g.pubs[0]['Публикация'];
    const sorted = [...g.pubs].sort((x, y) => platformIdx(x['Площадка']) - platformIdx(y['Площадка']));
    return `<li class="hist">
      <div class="hist-t">${esc(title)}${g.pubs.length > 1 && new Set(g.pubs.map(p => p['Публикация'])).size > 1 ? ` <span class="muted">· ${g.pubs.length} ${plural(g.pubs.length, 'пост', 'поста', 'постов')}</span>` : ''}</div>
      <div class="meta">${c?.['Тематика'] ? esc(c['Тематика']) + ' · ' : ''}${sorted.map(p => `<span class="pl">${dot(p['Площадка'])}${esc(p['Площадка'])} ${p['Дата публикации'] ? (p.approximate ? '≈' : '') + dShort(p['Дата публикации']) : 'дата неизвестна'}</span>`).join('')}</div>
    </li>`;
  };
  const histCount = hist.reduce((s, g) => s + g.pubs.length, 0);

  return periodControl() + filters + `<div class="layout-2 even">
    <div>${`<div class="section-h"><h2>Банк идей</h2><span class="muted">сортировка по дефициту тематики за период</span></div>`}${blocks}</div>
    ${card('История публикаций', hist.length ? `<ul class="hlist">${hist.map(histRow).join('')}</ul>` : empty('Нет публикаций за период'), {aside: `<span class="muted">${hist.length} ${plural(hist.length, 'материал', 'материала', 'материалов')} · ${histCount} ${plural(histCount, 'публикация', 'публикации', 'публикаций')}</span>`})}
  </div>`;
}

// ---------- Аналитика ----------
function analytics() {
  const pubs = periodPubs(), [a, b] = effectiveRange(published(), periodRange(), today());
  // Учёт ведётся с первой датированной публикации: дни до неё — неизвестность, а не нулевая активность.
  const tracked = published().map(p => p['Дата публикации']).filter(Boolean).sort()[0] || a;
  const from = a > tracked ? a : tracked, to = b > today() ? today() : b;
  const days = Math.max(1, daysBetween(from, to < from ? from : to));
  const clipped = from > a ? `<p class="note">Нормы и средние считаются с начала учёта — ${dShort(tracked)} (${days} ${plural(days, 'день', 'дня', 'дней')})</p>` : '';
  const uniq = materialIds(pubs).size;
  const activeDays = new Set(pubs.map(p => p['Дата публикации']).filter(Boolean)).size;
  const s = balance(data.content, pubs, themeGoals()).sort((x, y) => (y.gap ?? -1e9) - (x.gap ?? -1e9));

  const tiles = `<div class="stats four">
    ${stat('Публикации', pubs.length, completeness(pubs) || '&nbsp;')}
    ${stat('Уникальные материалы', uniq, uniq ? `× ${num(pubs.length / uniq)} публикаций на материал` : '&nbsp;')}
    ${stat('Активных дней', `${activeDays}<span>/${days}</span>`, days ? `${num(activeDays / days * 100, 0)}% дней с публикацией` : '')}
    ${stat('В среднем', num(pubs.length / days * 7), 'публикаций в неделю')}
  </div>`;

  const maxShare = Math.max(50, ...s.map(x => Math.max(x.target, x.actual ?? 0)));
  const themeRows = s.map(x => {
    const gap = x.gap, cls = gap == null ? '' : gap > 0.05 ? 'neg' : 'pos';
    const delta = gap == null ? '—' : `${gap > 0.05 ? '−' : gap < -0.05 ? '+' : '±'}${num(Math.abs(gap))}`;
    return `<tr>
      <th scope="row">${esc(x.name)}</th>
      <td class="w">${meter(x.actual ?? 0, x.target, maxShare, {ok: gap != null && gap <= 0.05, label: `${x.name}: ${num(x.actual ?? 0)}% при цели ${num(x.target)}%`})}</td>
      <td class="r">${x.actual == null ? '—' : num(x.actual) + '%'} <span class="muted">(${x.count})</span></td>
      <td class="r muted">${num(x.target)}%</td>
      <td class="r delta ${cls}">${delta}</td>
    </tr>`;
  }).join('');
  const themeTable = uniq ? `<table class="tbl"><thead><tr><th>Тематика</th><th class="w"><span class="leg-fill"></span>факт <span class="leg-tick"></span>цель</th><th class="r">Факт</th><th class="r">Цель</th><th class="r">Δ п.п.</th></tr></thead><tbody>${themeRows}</tbody></table>`
    : empty('Недостаточно данных: нет опубликованных материалов за период');

  const pg = platformGoals();
  const platRows = pg.map(g => {
    const name = g['Площадка'], n = pubs.filter(p => p['Площадка'] === name).length;
    const norm = proratedTarget(g['Целевое количество'], days), pct = norm ? n / norm * 100 : 0;
    return `<tr>
      <th scope="row">${dot(name)}${esc(name)}</th>
      <td class="w">${meter(n, norm, Math.max(n, norm) * 1.15, {label: `${name}: ${n} при норме ${num(norm)}`})}</td>
      <td class="r"><b>${n}</b></td>
      <td class="r muted">${num(norm)}</td>
      <td class="r delta ${pct >= 100 ? 'pos' : 'neg'}">${num(pct, 0)}%</td>
    </tr>`;
  }).join('');
  const other = pubs.filter(p => !pg.some(g => g['Площадка'] === p['Площадка'])).length;
  const platTable = `<table class="tbl"><thead><tr><th>Площадка</th><th class="w"></th><th class="r">Факт</th><th class="r">Норма</th><th class="r">Выполн.</th></tr></thead><tbody>${platRows}</tbody></table>
    <p class="note">Норма = недельная цель × ${days} ${plural(days, 'день', 'дня', 'дней')} / 7${other ? ` · ещё ${other} на площадках без цели` : ''}</p>${clipped}`;

  const chart = columns(pubs, a, b);
  return periodControl() + tiles + `<div class="layout-2 even">
    ${card('Тематический баланс', themeTable, {aside: `<span class="muted">по ${uniq} уникальным материалам</span>`})}
    ${card('Площадки', platTable, {aside: '<span class="muted">по публикациям</span>'})}
  </div>` + card('Динамика публикаций', pubs.length ? chart.html : empty('Нет публикаций за период'), {aside: `<span class="muted">${chart.unit}</span>`});
}

// ---------- Длительные темы ----------
function series() {
  const all = published(), pubIds = materialIds(all);
  if (!data.series.length) return empty('Нет серий');
  return `<div class="series-grid">${data.series.map(s => {
    const items = data.content.filter(x => s.Content?.includes(x.id) || x['Серия']?.includes(s.id)).sort((a, b) => (a['Номер выпуска'] || 99) - (b['Номер выпуска'] || 99));
    const n = items.filter(x => pubIds.has(x.id)).length, total = s['Количество выпусков'];
    const size = total ? `${n} из ${total}` : `${n} из ${items.length} известных`;
    const ep = (x, i) => {
      const ps = all.filter(p => p['Материал']?.includes(x.id));
      return `<li class="ep ${ps.length ? 'done' : ''}">
        <span class="ep-n">${x['Номер выпуска'] || i + 1}</span>
        <div><div class="idea-t">${esc(x['Название'])}</div>
        <div class="meta">${ps.length ? ps.map(p => `<span class="pl">${dot(p['Площадка'])}${esc(p['Площадка'])} ${p['Дата публикации'] ? (p.approximate ? '≈' : '') + dShort(p['Дата публикации']) : ''}</span>`).join('') : esc([x['Статус'], x['Формат']].filter(Boolean).join(' · '))}</div></div>
      </li>`;
    };
    return `<section class="card">
      <header class="card-h"><h2>${esc(s['Название'])}</h2>${chip(total ? 'фикс. размер' : 'размер не задан', 'neutral')}</header>
      <div class="series-p">${meter(n, 0, total || Math.max(items.length, 1), {ok: false, label: size})}<span class="muted">опубликовано ${size}</span></div>
      <ol class="eps">${items.map(ep).join('')}</ol>
    </section>`;
  }).join('')}</div>`;
}

// ---------- Рендер ----------
function render() {
  document.querySelectorAll('nav [data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'));
  app.innerHTML = ({overview, content, analytics, series}[state.tab])();
  bind();
}

function bind() {
  document.querySelectorAll('.seg').forEach(g => g.addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    state[g.id] = btn.dataset.value; render();
  }));
  for (const id of ['from', 'to', 'platform']) document.getElementById(id)?.addEventListener('change', e => { state[id] = e.target.value; render(); });
  const w = (id, fn) => document.getElementById(id)?.addEventListener('click', () => { fn(); render(); });
  w('wprev', () => state.weekOffset--);
  w('wnext', () => state.weekOffset = Math.min(0, state.weekOffset + 1));
  w('wnow', () => state.weekOffset = 0);
}

// Всплывающая подсказка для столбцов графика: наведение, фокус, касание.
const tipEl = Object.assign(document.createElement('div'), {className: 'tip', role: 'tooltip'});
document.body.append(tipEl);
const showTip = el => {
  tipEl.textContent = el.dataset.tip; tipEl.style.display = 'block';
  const r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  tipEl.style.left = Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2)) + 'px';
  tipEl.style.top = Math.max(8, r.top - t.height - 6) + scrollY + 'px';
};
const hideTip = () => { tipEl.style.display = 'none'; };
for (const ev of ['pointerover', 'focusin']) document.addEventListener(ev, e => { const el = e.target.closest?.('[data-tip]'); el ? showTip(el) : hideTip(); });
document.addEventListener('pointerout', e => { if (e.target.closest?.('[data-tip]') && !e.relatedTarget?.closest?.('[data-tip]')) hideTip(); });
addEventListener('scroll', hideTip, {passive: true});

function setTab(t) { if (!TABS[t]) t = 'overview'; state.tab = t; if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t); if (data) render(); }
document.querySelectorAll('nav [data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
addEventListener('hashchange', () => setTab(location.hash.slice(1)));
setTab(location.hash.slice(1) || 'overview');

fetch('./data.json', {cache: 'no-store'})
  .then(r => { if (!r.ok) throw Error(r.status); return r.json(); })
  .then(d => {
    data = d;
    const last = published().map(p => p['Дата публикации']).filter(Boolean).sort().at(-1);
    document.querySelector('#updated').textContent = last ? `последняя публикация ${dShort(last)}` : '';
    render();
  })
  .catch(() => { app.innerHTML = empty('Не удалось загрузить данные. Обновите страницу.'); });
