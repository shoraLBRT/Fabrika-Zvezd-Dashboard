import {dateKey, parseKey, daysBetween, range, selectPubs, balance, effectiveRange, granularity, buckets, proratedTarget, groupByMaterial, periodBounds} from './logic.js';

// ---------- Константы ----------
const TABS = {overview: 1, content: 1, analytics: 1, series: 1};
// Порядок = порядок в стеке графика; цвета проверены на различимость при дальтонизме (соседние пары).
const PLATFORM_ORDER = ['Telegram', 'Instagram Reels', 'YouTube Shorts', 'Threads'];
const PLATFORM_SHORT = {'Telegram': 'Telegram', 'Instagram Reels': 'Reels', 'YouTube Shorts': 'Shorts', 'Threads': 'Threads'};
const PRIORITY = {'Высокий': 0, 'Обычный': 1, 'Низкий': 2};
const DEFICIT_DAYS = '30';

const UNITS = {
  week: {name: 'Неделя', acc: 'неделю', cur: 'текущая неделя', prev: 'прошлая неделя', forms: ['неделю', 'недели', 'недель']},
  month: {name: 'Месяц', acc: 'месяц', cur: 'текущий месяц', prev: 'прошлый месяц', forms: ['месяц', 'месяца', 'месяцев']},
  quarter: {name: 'Квартал', acc: 'квартал', cur: 'текущий квартал', prev: 'прошлый квартал', forms: ['квартал', 'квартала', 'кварталов']},
  year: {name: 'Год', acc: 'год', cur: 'текущий год', prev: 'прошлый год', forms: ['год', 'года', 'лет']},
};

// ---------- Состояние ----------
const app = document.querySelector('#app');
const state = {
  tab: 'overview',
  overview: {unit: 'week', offset: 0},
  analytics: {unit: 'month', offset: 0, from: '', to: ''},
  content: {view: 'ideas', platform: ''},
};
let data;

