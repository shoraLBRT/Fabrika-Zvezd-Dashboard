import {dateKey, parseKey, daysBetween, range, selectPubs, balance, effectiveRange, granularity, buckets, proratedTarget, groupByMaterial, periodBounds, selectPlanned, CHANNELS, themeByChannel} from './logic.js';

// ---------- Константы ----------
const TABS = {overview: 1, content: 1, analytics: 1, series: 1};
// Порядок в списках и в стеке графика. Цвета — фирменные (style.css, классы .p0…).
const PLATFORM_ORDER = ['Telegram', 'Threads', 'Instagram Reels', 'YouTube Shorts', 'TikTok'];
const PLATFORM_SHORT = {'Telegram': 'Telegram', 'Threads': 'Threads', 'Instagram Reels': 'Reels', 'YouTube Shorts': 'Shorts', 'TikTok': 'TikTok'};
const PRIORITY = {'Высокий': 0, 'Обычный': 1, 'Низкий': 2};
const DEFICIT_DAYS = '30';

const UNITS = {
  week: {name: 'Неделя', acc: 'неделю', cur: 'текущая неделя', prev: 'прошлая неделя', next: 'следующая неделя', forms: ['неделю', 'недели', 'недель']},
  month: {name: 'Месяц', acc: 'месяц', cur: 'текущий месяц', prev: 'прошлый месяц', next: 'следующий месяц', forms: ['месяц', 'месяца', 'месяцев']},
  quarter: {name: 'Квартал', acc: 'квартал', cur: 'текущий квартал', prev: 'прошлый квартал', next: 'следующий квартал', forms: ['квартал', 'квартала', 'кварталов']},
  year: {name: 'Год', acc: 'год', cur: 'текущий год', prev: 'прошлый год', next: 'следующий год', forms: ['год', 'года', 'лет']},
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
const IDEAS = ['идея', 'идеи', 'идей'];
const today = () => dateKey(new Date());

const dShort = k => { const d = parseKey(k); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const dRange = (a, b) => {
  const x = parseKey(a), y = parseKey(b);
  if (a === b) return dShort(a);
  if (x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear()) return `${x.getDate()}–${y.getDate()} ${MONTHS[y.getMonth()]}`;
  return `${dShort(a)} – ${dShort(b)}`;
};
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };

const platformIdx = name => { const i = PLATFORM_ORDER.indexOf(name); return i < 0 ? 9 : i; };
const pcls = name => 'p' + Math.min(platformIdx(name), 5);
const short = name => PLATFORM_SHORT[name] || name;
const dot = name => `<i class="dot ${pcls(name)}" aria-hidden="true"></i>`;
const tag = (name, extra = '', cls = '') => `<span class="tag ${cls}">${dot(name)}${esc(short(name))}${extra ? ' · ' + extra : ''}</span>`;
const platformGoals = () => data.goals.filter(g => g['Активна'] && g['Тип'] === 'Площадка').sort((a, b) => platformIdx(a['Площадка']) - platformIdx(b['Площадка']));
const themeGoals = () => data.goals.filter(g => g['Активна'] && g['Тип'] === 'Тематика');
const published = () => selectPubs(data.publications, '', '');
const planned = (a = '', b = '') => selectPlanned(data.publications, a, b).sort((x, y) => x['Плановая дата'].localeCompare(y['Плановая дата']));
const materialIds = p => new Set(p.flatMap(x => x['Материал'] || []));
const contentById = id => data.content.find(c => c.id === id);
const trackingStart = () => published().map(p => p['Дата публикации']).filter(Boolean).sort()[0] || today();
const pubDate = p => p['Дата публикации'] || p['Плановая дата'];

/** Неопубликованные материалы по тематикам + дефицит за последние 30 дней, отсортировано по дефициту. */
function ideaBank() {
  const pubIds = materialIds(published());
  const stats = balance(data.content, selectPubs(data.publications, ...range(DEFICIT_DAYS, new Date())), themeGoals());
  const names = [...new Set([...stats.map(x => x.name), ...data.content.map(c => c['Тематика']).filter(Boolean)])];
  return names.map(name => {
    const s = stats.find(x => x.name === name);
    const ideas = data.content.filter(c => c['Тематика'] === name && !pubIds.has(c.id))
      .sort((x, y) => (PRIORITY[x['Приоритет']] ?? 1) - (PRIORITY[y['Приоритет']] ?? 1));
    return {name, ideas, gap: s?.gap ?? null, actual: s?.actual ?? null, target: s?.target ?? null, deficit: s?.gap > 0.05};
  }).sort((x, y) => (y.gap ?? -1e9) - (x.gap ?? -1e9));
}

// ---------- Компоненты ----------
/** Значок ⓘ с подсказкой вместо длинных пояснений. */
const info = text => `<span class="info" data-tip="${esc(text)}" tabindex="0" role="img" aria-label="${esc(text)}">i</span>`;
const card = (title, body, {cls = '', aside = '', tip = ''} = {}) => `<section class="card ${cls}"><header class="card-h"><h2>${title}${tip ? info(tip) : ''}</h2>${aside}</header>${body}</section>`;
const pct = x => x == null ? '0%' : num(x, 0) + '%';
/** Доля тематики против цели — человеческими словами, с подсказкой. */
const shareTip = (x, days) => `За ${days} дней на тематику пришлось ${pct(x.actual)} опубликованных материалов, а цель — ${pct(x.target)}.` + (x.deficit ? `\nНе хватает ${num(x.gap, 0)} процентных пунктов.` : '');
const approxTip = 'Дата приблизительная';
const empty = text => `<p class="empty">${text}</p>`;
const segmented = (id, options, value) => `<div class="seg" role="group" id="${id}">${options.map(([v, n]) => `<button type="button" data-value="${v}" aria-pressed="${v === value}">${n}</button>`).join('')}</div>`;

/** Бар с отметкой цели. fill — класс цвета заливки, plan — запланированный сегмент (штриховка). */
function meter(value, target, max, {ok = value >= target, label = '', cls = '', fill = '', plan = 0} = {}) {
  const w = max ? Math.min(100, value / max * 100) : 0, t = max ? Math.min(100, target / max * 100) : 0;
  const pw = max ? Math.min(100 - w, plan / max * 100) : 0;
  return `<div class="meter ${ok ? 'ok' : ''} ${cls}" role="img" aria-label="${esc(label)}">
    <div class="meter-fill ${fill}" style="width:${w}%"></div>
    ${pw > 0 ? `<div class="meter-plan ${fill}" style="left:${w}%;width:${pw}%"></div>` : ''}
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
  let caption = offset === 0 ? u.cur : offset === -1 ? u.prev : offset === 1 ? u.next : offset > 0 ? `через ${pl(offset, u.forms)}` : `${pl(-offset, u.forms)} назад`;
  if (offset === 0) caption += ` · день ${daysBetween(a, today())} из ${daysBetween(a, b)}`;
  else if (unit === 'quarter') caption = `${dShort(a)} – ${dShort(b)} · ${caption}`;
  return {title, caption};
}

/** Переключатель «неделя / месяц / квартал / год» и навигация назад–вперёд (вперёд — в план). */
function periodNav(scope, extra = []) {
  const st = state[scope];
  const units = [...Object.entries(UNITS).map(([k, u]) => [k, u.name]), ...extra];
  let nav;
  if (UNITS[st.unit]) {
    const {title, caption} = periodTitle(st.unit, st.offset, periodBounds(st.unit, st.offset, new Date()));
    nav = `<div class="pnav">
      <button type="button" class="pbtn" data-step="-1" aria-label="Предыдущий период">‹</button>
      <div class="pnav-t"><b>${esc(title)}</b><span>${esc(caption)}</span></div>
      <button type="button" class="pbtn" data-step="1" aria-label="Следующий период">›</button>
      ${st.offset !== 0 ? '<button type="button" class="link" data-step="0">к текущему</button>' : ''}
    </div>`;
  } else if (st.unit === 'custom') {
    nav = `<div class="pnav"><input aria-label="Начало" data-date="from" type="date" value="${esc(st.from)}"><span class="muted">—</span><input aria-label="Конец" data-date="to" type="date" value="${esc(st.to)}"></div>`;
  } else {
    nav = `<div class="pnav"><div class="pnav-t"><b>Всё время</b><span>с ${dShort(trackingStart())} — начало учёта</span></div></div>`;
  }
  return `<div class="period" data-scope="${scope}">${segmented(scope + '-unit', units, st.unit)}${nav}</div>`;
}

function scopeRange(scope) {
  const st = state[scope];
  if (UNITS[st.unit]) return periodBounds(st.unit, st.offset, new Date());
  if (st.unit === 'custom') return [st.from, st.to];
  return ['', ''];
}

/** Столбчатый график по площадкам: вышедшие — сплошные, запланированные — штриховка. */
function columns(pubs, plans, a, b) {
  const gran = granularity(daysBetween(a, b));
  const weekdays = gran === 'day' && daysBetween(a, b) <= 7;
  const count = (list, x) => {
    const by = {};
    for (const p of list) if (pubDate(p) >= x.from && pubDate(p) <= x.to) by[p['Площадка']] = (by[p['Площадка']] || 0) + 1;
    return Object.entries(by).sort((p, q) => platformIdx(p[0]) - platformIdx(q[0]));
  };
  const sum = l => l.reduce((s, [, v]) => s + v, 0);
  const per = buckets(a, b, gran).map(x => {
    const done = count(pubs, x), plan = count(plans, x);
    return {...x, done, plan, total: sum(done), planTotal: sum(plan)};
  });
  const max = Math.max(1, ...per.map(x => x.total + x.planTotal)), t = today();
  const label = x => gran === 'month' ? MONTHS_SHORT[parseKey(x.from).getMonth()] : gran === 'week' ? dShort(x.from) : weekdays ? WD[(parseKey(x.from).getDay() + 6) % 7] : String(parseKey(x.from).getDate());
  const every = weekdays || gran === 'month' ? 1 : Math.ceil(per.length / (gran === 'week' ? 7 : 10));
  const tip = x => {
    const lines = [gran === 'day' ? dShort(x.from) : dRange(x.from, x.to)];
    if (x.total) lines.push(`Вышло: ${x.total}`, ...x.done.map(([k, v]) => `  ${k}: ${v}`));
    if (x.planTotal) lines.push(`В плане: ${x.planTotal}`, ...x.plan.map(([k, v]) => `  ${k}: ${v}`));
    if (!x.total && !x.planTotal) lines.push('нет публикаций');
    return lines.join('\n');
  };
  const segs = (list, cls) => list.map(([k, v]) => `<i class="${pcls(k)} ${cls}" style="flex:${v}"></i>`).join('');
  const bars = per.map((x, i) => `<div class="col ${x.from <= t && t <= x.to ? 'now' : ''} ${x.from > t ? 'future' : ''}" data-tip="${esc(tip(x))}" tabindex="0" aria-label="${esc(tip(x))}">
      <div class="col-val">${x.total + x.planTotal || ''}</div>
      <div class="col-bar" style="height:${(x.total + x.planTotal) / max * 100}%">${segs(x.done, '')}${segs(x.plan, 'planned')}</div>
      <div class="col-x">${i % every === 0 ? esc(label(x)) : ''}</div>
    </div>`).join('');
  const platforms = [...new Set([...pubs, ...plans].map(p => p['Площадка']))].sort((x, y) => platformIdx(x) - platformIdx(y));
  const legend = `<div class="legend">${platforms.map(p => `<span>${dot(p)}${esc(p)}</span>`).join('')}${plans.length ? '<span><i class="dot planned-key"></i>в плане</span>' : ''}</div>`;
  return {html: `<div class="cols" style="--n:${per.length}">${bars}</div>${platforms.length > 1 || plans.length ? legend : ''}`, unit: {day: 'по дням', week: 'по неделям', month: 'по месяцам'}[gran]};
}

/** Список запланированных публикаций. */
function planList(list) {
  const t = today(), grouped = new Map();
  for (const p of list) { // кросспост одного материала в один день — одна строка
    const k = (p['Материал']?.[0] || p.id) + '|' + p['Плановая дата'];
    if (!grouped.has(k)) grouped.set(k, {...p, platforms: []});
    grouped.get(k).platforms.push(p['Площадка']);
  }
  return `<ul class="rows">${[...grouped.values()].map(p => {
    const c = contentById(p['Материал']?.[0]), d = p['Плановая дата'], overdue = d < t;
    return `<li class="row pub">
      <span class="pub-d ${overdue ? 'warn-text' : ''}">${d === t ? 'сегодня' : dShort(d)}</span>
      <div class="row-main"><div class="row-t">${esc(c?.['Название'] || p['Публикация'])}</div><div class="row-m">${esc(c?.['Тематика'] || '')}${overdue ? ' · <span class="warn-text" data-tip="Дата прошла, а публикация не отмечена как вышедшая" tabindex="0">просрочено</span>' : ''}</div></div>
      <span class="pub-p">${p.platforms.sort((x, y) => platformIdx(x) - platformIdx(y)).map(x => tag(x)).join('')}</span>
    </li>`;
  }).join('')}</ul>`;
}

// ---------- Обзор ----------
function overview() {
  const {unit, offset} = state.overview;
  const [a, b] = periodBounds(unit, offset, new Date());
  const t = today();
  const pubs = selectPubs(data.publications, a, b);
  const plans = planned(a > t ? a : t, b); // просроченные планы не засчитываем в будущее
  const isPast = b < t, days = daysBetween(a, b);

  const rows = platformGoals().map(g => {
    const name = g['Площадка'], n = pubs.filter(p => p['Площадка'] === name).length;
    const m = plans.filter(p => p['Площадка'] === name).length;
    const target = Math.max(1, Math.round(proratedTarget(g['Целевое количество'], days)));
    const done = n >= target, need = target - n - m;
    const status = done ? '<span class="badge good">✓ выполнено</span>'
      : isPast ? `<span class="badge warn">не хватило ${target - n}</span>`
      : need <= 0 ? '<span class="badge plan">закрыто планом</span>'
      : `<span class="badge neutral">${m ? 'добрать' : 'осталось'} ${need}</span>`;
    return {done, html: `<div class="plan-row">
      <div class="plan-name">${dot(name)}${esc(name)}</div>
      <div class="plan-bar">${meter(n, 0, Math.max(n + m, target), {cls: 'thick', ok: false, fill: pcls(name), plan: m, label: `${name}: вышло ${n}, в плане ${m}, цель ${target}`})}</div>
      <div class="plan-n"><b>${n}</b> из ${target}${m ? `<small>+${m} в плане</small>` : ''}</div>
      <div class="plan-s">${status}</div>
    </div>`};
  });
  const doneCount = rows.filter(r => r.done).length;
  const cells = rows.map(r => `<i class="${r.done ? 'on' : ''}"></i>`).join('');
  const summary = `<div class="plan-sum">
    <div class="plan-cells" aria-hidden="true">${cells}</div>
    <div><b>${doneCount} из ${rows.length}</b> площадок ${isPast || a > t ? '' : 'уже '}выполнили план</div>
  </div>`;
  const notes = ['Цель по каждой площадке задана на неделю' + (unit !== 'week' ? `; для этого периода она умножена на ${num(days / 7)} нед.` : '.'), 'Сплошная полоса — вышло, штриховка — запланировано.'].join('\n');

  const chart = columns(pubs, plans, a, b);
  const bank = ideaBank(), total = bank.reduce((s, x) => s + x.ideas.length, 0);
  const bankRows = bank.map(x => {
    const n = x.ideas.length, cls = n === 0 && x.deficit ? 'alert' : n === 0 ? 'zero' : '';
    return `<li class="stock ${cls}">
      <span class="stock-name">${esc(x.name)}${x.deficit ? `<small data-tip="${esc(shareTip(x, DEFICIT_DAYS))}" tabindex="0">отстаёт: ${pct(x.actual)} при цели ${pct(x.target)}</small>` : ''}</span>
      <span class="stock-n">${n || '—'}</span>
    </li>`;
  }).join('');

  const horizon = addDays(t, 14);
  const upcoming = planned('', horizon);
  const allPlans = planned().length;
  const upcomingCard = card('Ближайшие публикации',
    upcoming.length ? planList(upcoming.slice(0, 6)) : empty('Ничего не запланировано'),
    {aside: allPlans ? `<a class="link" href="#content" data-view="plan">весь план · ${allPlans} →</a>` : '<span class="muted">14 дней</span>', tip: 'Запланированное на 14 дней вперёд. Чтобы добавить даты, попросите ChatGPT предложить их для идей из банка.'});

  return `${periodNav('overview')}<div class="layout-2">
    <div class="stack">
      ${card(`План на ${UNITS[unit].acc}`, summary + rows.map(r => r.html).join(''), {tip: notes})}
      ${upcomingCard}
    </div>
    <div class="stack">
      ${card('Публикации', pubs.length || plans.length ? chart.html : empty('За этот период публикаций нет'), {aside: `<span class="muted">${chart.unit}</span>`})}
      ${card('Запас идей', `<ul class="stocks">${bankRows}</ul>`,
        {aside: `<a class="link" href="#content" data-view="ideas">${pl(total, IDEAS)} →</a>`, tip: `Неопубликованные идеи по тематикам. Сверху — тематики, которые сильнее всего отстают от целевой доли за ${DEFICIT_DAYS} дней. Оранжевым — отстающие без идей: их стоит пополнить.`})}
    </div>
  </div>`;
}

// ---------- Контент ----------
function content() {
  const st = state.content, t = today();
  const bank = ideaBank(), totalIdeas = bank.reduce((s, x) => s + x.ideas.length, 0);
  const groups = groupByMaterial(published());
  const plans = planned();
  const seriesName = id => data.series.find(s => s.id === id)?.['Название'];
  const tabs = segmented('content-view', [['ideas', `Идеи · ${totalIdeas}`], ['plan', `План · ${plans.length}`], ['published', `Вышло · ${groups.length}`]], st.view);

  if (st.view === 'ideas') {
    const ideaRow = x => {
      const sName = x['Серия']?.length ? seriesName(x['Серия'][0]) : '';
      const series = sName && sName !== x['Название'] ? `${sName}${x['Номер выпуска'] ? ` · №${x['Номер выпуска']}` : ''}` : x['Номер выпуска'] ? `выпуск ${x['Номер выпуска']}` : '';
      const status = !['Идея', 'Запланировано'].includes(x['Статус']) ? x['Статус'] : '';
      const xs = plans.filter(p => p['Материал']?.includes(x.id));
      const high = x['Приоритет'] === 'Высокий';
      return `<li class="row idea">
        <div class="row-main">
          <div class="row-t">${high ? '<span class="prio" data-tip="Высокий приоритет" tabindex="0">↑</span>' : ''}${esc(x['Название'])}</div>
          <div class="row-m">${x['Формат'] ? `<span class="fmt">${esc(x['Формат'])}</span>` : ''}${series ? `<span class="ser">${esc(series)}</span>` : ''}${status ? `<span>${esc(status)}</span>` : ''}</div>
          ${xs.length ? `<div class="row-tags">${xs.map(p => tag(p['Площадка'], dShort(p['Плановая дата']), 'plan-tag')).join('')}</div>` : ''}
        </div></li>`;
    };
    const sections = bank.map(x => {
      const share = x.target == null ? ''
        : `<span class="share ${x.deficit ? 'warn' : ''}" data-tip="${esc(shareTip(x, DEFICIT_DAYS))}" tabindex="0">${x.deficit ? 'отстаёт · ' : ''}${pct(x.actual)} при цели ${pct(x.target)}</span>`;
      const body = x.ideas.length ? `<ul class="rows">${x.ideas.map(ideaRow).join('')}</ul>`
        : `<p class="group-empty ${x.deficit ? 'warn-text' : ''}">${x.deficit ? 'Идей нет — стоит пополнить' : 'Идей нет'}</p>`;
      return `<section class="card theme ${x.deficit ? 'deficit' : ''}">
        <header class="theme-h"><h3>${esc(x.name)}</h3><span class="theme-n">${x.ideas.length ? pl(x.ideas.length, IDEAS) : ''}</span>${share}</header>
        ${body}
      </section>`;
    }).join('');
    return `<div class="toolbar">${tabs}${info(`Тематики идут по отставанию от целевой доли за последние ${DEFICIT_DAYS} дней: сверху — те, где публикаций меньше всего относительно цели.\nЦветные метки у идеи — площадка и запланированная дата.`)}</div>
      ${sections}`;
  }

  if (st.view === 'plan') {
    const byWeek = new Map();
    for (const p of plans) {
      const d = p['Плановая дата'], key = d < t ? 'overdue' : periodBounds('week', 0, parseKey(d))[0];
      if (!byWeek.has(key)) byWeek.set(key, []);
      byWeek.get(key).push(p);
    }
    const sections = [...byWeek.entries()].map(([k, ps]) => {
      const title = k === 'overdue' ? 'Просрочено' : `Неделя ${dRange(...periodBounds('week', 0, parseKey(k)))}`;
      return `<section class="group"><header class="group-h"><h3 class="${k === 'overdue' ? 'warn-text' : ''}">${title}</h3><span class="group-n">${ps.length}</span></header>${planList(ps)}</section>`;
    }).join('');
    return `<div class="toolbar">${tabs}${info('Дату предлагает ChatGPT по регламенту Content OS, запись появляется после вашего «окей». Когда публикация выходит, она переезжает во «Вышло».')}</div>
      <section class="card list">
        ${sections || empty('Пока ничего не запланировано. Напишите ChatGPT: «предложи даты для идей из банка».')}
      </section>`;
  }

  const filtered = groups.filter(g => !st.platform || g.pubs.some(p => p['Площадка'] === st.platform));
  const platforms = [['', 'Все'], ...platformGoals().map(g => [g['Площадка'], `${dot(g['Площадка'])}${esc(short(g['Площадка']))}`])];
  const lastDate = g => g.pubs.map(p => p['Дата публикации'] || '').sort().at(-1);
  const byMonth = new Map();
  for (const g of filtered) {
    const d = lastDate(g), key = d ? d.slice(0, 7) : '';
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(g);
  }
  const row = g => {
    const c = contentById(g.id), d = lastDate(g), approx = g.pubs.some(p => p.approximate);
    const parts = g.pubs.length > 1 && new Set(g.pubs.map(p => p['Публикация'])).size > 1 ? ` · ${g.pubs.length} поста` : '';
    return `<li class="row pub">
      <span class="pub-d" ${approx ? `data-tip="${approxTip}" tabindex="0"` : ''}>${d ? (approx ? '≈' : '') + dShort(d) : '—'}</span>
      <div class="row-main"><div class="row-t">${esc(c?.['Название'] || g.pubs[0]['Публикация'])}</div><div class="row-m">${esc(c?.['Тематика'] || '')}${parts}</div></div>
      <span class="pub-p">${[...new Set(g.pubs.map(p => p['Площадка']))].sort((x, y) => platformIdx(x) - platformIdx(y)).map(p => tag(p)).join('')}</span>
    </li>`;
  };
  const sections = [...byMonth.entries()].map(([k, gs]) => {
    const title = k ? `${MONTHS_NOM[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}` : 'Без даты';
    return `<section class="group"><header class="group-h"><h3>${title}</h3><span class="group-n">${gs.length}</span></header><ul class="rows">${gs.map(row).join('')}</ul></section>`;
  }).join('');
  return `<div class="toolbar">${tabs}${segmented('content-platform', platforms, st.platform)}${info('Один материал — одна строка, даже если он вышел на нескольких площадках.\n≈ — дата приблизительная.')}</div>
    <section class="card list">
      ${sections || empty('Публикаций нет')}
    </section>`;
}

// ---------- Аналитика ----------
function analytics() {
  const st = state.analytics, t = today();
  const [ra, rb] = scopeRange('analytics');
  const pubs = selectPubs(data.publications, ra, rb);
  const [a, b] = effectiveRange(published(), [ra, rb], t);
  const plans = UNITS[st.unit] && b >= t ? planned(a > t ? a : t, b) : [];
  const tracked = trackingStart(), from = a > tracked ? a : tracked, to = b > t ? t : b;
  const days = to >= from ? daysBetween(from, to) : 0;
  const uniq = materialIds(pubs).size;
  const future = a > t;

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
      <td class="r delta ${cls}" data-tip="${esc(gap == null ? 'Нет публикаций' : `${num(x.actual, 0)}% − ${num(x.target)}% = ${d} процентных пунктов`)}" tabindex="0">${d}</td>
    </tr>`;
  }).join('');
  const noFacts = future ? 'Будущий период — фактов ещё нет. Запланированное видно в «Динамике».' : 'За период нет опубликованных материалов';
  const themeTable = uniq ? `<table class="tbl"><thead><tr><th>Тематика</th><th class="w"><span class="leg-fill"></span>факт <span class="leg-tick"></span>цель</th><th class="r">Факт</th><th class="r">Цель</th><th class="r">Разница</th></tr></thead><tbody>${themeRows}</tbody></table>`
    : empty(noFacts);

  // Тематики × каналы: в каких каналах закрывается каждая тематика.
  const tc = themeByChannel(data.content, pubs);
  const themes = s.map(x => x.name);
  const goalShare = th => themeGoals().find(g => g['Тематика'] === th)?.['Целевая доля'] || 0;
  const cellMax = Math.max(1, ...themes.flatMap(th => CHANNELS.map(ch => tc.cells[th]?.[ch] || 0)));
  const chName = ch => ch === 'Короткие видео' ? 'Видео' : ch;
  const matrix = uniq ? `<table class="tbl mx"><thead><tr><th>Тематика</th>${CHANNELS.map(ch => `<th class="c">${chName(ch)}</th>`).join('')}</tr></thead><tbody>
    ${themes.map(th => `<tr><th scope="row">${esc(th)}</th>${CHANNELS.map(ch => {
      const n = tc.cells[th]?.[ch] || 0, tot = tc.totals[ch] || 0;
      const hole = tot >= 3 && !n && goalShare(th) >= 0.15;
      const tip = `${th} · ${ch}\n${n ? `${n} из ${tot} материалов канала (${num(n / tot * 100, 0)}%)` : 'нет материалов'}${hole ? '\nзаметная тематика (цель ≥15%) не выходила в канале' : ''}`;
      return `<td class="c"><span class="cell ${n ? 'has' : ''} ${hole ? 'hole' : ''}" style="--a:${n ? (0.18 + 0.82 * n / cellMax).toFixed(2) : 0}" data-tip="${esc(tip)}" tabindex="0">${n || (hole ? '!' : '')}</span></td>`;
    }).join('')}</tr>`).join('')}
    <tr class="tot"><th scope="row">Всего в канале</th>${CHANNELS.map(ch => `<td class="c">${tc.totals[ch] || '—'}</td>`).join('')}</tr>
  </tbody></table>
`
    : empty(noFacts);

  const pg = platformGoals();
  const platRows = pg.map(g => {
    const name = g['Площадка'], n = pubs.filter(p => p['Площадка'] === name).length;
    const norm = proratedTarget(g['Целевое количество'], days), pct = norm ? n / norm * 100 : 0;
    return `<tr>
      <th scope="row">${dot(name)}${esc(name)}</th>
      <td class="w">${meter(n, norm, Math.max(n, norm, 1) * 1.15, {fill: pcls(name), ok: false, label: `${name}: ${n} при норме ${num(norm)}`})}</td>
      <td class="r"><b>${n}</b></td>
      <td class="r muted">${num(norm)}</td>
      <td class="r delta ${pct >= 100 ? 'pos' : 'neg'}">${norm ? num(pct, 0) + '%' : '—'}</td>
    </tr>`;
  }).join('');
  const platTable = days ? `<table class="tbl"><thead><tr><th>Площадка</th><th class="w"></th><th class="r">Факт</th><th class="r">Норма</th><th class="r">Выполн.</th></tr></thead><tbody>${platRows}</tbody></table>`
    : empty(future ? noFacts : 'Период до начала учёта — данных нет');

  const chart = columns(pubs, plans, a, b);
  return periodNav('analytics', [['all', 'Всё'], ['custom', 'Даты']]) + `<div class="layout-2 even">
    ${card('Тематический баланс', themeTable, {tip: `Какая доля опубликованных материалов пришлась на каждую тематику${uniq ? ` (всего ${pl(uniq, ['материал', 'материала', 'материалов'])} за период)` : ''}. Кросспост одного материала считается один раз.\nРазница — сколько процентных пунктов не хватает до цели (−) или сверх неё (+): 12% при цели 27% → −15.`})}
    ${card('Площадки', platTable, {tip: `Сколько публикаций вышло на каждой площадке против нормы.\nНорма = недельная цель × ${pl(days, ['учтённый день', 'учтённых дня', 'учтённых дней'])} / 7. Учёт ведётся с ${dShort(tracked)}.`})}
    ${card('Тематики по каналам', matrix, {tip: 'Где выходит каждая тематика: число уникальных материалов. Видео = Reels + Shorts, кросспост считается один раз.\n! — тематика с целью от 15% ни разу не вышла в канале, где за период было 3+ материала.'})}
    ${card('Динамика', pubs.length || plans.length ? chart.html : empty('Нет публикаций за период'), {aside: `<span class="muted">${chart.unit}</span>`})}
  </div>`;
}

// ---------- Длительные темы ----------
function series() {
  const all = published(), pubIds = materialIds(all), plans = planned();
  if (!data.series.length) return empty('Нет серий');
  return `<div class="series-grid">${data.series.map(s => {
    const items = data.content.filter(x => s.Content?.includes(x.id) || x['Серия']?.includes(s.id)).sort((a, b) => (a['Номер выпуска'] || 99) - (b['Номер выпуска'] || 99));
    const n = items.filter(x => pubIds.has(x.id)).length, total = s['Количество выпусков'];
    const size = total ? `${n} из ${total}` : `${n} из ${items.length} известных`;
    const ep = (x, i) => {
      const ps = all.filter(p => p['Материал']?.includes(x.id)), pp = plans.filter(p => p['Материал']?.includes(x.id));
      const meta = ps.length ? `<div class="row-tags">${ps.map(p => tag(p['Площадка'], p['Дата публикации'] ? (p.approximate ? '≈' : '') + dShort(p['Дата публикации']) : '')).join('')}</div>`
        : pp.length ? `<div class="row-tags">${pp.map(p => tag(p['Площадка'], dShort(p['Плановая дата']), 'plan-tag')).join('')}</div>`
        : `<div class="row-m">${esc([x['Статус'], x['Формат']].filter(Boolean).join(' · '))}</div>`;
      return `<li class="ep ${ps.length ? 'done' : pp.length ? 'planned' : ''}">
        <span class="ep-n">${x['Номер выпуска'] || i + 1}</span>
        <div class="row-main"><div class="row-t">${esc(x['Название'])}</div>${meta}</div>
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
  const link = e.target.closest('a[data-view]');
  if (link) state.content.view = link.dataset.view;
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
    st.offset = step === 0 ? 0 : st.offset + step;
    render();
  }
});
app.addEventListener('change', e => {
  const k = e.target.dataset.date;
  if (k) { state.analytics[k] = e.target.value; render(); }
});