// ---------- Утилиты ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = (x, d = 1) => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: d}).format(x);
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const ROMAN = ['I', 'II', 'III', 'IV'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const plural = (n, one, few, many) => { const a = Math.abs(n), m10 = a % 10, m100 = a % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many; };
const pl = (n, forms) => `${n} ${plural(n, ...forms)}`;
const PUBS = ['публикация', 'публикации', 'публикаций'];
const IDEAS = ['идея', 'идеи', 'идей'];
const today = () => dateKey(new Date());

const dShort = k => { const d = parseKey(k); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const dRange = (a, b) => {
  const x = parseKey(a), y = parseKey(b);
  if (a === b) return dShort(a);
  if (x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear()) return `${x.getDate()}–${y.getDate()} ${MONTHS[y.getMonth()]}`;
  return `${dShort(a)} – ${dShort(b)}`;
};

const platformIdx = name => { const i = PLATFORM_ORDER.indexOf(name); return i < 0 ? 4 : i; };
const dot = name => `<i class="dot p${platformIdx(name)}" aria-hidden="true"></i>`;
const platformGoals = () => data.goals.filter(g => g['Активна'] && g['Тип'] === 'Площадка').sort((a, b) => platformIdx(a['Площадка']) - platformIdx(b['Площадка']));
const themeGoals = () => data.goals.filter(g => g['Активна'] && g['Тип'] === 'Тематика');
const published = () => selectPubs(data.publications, '', '');
const materialIds = p => new Set(p.flatMap(x => x['Материал'] || []));
const contentById = id => data.content.find(c => c.id === id);
const trackingStart = () => published().map(p => p['Дата публикации']).filter(Boolean).sort()[0] || today();

/** Неопубликованные материалы по тематикам + дефицит за последние 30 дней, отсортировано по дефициту. */
function ideaBank() {
  const pubIds = materialIds(published());
  const stats = balance(data.content, selectPubs(data.publications, ...range(DEFICIT_DAYS, new Date())), themeGoals());
  const names = [...new Set([...stats.map(x => x.name), ...data.content.map(c => c['Тематика']).filter(Boolean)])];
  return names.map(name => {
    const s = stats.find(x => x.name === name);
    const ideas = data.content.filter(c => c['Тематика'] === name && !pubIds.has(c.id))
      .sort((x, y) => (PRIORITY[x['Приоритет']] ?? 1) - (PRIORITY[y['Приоритет']] ?? 1));
    return {name, ideas, gap: s?.gap ?? null, deficit: s?.gap > 0.05};
  }).sort((x, y) => (y.gap ?? -1e9) - (x.gap ?? -1e9));
}

// ---------- Компоненты ----------
const card = (title, body, {cls = '', aside = ''} = {}) => `<section class="card ${cls}"><header class="card-h"><h2>${title}</h2>${aside}</header>${body}</section>`;
const empty = text => `<p class="empty">${text}</p>`;
const segmented = (id, options, value) => `<div class="seg" role="group" id="${id}">${options.map(([v, n]) => `<button type="button" data-value="${v}" aria-pressed="${v === value}">${n}</button>`).join('')}</div>`;

/** Бар с отметкой цели. */
function meter(value, target, max, {ok = value >= target, label = '', cls = ''} = {}) {
  const w = max ? Math.min(100, value / max * 100) : 0, t = max ? Math.min(100, target / max * 100) : 0;
  return `<div class="meter ${ok ? 'ok' : ''} ${cls}" role="img" aria-label="${esc(label)}">
    <div class="meter-fill" style="width:${w}%"></div>
    ${target ? `<div class="meter-target" style="left:${t}%"></div>` : ''}
  </div>`;
}

/** Заголовок и подпись календарного периода. */
function periodTitle(unit, offset, [a, b]) {
  const x = parseKey(a);
  const title = unit === 'week' ? dRange(a, b)
    : unit === 'month' ? `${MONTHS_NOM[x.getMonth()]} ${x.getFullYear()}`
    : unit === 'quarter' ? `${ROMAN[Math.floor(x.getMonth() / 3)]} квартал ${x.getFullYear()}`
    : String(x.getFullYear());
  const u = UNITS[unit];
  let caption = offset === 0 ? u.cur : offset === -1 ? u.prev : offset > 0 ? 'будущий период' : `${pl(-offset, u.forms)} назад`;
  if (offset === 0) caption += ` · день ${daysBetween(a, today())} из ${daysBetween(a, b)}`;
  else if (unit === 'quarter') caption = `${dShort(a)} – ${dShort(b)} · ${caption}`;
  return {title, caption};
}

/** Переключатель «неделя / месяц / квартал / год» и навигация назад–вперёд. */
function periodNav(scope, extra = []) {
  const st = state[scope];
  const units = [...Object.entries(UNITS).map(([k, u]) => [k, u.name]), ...extra];
  let nav = '';
  if (UNITS[st.unit]) {
    const {title, caption} = periodTitle(st.unit, st.offset, periodBounds(st.unit, st.offset, new Date()));
    nav = `<div class="pnav">
      <button type="button" class="pbtn" data-step="-1" aria-label="Предыдущий период">‹</button>
      <div class="pnav-t"><b>${esc(title)}</b><span>${esc(caption)}</span></div>
      <button type="button" class="pbtn" data-step="1" aria-label="Следующий период" ${st.offset >= 0 ? 'disabled' : ''}>›</button>
      ${st.offset !== 0 ? '<button type="button" class="link" data-step="0">к текущему</button>' : ''}
    </div>`;
  } else if (st.unit === 'custom') {
    nav = `<div class="pnav"><input aria-label="Начало" data-date="from" type="date" value="${esc(st.from)}"><span class="muted">—</span><input aria-label="Конец" data-date="to" type="date" value="${esc(st.to)}"></div>`;
  } else {
    nav = `<div class="pnav"><div class="pnav-t"><b>Всё время</b><span>с ${dShort(trackingStart())} — начало учёта</span></div></div>`;
  }
  return `<div class="period" data-scope="${scope}">${segmented(scope + '-unit', units, st.unit)}${nav}</div>`;
}

/** Диапазон периода вкладки: [начало, конец] (пустые — без ограничения). */
function scopeRange(scope) {
  const st = state[scope];
  if (UNITS[st.unit]) return periodBounds(st.unit, st.offset, new Date());
  if (st.unit === 'custom') return [st.from, st.to];
  return ['', ''];
}

/** Столбчатый график, сложенный по площадкам. */
function columns(pubs, a, b) {
  const gran = granularity(daysBetween(a, b));
  const weekdays = gran === 'day' && daysBetween(a, b) <= 7;
  const per = buckets(a, b, gran).map(x => {
    const ps = pubs.filter(p => p['Дата публикации'] >= x.from && p['Дата публикации'] <= x.to);
    const by = {};
    for (const p of ps) by[p['Площадка']] = (by[p['Площадка']] || 0) + 1;
    return {...x, total: ps.length, by: Object.entries(by).sort((p, q) => platformIdx(p[0]) - platformIdx(q[0]))};
  });
  const max = Math.max(1, ...per.map(x => x.total)), t = today();
  const label = x => gran === 'month' ? MONTHS_SHORT[parseKey(x.from).getMonth()] : gran === 'week' ? dShort(x.from) : weekdays ? WD[(parseKey(x.from).getDay() + 6) % 7] : String(parseKey(x.from).getDate());
  const every = weekdays || gran === 'month' ? 1 : Math.ceil(per.length / (gran === 'week' ? 7 : 10));
  const tip = x => `${gran === 'day' ? dShort(x.from) : dRange(x.from, x.to)} — ${pl(x.total, PUBS)}${x.by.length ? '\n' + x.by.map(([k, v]) => `${k}: ${v}`).join('\n') : ''}`;
  const bars = per.map((x, i) => `<div class="col ${x.from <= t && t <= x.to ? 'now' : ''} ${x.from > t ? 'future' : ''}" data-tip="${esc(tip(x))}" tabindex="0" aria-label="${esc(tip(x))}">
      <div class="col-val">${x.total || ''}</div>
      <div class="col-bar" style="height:${x.total / max * 100}%">${x.by.map(([k, v]) => `<i class="p${platformIdx(k)}" style="flex:${v}"></i>`).join('')}</div>
      <div class="col-x">${i % every === 0 ? esc(label(x)) : ''}</div>
    </div>`).join('');
  const platforms = [...new Set(pubs.map(p => p['Площадка']))].sort((x, y) => platformIdx(x) - platformIdx(y));
  const legend = platforms.length > 1 ? `<div class="legend">${platforms.map(p => `<span>${dot(p)}${esc(p)}</span>`).join('')}</div>` : '';
  return {html: `<div class="cols" style="--n:${per.length}">${bars}</div>${legend}`, unit: {day: 'по дням', week: 'по неделям', month: 'по месяцам'}[gran]};
}

// ---------- Обзор ----------
function overview() {
  const {unit, offset} = state.overview;
  const [a, b] = periodBounds(unit, offset, new Date());
  const pubs = selectPubs(data.publications, a, b);
  const isCurrent = offset === 0, isFuture = a > today();
  const days = daysBetween(a, b);

  const rows = platformGoals().map(g => {
    const name = g['Площадка'], n = pubs.filter(p => p['Площадка'] === name).length;
    const target = Math.max(1, Math.round(proratedTarget(g['Целевое количество'], days)));
    const left = target - n, done = left <= 0;
    const status = done ? '<span class="badge good">✓ выполнено</span>'
      : isCurrent || isFuture ? `<span class="badge neutral">осталось ${left}</span>`
      : `<span class="badge warn">не хватило ${left}</span>`;
    return {done, html: `<div class="plan-row">
      <div class="plan-name">${dot(name)}${esc(name)}</div>
      <div class="plan-bar">${meter(n, 0, Math.max(n, target), {ok: done, cls: 'thick', label: `${name}: ${n} из ${target}`})}</div>
      <div class="plan-n"><b>${n}</b> из ${target}</div>
      <div class="plan-s">${status}</div>
    </div>`};
  });
  const doneCount = rows.filter(r => r.done).length;
  const cells = rows.map(r => `<i class="${r.done ? 'on' : ''}"></i>`).join('');
  const summary = `<div class="plan-sum">
    <div class="plan-cells" aria-hidden="true">${cells}</div>
    <div><b>${doneCount} из ${rows.length}</b> площадок ${isCurrent ? 'уже ' : ''}выполнили план</div>
  </div>`;
  const planNote = unit !== 'week' ? `<p class="note">План = недельная цель × ${num(days / 7)} нед.</p>` : '';

  const chart = columns(pubs, a, b);
  const bank = ideaBank(), total = bank.reduce((s, x) => s + x.ideas.length, 0);
  const bankRows = bank.map(x => {
    const n = x.ideas.length;
    const cls = n === 0 && x.deficit ? 'alert' : n === 0 ? 'zero' : '';
    return `<li class="stock ${cls}">
      <span class="stock-name">${esc(x.name)}${x.deficit ? `<small>отстаёт от цели на ${num(x.gap, 0)} п.п.</small>` : ''}</span>
      <span class="stock-n">${n || '—'}</span>
    </li>`;
  }).join('');
  const empties = bank.filter(x => !x.ideas.length && x.deficit).length;

  return `${periodNav('overview')}<div class="layout-2">
    ${card(`План на ${UNITS[unit].acc}`, summary + rows.map(r => r.html).join('') + planNote, {cls: 'span-r2'})}
    ${card('Публикации', pubs.length ? chart.html : empty('За этот период публикаций нет'), {aside: `<span class="muted">${chart.unit}</span>`})}
    ${card('Запас идей', `<ul class="stocks">${bankRows}</ul>${empties ? `<p class="note warn-text">Нет идей в ${pl(empties, ['отстающей тематике', 'отстающих тематиках', 'отстающих тематиках'])} — стоит пополнить</p>` : ''}`,
      {aside: `<a class="link" href="#content">${pl(total, IDEAS)} →</a>`})}
  </div>`;
}

// ---------- Контент ----------
function content() {
  const st = state.content;
  const bank = ideaBank(), totalIdeas = bank.reduce((s, x) => s + x.ideas.length, 0);
  const groups = groupByMaterial(published());
  const seriesName = id => data.series.find(s => s.id === id)?.['Название'];
  const tabs = segmented('content-view', [['ideas', `Банк идей · ${totalIdeas}`], ['published', `Опубликовано · ${groups.length}`]], st.view);

  if (st.view === 'ideas') {
    const ideaRow = x => {
      const meta = [x['Формат'], x['Серия']?.length ? `${seriesName(x['Серия'][0]) || 'серия'}${x['Номер выпуска'] ? `, выпуск ${x['Номер выпуска']}` : ''}` : '', x['Статус'] !== 'Идея' ? x['Статус'] : ''].filter(Boolean);
      return `<li class="row">${x['Приоритет'] === 'Высокий' ? '<span class="prio" title="Высокий приоритет">↑</span>' : ''}<div class="row-main"><div class="row-t">${esc(x['Название'])}</div>${meta.length ? `<div class="row-m">${esc(meta.join(' · '))}</div>` : ''}</div></li>`;
    };
    const sections = bank.map(x => `<section class="group">
      <header class="group-h"><h3>${esc(x.name)}</h3>${x.deficit ? `<span class="gap">−${num(x.gap, 0)} п.п.</span>` : ''}<span class="group-n">${x.ideas.length || ''}</span></header>
      ${x.ideas.length ? `<ul class="rows">${x.ideas.map(ideaRow).join('')}</ul>` : `<p class="group-empty ${x.deficit ? 'warn-text' : ''}">${x.deficit ? 'Идей нет, а тематика отстаёт' : 'Идей нет'}</p>`}
    </section>`).join('');
    return `<div class="toolbar">${tabs}</div>
      <section class="card list">
        <p class="hint">Тематики отсортированы по отставанию от целевой доли за последние 30 дней. <span class="gap">−N п.п.</span> — насколько тематика ниже цели.</p>
        ${sections}
      </section>`;
  }

  const filtered = groups.filter(g => !st.platform || g.pubs.some(p => p['Площадка'] === st.platform));
  const platforms = [['', 'Все'], ...platformGoals().map(g => [g['Площадка'], `${dot(g['Площадка'])}${esc(PLATFORM_SHORT[g['Площадка']] || g['Площадка'])}`])];
  const lastDate = g => g.pubs.map(p => p['Дата публикации'] || '').sort().at(-1);
  const byMonth = new Map();
  for (const g of filtered) {
    const d = lastDate(g), key = d ? d.slice(0, 7) : '';
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(g);
  }
  const row = g => {
    const c = contentById(g.id), d = lastDate(g), approx = g.pubs.some(p => p.approximate);
    const plats = [...g.pubs].sort((x, y) => platformIdx(x['Площадка']) - platformIdx(y['Площадка']));
    const parts = g.pubs.length > 1 && new Set(g.pubs.map(p => p['Публикация'])).size > 1 ? ` · ${g.pubs.length} поста` : '';
    return `<li class="row pub">
      <span class="pub-d">${d ? (approx ? '≈' : '') + dShort(d) : '—'}</span>
      <div class="row-main"><div class="row-t">${esc(c?.['Название'] || g.pubs[0]['Публикация'])}</div><div class="row-m">${esc(c?.['Тематика'] || '')}${parts}</div></div>
      <span class="pub-p">${[...new Set(plats.map(p => p['Площадка']))].map(p => `<span class="tag">${dot(p)}${esc(PLATFORM_SHORT[p] || p)}</span>`).join('')}</span>
    </li>`;
  };
  const sections = [...byMonth.entries()].map(([k, gs]) => {
    const title = k ? `${MONTHS_NOM[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}` : 'Без даты';
    return `<section class="group"><header class="group-h"><h3>${title}</h3><span class="group-n">${gs.length}</span></header><ul class="rows">${gs.map(row).join('')}</ul></section>`;
  }).join('');
  return `<div class="toolbar">${tabs}${segmented('content-platform', platforms, st.platform)}</div>
    <section class="card list">
      <p class="hint">Один материал — одна строка, даже если вышел на нескольких площадках. ≈ — дата приблизительная.</p>
      ${sections || empty('Публикаций нет')}
    </section>`;
}

// ---------- Аналитика ----------
function analytics() {
  const st = state.analytics;
  const [ra, rb] = scopeRange('analytics');
  const pubs = selectPubs(data.publications, ra, rb);
  const [a, b] = effectiveRange(published(), [ra, rb], today());
  // Дни для норм: только учтённые (с начала учёта и не дальше сегодняшнего дня).
  const tracked = trackingStart(), from = a > tracked ? a : tracked, to = b > today() ? today() : b;
  const days = to >= from ? daysBetween(from, to) : 0;
  const uniq = materialIds(pubs).size;
  const activeDays = new Set(pubs.map(p => p['Дата публикации']).filter(Boolean)).size;

  // Сравнение с предыдущим периодом того же размера.
  let prev = null;
  if (UNITS[st.unit]) {
    const [pa, pb] = periodBounds(st.unit, st.offset - 1, new Date());
    if (pb >= tracked) { const pp = selectPubs(data.publications, pa, pb); prev = {pubs: pp.length, uniq: materialIds(pp).size}; }
  }
  const delta = (cur, was) => {
    if (prev == null) return '';
    const d = cur - was;
    return `<span class="dlt ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲ +' : d < 0 ? '▼ −' : '= '}${Math.abs(d) || ''}</span>`;
  };
  const approx = pubs.filter(p => p.approximate).length;
  const undated = UNITS[st.unit] || st.unit === 'custom' ? published().filter(p => !p['Дата публикации']).length : 0;
  const summary = `<div class="summary card">
    <div class="sum"><span class="sum-v">${pubs.length}${delta(pubs.length, prev?.pubs)}</span><span class="sum-l">${plural(pubs.length, ...PUBS)}</span></div>
    <div class="sum"><span class="sum-v">${uniq}${delta(uniq, prev?.uniq)}</span><span class="sum-l">${plural(uniq, 'материал', 'материала', 'материалов')}</span></div>
    <div class="sum"><span class="sum-v">${activeDays}<small>/${days}</small></span><span class="sum-l">дней с публикацией</span></div>
    ${prev ? `<p class="note sum-note">▲▼ — к прошлому периоду${approx ? ` · ≈ ${approx} ${plural(approx, 'дата приблизительная', 'даты приблизительные', 'дат приблизительные')}` : ''}${undated ? ` · ${undated} без даты не учтено` : ''}</p>` : approx ? `<p class="note sum-note">≈ ${approx} ${plural(approx, 'дата приблизительная', 'даты приблизительные', 'дат приблизительные')}</p>` : ''}
  </div>`;

  const s = balance(data.content, pubs, themeGoals()).sort((x, y) => (y.gap ?? -1e9) - (x.gap ?? -1e9));
  const maxShare = Math.max(50, ...s.map(x => Math.max(x.target, x.actual ?? 0)));
  const themeRows = s.map(x => {
    const gap = x.gap, cls = gap == null ? '' : gap > 0.05 ? 'neg' : 'pos';
    const d = gap == null ? '—' : `${gap > 0.05 ? '−' : gap < -0.05 ? '+' : '±'}${num(Math.abs(gap), 0)}`;
    return `<tr>
      <th scope="row">${esc(x.name)}</th>
      <td class="w">${meter(x.actual ?? 0, x.target, maxShare, {ok: gap != null && gap <= 0.05, label: `${x.name}: ${num(x.actual ?? 0)}% при цели ${num(x.target)}%`})}</td>
      <td class="r">${x.actual == null ? '—' : num(x.actual, 0) + '%'}</td>
      <td class="r muted">${num(x.target)}%</td>
      <td class="r delta ${cls}">${d}</td>
    </tr>`;
  }).join('');
  const themeTable = uniq ? `<table class="tbl"><thead><tr><th>Тематика</th><th class="w"><span class="leg-fill"></span>факт <span class="leg-tick"></span>цель</th><th class="r">Факт</th><th class="r">Цель</th><th class="r">Δ п.п.</th></tr></thead><tbody>${themeRows}</tbody></table>`
    : empty('Недостаточно данных: за период нет опубликованных материалов');

  const pg = platformGoals();
  const platRows = pg.map(g => {
    const name = g['Площадка'], n = pubs.filter(p => p['Площадка'] === name).length;
    const norm = proratedTarget(g['Целевое количество'], days), pct = norm ? n / norm * 100 : 0;
    return `<tr>
      <th scope="row">${dot(name)}${esc(name)}</th>
      <td class="w">${meter(n, norm, Math.max(n, norm, 1) * 1.15, {label: `${name}: ${n} при норме ${num(norm)}`})}</td>
      <td class="r"><b>${n}</b></td>
      <td class="r muted">${num(norm)}</td>
      <td class="r delta ${pct >= 100 ? 'pos' : 'neg'}">${norm ? num(pct, 0) + '%' : '—'}</td>
    </tr>`;
  }).join('');
  const platTable = days ? `<table class="tbl"><thead><tr><th>Площадка</th><th class="w"></th><th class="r">Факт</th><th class="r">Норма</th><th class="r">Выполн.</th></tr></thead><tbody>${platRows}</tbody></table>
    <p class="note">Норма = недельная цель × ${pl(days, ['учтённый день', 'учтённых дня', 'учтённых дней'])} / 7. Учёт ведётся с ${dShort(tracked)}.</p>`
    : empty('Период до начала учёта — данных нет');

  const chart = columns(pubs, a, b);
  return periodNav('analytics', [['all', 'Всё'], ['custom', 'Даты']]) + summary + `<div class="layout-2 even">
    ${card('Тематический баланс', themeTable, {aside: '<span class="muted">по уникальным материалам</span>'})}
    ${card('Площадки', platTable, {aside: '<span class="muted">по публикациям</span>'})}
  </div>` + card('Динамика', pubs.length ? chart.html : empty('Нет публикаций за период'), {aside: `<span class="muted">${chart.unit}</span>`});
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
        <div><div class="row-t">${esc(x['Название'])}</div>
        <div class="row-m">${ps.length ? ps.map(p => `<span class="tag">${dot(p['Площадка'])}${esc(PLATFORM_SHORT[p['Площадка']] || p['Площадка'])} ${p['Дата публикации'] ? (p.approximate ? '≈' : '') + dShort(p['Дата публикации']) : ''}</span>`).join('') : esc([x['Статус'], x['Формат']].filter(Boolean).join(' · '))}</div></div>
      </li>`;
    };
    return `<section class="card">
      <header class="card-h"><h2>${esc(s['Название'])}</h2><span class="muted">${total ? 'фиксированный размер' : 'размер не задан'}</span></header>
      <div class="series-p">${meter(n, 0, total || Math.max(items.length, 1), {ok: false, label: size})}<span class="muted">опубликовано ${size}</span></div>
      <ol class="eps">${items.map(ep).join('')}</ol>
    </section>`;
  }).join('')}</div>`;
}

// ---------- Рендер и события ----------
function render() {
  document.querySelectorAll('nav [data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'));
  app.innerHTML = ({overview, content, analytics, series}[state.tab])();
}

app.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  const seg = btn.closest('.seg');
  if (seg) {
    const [scope, key] = seg.id.split('-');
    state[scope][key] = btn.dataset.value;
    if (key === 'unit') state[scope].offset = 0;
    return render();
  }
  if (btn.dataset.step != null) {
    const st = state[btn.closest('.period').dataset.scope], step = Number(btn.dataset.step);
    st.offset = step === 0 ? 0 : Math.min(0, st.offset + step);
    render();
  }
});
app.addEventListener('change', e => {
  const k = e.target.dataset.date;
  if (k) { state.analytics[k] = e.target.value; render(); }
});

// Подсказка для столбцов графика: наведение, фокус, касание.
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

function setTab(t) {
  if (!TABS[t]) t = 'overview';
  state.tab = t;
  if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t);
  scrollTo(0, 0);
  if (data) render();
}
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