// Подсказки: наведение, фокус, касание.
const tipEl = Object.assign(document.createElement('div'), {className: 'tip', role: 'tooltip'});
document.body.append(tipEl);
const showTip = el => {
  tipEl.textContent = el.dataset.tip; tipEl.style.display = 'block';
  const r = el.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
  tipEl.style.left = Math.max(8, Math.min(innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2)) + 'px';
  tipEl.style.top = Math.max(8, r.top - tr.height - 6) + scrollY + 'px';
};
const hideTip = () => { tipEl.style.display = 'none'; };
for (const ev of ['pointerover', 'focusin']) document.addEventListener(ev, e => { const el = e.target.closest?.('[data-tip]'); el ? showTip(el) : hideTip(); });
document.addEventListener('pointerout', e => { if (e.target.closest?.('[data-tip]') && !e.relatedTarget?.closest?.('[data-tip]')) hideTip(); });
addEventListener('scroll', hideTip, {passive: true});

function setTab(t, dir = 0) {
  if (!TABS[t]) t = 'overview';
  const changed = state.tab !== t;
  state.tab = t;
  if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t);
  if (changed) scrollTo(0, 0);
  if (data) render();
  if (changed) {
    document.querySelector(`nav [data-tab="${t}"]`)?.scrollIntoView({block: 'nearest', inline: 'nearest'});
    if (dir) {
      app.classList.remove('slide-l', 'slide-r');
      void app.offsetWidth;
      app.classList.add(dir > 0 ? 'slide-l' : 'slide-r');
    }
  }
}

// Боковые свайпы: влево — следующая вкладка, вправо — предыдущая.
// Жест игнорируется, если начат внутри горизонтально прокручиваемого блока.
const scrollsX = el => {
  for (; el && el !== document.body; el = el.parentElement) {
    const ox = getComputedStyle(el).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
};
let swipe = null;
document.addEventListener('touchstart', e => {
  const t = e.touches[0];
  swipe = e.touches.length === 1 && !scrollsX(e.target) && !e.target.closest('input, select, textarea')
    ? {x: t.clientX, y: t.clientY, at: Date.now()} : null;
}, {passive: true});
document.addEventListener('touchmove', e => { if (e.touches.length > 1) swipe = null; }, {passive: true});
document.addEventListener('touchend', e => {
  if (!swipe) return;
  const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, dt = Date.now() - swipe.at;
  swipe = null;
  if (dt > 600 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const keys = Object.keys(TABS), i = keys.indexOf(state.tab) + (dx < 0 ? 1 : -1);
  if (i < 0 || i >= keys.length) return;
  hideTip();
  setTab(keys[i], dx < 0 ? 1 : -1);
}, {passive: true});
app.addEventListener('animationend', () => app.classList.remove('slide-l', 'slide-r'));
document.querySelectorAll('nav [data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
addEventListener('hashchange', () => setTab(location.hash.slice(1)));
setTab(location.hash.slice(1) || 'overview');

fetch('./data.json', {cache: 'no-store'})
  .then(r => { if (!r.ok) throw Error(r.status); return r.json(); })
  .then(d => {
    data = d;
    const last = published().map(p => p['Дата публикации']).filter(Boolean).sort().at(-1);
    document.querySelector('#updated').textContent = last ? `последняя публикация ${dShort(last)}` : '';
    document.querySelector('#updated').insertAdjacentHTML('afterend', info('Учтены только внесённые в Content OS записи: если записи нет, это не значит, что активности не было.'));
    render();
  })
  .catch(() => { app.innerHTML = empty('Не удалось загрузить данные. Обновите страницу.'); });
