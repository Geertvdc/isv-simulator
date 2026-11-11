// The ops dashboard's page script (served at /admin/app.js by server/admin.ts).
// Plain browser JS, no libraries: reads /admin/api/state every few seconds and
// /admin/api/history for the charts, and draws everything with the DOM and SVG.
// Every value from the server goes in through textContent, never innerHTML.

'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SLOTS = 8;
const HISTORY_EVERY_MS = 30_000;

const view = {
  paused: false,
  range: '1h',
  tableView: false,
  selected: null,
  state: null,
  history: null,
  stateTimer: 0,
  historyTimer: 0,
};

// ---------- DOM helpers ----------

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? String(c) : c);
  }
  return el;
}

function svg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined) continue;
    if (k === 'text') el.textContent = v;
    else el.setAttribute(k, String(v));
  }
  return el;
}

const $ = (id) => document.getElementById(id);

// ---------- Formatting ----------

const fmtInt = (n) => (n === null || n === undefined ? '–' : Math.round(n).toLocaleString('en-US'));

function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function fmtDuration(s) {
  if (s === null || s === undefined) return '–';
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
}

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const hmFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' });
const stampFmt = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const bucketFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const shardName = (i) => (i < 0 ? 'Pool' : `Shard ${i}`);
const slotColor = (index) => `var(--series-${(index % SLOTS) + 1})`;

// ---------- Fetching ----------

async function getJson(url) {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function loadState() {
  clearTimeout(view.stateTimer);
  try {
    view.state = await getJson('/admin/api/state');
    $('state-error').hidden = true;
    renderState();
  } catch (e) {
    $('state-error').hidden = false;
    $('state-error').textContent = `Could not load the pool: ${e.message}`;
  }
  schedule();
}

async function loadHistory() {
  clearTimeout(view.historyTimer);
  $('charts').classList.add('loading');
  try {
    view.history = await getJson(`/admin/api/history?range=${encodeURIComponent(view.range)}`);
    $('history-error').hidden = true;
    renderHistory();
  } catch (e) {
    $('history-error').hidden = false;
    $('history-error').textContent = `Could not load the history: ${e.message}`;
  }
  $('charts').classList.remove('loading');
  if (!view.paused) view.historyTimer = setTimeout(loadHistory, HISTORY_EVERY_MS);
}

function schedule() {
  clearTimeout(view.stateTimer);
  if (view.paused) return;
  view.stateTimer = setTimeout(loadState, view.state?.refreshMs ?? 5000);
}

// ---------- Now: header and tiles ----------

function tile(label, value, sub, status) {
  return h(
    'div',
    { class: 'tile' },
    h('div', { class: 'label', text: label }),
    h('div', { class: 'value' }, value),
    sub || status
      ? h('div', { class: 'sub' }, status ?? null, status && sub ? ' ' : null, sub ?? null)
      : null,
  );
}

const status = (kind, text) => h('span', { class: `status ${kind}`, text });

function renderState() {
  const s = view.state;
  const t = s.totals;
  const refreshS = Math.round(s.refreshMs / 1000);
  $('updated').textContent = view.paused
    ? `Paused · last update ${timeFmt.format(new Date(s.now))}`
    : `Auto-refresh every ${refreshS} s · updated ${timeFmt.format(new Date(s.now))}`;
  $('subtitle').textContent =
    `Pool of ${s.poolSize} shard${s.poolSize === 1 ? '' : 's'}` +
    (s.frontDoor ? ` · front door ${s.frontDoor}` : '') +
    ` · this page is served by shard ${s.self}`;

  const mixed = s.versions.length > 1;
  const versionsValue = h(
    'span',
    {},
    s.versions.length === 0 ? '–' : s.versions.map((v) => v.version).join(', '),
  );
  const versionsSub = s.versions
    .map((v) => `${v.version}: shard ${v.shards.join(', ')}`)
    .join(' · ');
  const freeLow = s.headroom.free < s.headroom.target;

  $('tiles').replaceChildren(
    tile(
      'Shards awake',
      h('span', {}, String(t.awake), h('small', { text: ` / ${t.poolSize}` })),
      s.waking.length > 0
        ? `waking ${s.waking.map(shardName).join(', ')}`
        : `${t.poolSize - t.awake} asleep`,
    ),
    tile(
      'Rooms',
      h('span', {}, fmtInt(t.rooms), h('small', { text: ` / ${fmtInt(t.capacity)}` })),
      `slots on awake shards; ${fmtInt(t.poolCapacity)} with all awake`,
    ),
    tile('Players', fmtInt(t.players), 'in rooms on awake shards'),
    tile('Connections', fmtInt(t.connections), 'open client sockets'),
    tile(
      'Free room slots',
      fmtInt(s.headroom.free),
      `shard 0 keeps at least ${s.headroom.target} ready`,
      freeLow ? status('warn', 'Low') : status('awake', 'OK'),
    ),
    tile(
      'Next room goes to',
      s.nextHost < 0 ? 'Nowhere' : shardName(s.nextHost),
      s.nextHost < 0 ? 'every shard is awake and full' : null,
      s.nextHost < 0 ? status('crit', 'All full') : null,
    ),
    tile(
      mixed ? 'Versions (mixed)' : 'Version',
      versionsValue,
      versionsSub,
      mixed ? status('warn', 'Mixed versions') : null,
    ),
  );
  $('freshness').textContent = s.freshness;
  renderShards();
}

// ---------- Shard cards ----------

function meter(label, value, max) {
  const share = max > 0 ? Math.min(1, value / max) : 0;
  const fill = h('div', {
    class: `meter-fill${share >= 1 ? ' crit' : share >= 0.8 ? ' warn' : ''}`,
  });
  fill.style.width = `${share * 100}%`;
  return h(
    'div',
    { class: 'meter' },
    h(
      'div',
      { class: 'meter-row' },
      h('span', { text: label }),
      h('span', { text: `${value} / ${max}` }),
    ),
    h(
      'div',
      {
        class: 'meter-track',
        role: 'meter',
        'aria-label': label,
        'aria-valuemin': 0,
        'aria-valuemax': max,
        'aria-valuenow': value,
      },
      fill,
    ),
  );
}

function warnValue(text, high) {
  return high ? h('span', {}, status('warn', text)) : text;
}

function card(shard) {
  const s = view.state;
  const ops = shard.ops;
  const full = shard.awake && shard.rooms >= shard.maxRooms;
  const state = !shard.known
    ? status('asleep', 'Never seen')
    : !shard.awake
      ? status('asleep', 'Asleep')
      : full
        ? status('crit', 'Awake, full')
        : status('awake', 'Awake');
  const badges = [];
  if (shard.index === 0) badges.push(h('span', { class: 'badge strong', text: 'front door' }));
  if (shard.self) badges.push(h('span', { class: 'badge', text: 'this server' }));
  if (s.nextHost === shard.index)
    badges.push(h('span', { class: 'badge strong', text: 'next host' }));
  if (s.waking.includes(shard.index))
    badges.push(h('span', { class: 'badge strong', text: 'waking' }));

  const rows = [];
  const row = (label, value) => rows.push(h('dt', { text: label }), h('dd', {}, value));
  const live = shard.awake && ops;
  row('Players', shard.awake ? fmtInt(shard.players) : '–');
  row('Connections', live ? fmtInt(ops.connections) : '–');
  row('CPU', live ? warnValue(`${fmtNum(ops.cpuPct)} %`, ops.cpuPct >= 80) : '–');
  row(
    'Loop delay p99',
    live ? warnValue(`${fmtNum(ops.loopDelayP99Ms)} ms`, ops.loopDelayP99Ms >= 100) : '–',
  );
  row('Event loop busy', live ? `${fmtNum(ops.eventLoopUtil * 100, 0)} %` : '–');
  row('Memory', live ? `${fmtNum(ops.rssMb, 0)} MB (heap ${fmtNum(ops.heapUsedMb, 0)})` : '–');
  row('Version', ops ? ops.version : '–');
  row('Uptime', live ? fmtDuration(ops.uptimeS) : '–');
  row(
    'Last seen',
    shard.self
      ? 'live'
      : shard.lastSeenS === null
        ? 'never'
        : `${fmtDuration(shard.lastSeenS)} ago`,
  );
  row('Rounds started', live ? fmtInt(ops.roundsStarted) : '–');
  row(
    'Refused (full)',
    live ? warnValue(fmtInt(ops.serverFullRefusals), ops.serverFullRefusals > 0) : '–',
  );

  const selected = view.selected === shard.index;
  return h(
    'button',
    {
      type: 'button',
      class: `card${shard.awake ? '' : ' asleep'}`,
      'aria-pressed': selected ? 'true' : 'false',
      'aria-label': `Shard ${shard.index}: show its rooms`,
      onclick: () => {
        view.selected = selected ? null : shard.index;
        renderShards();
      },
    },
    h('div', { class: 'card-head' }, h('h3', { text: shardName(shard.index) }), state),
    badges.length > 0 ? h('div', { class: 'badges' }, badges) : null,
    h('div', { class: 'url', text: shard.url || '(URL unknown)', title: shard.url }),
    meter('Rooms', shard.rooms, shard.maxRooms),
    h('dl', {}, rows),
  );
}

function renderShards() {
  const s = view.state;
  if (!s) return;
  $('shards').replaceChildren(...s.shards.map(card));
  const box = $('rooms');
  const shard = view.selected === null ? null : s.shards[view.selected];
  if (!shard) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const rooms = shard.awake ? (shard.ops?.roomList ?? []) : [];
  const caption = h('caption', {
    text: `${shardName(shard.index)}: ${rooms.length} room${rooms.length === 1 ? '' : 's'}${
      shard.self ? ' (live)' : ' (as of its last heartbeat)'
    }`,
  });
  if (rooms.length === 0) {
    box.replaceChildren(
      h(
        'div',
        { class: 'table-wrap' },
        h('table', {}, caption),
        h('div', { class: 'empty', text: 'No open rooms.' }),
      ),
    );
    return;
  }
  const head = h(
    'tr',
    {},
    h('th', { scope: 'col', text: 'Code' }),
    h('th', { scope: 'col', class: 'num', text: 'Members' }),
    h('th', { scope: 'col', class: 'num', text: 'Players' }),
    h('th', { scope: 'col', text: 'Screen' }),
    h('th', { scope: 'col', text: 'Level' }),
    h('th', { scope: 'col', class: 'num', text: 'Age' }),
    h('th', { scope: 'col', class: 'num', text: 'Idle' }),
  );
  const body = rooms.map((r) =>
    h(
      'tr',
      {},
      h('td', { text: r.code }),
      h('td', { class: 'num', text: fmtInt(r.members) }),
      h('td', { class: 'num', text: fmtInt(r.players) }),
      h('td', { text: r.screen }),
      h('td', { text: r.levelId ?? '–' }),
      h('td', { class: 'num', text: fmtDuration(r.ageS) }),
      h('td', { class: 'num', text: fmtDuration(r.idleS) }),
    ),
  );
  box.replaceChildren(
    h(
      'div',
      { class: 'table-wrap' },
      h('table', {}, caption, h('thead', {}, head), h('tbody', {}, body)),
    ),
  );
}

// ---------- Charts ----------

function niceStep(max, ticks) {
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

function yScale(values, minMax, integer) {
  let max = minMax;
  for (const v of values) if (v !== null && v > max) max = v;
  let step = niceStep(max, 4);
  if (integer) step = Math.max(1, Math.ceil(step));
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { top, ticks };
}

function xLabel(t, range) {
  const d = new Date(t);
  return range === '7d' ? dayFmt.format(d) : hmFmt.format(d);
}

/**
 * One line chart: `series` share the x positions (`times`) and one y axis.
 * Hover or arrow keys move a crosshair with a tooltip listing every series.
 */
function lineChart(opts) {
  const { title, sub, times, series, step, minMax, integer, unit, range } = opts;
  const box = h('div', { class: 'chart' });
  const legend =
    series.length > 1
      ? h(
          'div',
          { class: 'legend' },
          series.map((s) => {
            const key = h('span', { class: 'key' });
            key.style.background = s.color;
            if (s.reference) key.style.height = '1px';
            return h('span', {}, key, s.name);
          }),
        )
      : null;
  box.append(h('h3', { text: title }), h('p', { class: 'sub', text: sub }));
  if (legend) box.append(legend);

  const width = Math.max(260, Math.floor(opts.width));
  const plotH = 160;
  const axisH = 22;
  const m = { left: 40, right: series.length === 1 ? 40 : 14, top: 8 };
  const plotW = width - m.left - m.right;
  const height = m.top + plotH + axisH;
  const n = times.length;
  const all = series.flatMap((s) => s.values);
  const { top, ticks } = yScale(all, minMax, integer);
  const x = (i) => m.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => m.top + plotH - (v / top) * plotH;

  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: 'img',
    tabindex: 0,
    'aria-label': `${title}. ${sub}. Use the arrow keys to read values; the table view lists them all.`,
  });
  for (const v of ticks) {
    root.append(
      svg('line', {
        class: v === 0 ? 'baseline' : 'gridline',
        x1: m.left,
        x2: m.left + plotW,
        y1: y(v),
        y2: y(v),
      }),
      svg('text', {
        class: 'axis-text',
        x: m.left - 6,
        y: y(v) + 4,
        'text-anchor': 'end',
        text: fmtNum(v, 1),
      }),
    );
  }
  const labelCount = Math.max(2, Math.min(6, Math.floor(plotW / 90)));
  for (let k = 0; k < labelCount && n > 1; k++) {
    const i = Math.round((k / (labelCount - 1)) * (n - 1));
    root.append(
      svg('text', {
        class: 'axis-text',
        x: x(i),
        y: m.top + plotH + 16,
        'text-anchor': k === 0 ? 'start' : k === labelCount - 1 ? 'end' : 'middle',
        text: xLabel(times[i], range),
      }),
    );
  }

  for (const s of series) {
    let d = '';
    let area = '';
    let runStart = -1;
    let prevY = 0;
    const closeArea = (end) => {
      if (runStart >= 0 && s.area) {
        area += `L${x(end)},${y(0)}L${x(runStart)},${y(0)}Z`;
      }
    };
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      if (v === null || v === undefined) {
        closeArea(i - 1);
        runStart = -1;
        continue;
      }
      const px = x(i);
      const py = y(v);
      if (runStart < 0) {
        d += `M${px},${py}`;
        if (s.area) area += `M${px},${py}`;
        runStart = i;
      } else if (step) {
        d += `H${px}V${py}`;
        if (s.area) area += `H${px}V${py}`;
      } else {
        d += `L${px},${py}`;
        if (s.area) area += `L${px},${py}`;
      }
      prevY = py;
    }
    closeArea(n - 1);
    void prevY;
    if (s.area && area) {
      const a = svg('path', { class: 'area', d: area });
      a.style.fill = s.color;
      root.append(a);
    }
    const p = svg('path', { class: s.reference ? 'reference' : 'series', d });
    if (!s.reference) p.style.stroke = s.color;
    root.append(p);
    // A lone point between gaps has no line: draw it as a dot.
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      const before = i > 0 ? s.values[i - 1] : null;
      const after = i < n - 1 ? s.values[i + 1] : null;
      if (
        v !== null &&
        v !== undefined &&
        (before === null || before === undefined) &&
        (after === null || after === undefined) &&
        !s.reference
      ) {
        const dot = svg('circle', { class: 'dot', cx: x(i), cy: y(v), r: 3 });
        dot.style.fill = s.color;
        root.append(dot);
      }
    }
  }

  // End label for a single series: its latest value.
  if (series.length === 1) {
    const s = series[0];
    for (let i = n - 1; i >= 0; i--) {
      const v = s.values[i];
      if (v === null || v === undefined) continue;
      root.append(
        svg('text', {
          class: 'end-label',
          x: x(i) + 6,
          y: y(v) + 4,
          text: `${fmtNum(v)}${unit ?? ''}`,
        }),
      );
      break;
    }
  }

  // Crosshair and tooltip.
  const cross = svg('line', {
    class: 'crosshair',
    y1: m.top,
    y2: m.top + plotH,
    visibility: 'hidden',
  });
  const dots = svg('g', {});
  const hit = svg('rect', {
    x: m.left,
    y: m.top,
    width: plotW,
    height: plotH,
    fill: 'transparent',
  });
  root.append(cross, dots, hit);
  const tip = h('div', { class: 'tooltip', hidden: true });
  box.append(root, tip);

  let current = -1;
  const show = (i) => {
    if (n === 0) return;
    current = Math.max(0, Math.min(n - 1, i));
    const px = x(current);
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    cross.setAttribute('visibility', 'visible');
    dots.replaceChildren();
    const rows = [];
    for (const s of series) {
      const v = s.values[current];
      if (v !== null && v !== undefined && !s.reference) {
        const dot = svg('circle', { class: 'dot', cx: px, cy: y(v), r: 4 });
        dot.style.fill = s.color;
        dots.append(dot);
      }
      const key = h('span', { class: 'key' });
      key.style.background = s.color;
      rows.push(
        h(
          'div',
          { class: 'row' },
          key,
          h('strong', { text: v === null || v === undefined ? '–' : `${fmtNum(v)}${unit ?? ''}` }),
          h('span', { text: s.name }),
        ),
      );
    }
    tip.replaceChildren(
      h('div', { class: 'when', text: bucketFmt.format(new Date(times[current])) }),
      ...rows,
    );
    tip.hidden = false;
    const svgBox = root.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const scale = svgBox.width / width;
    const left = svgBox.left - boxRect.left + px * scale;
    const tipW = tip.offsetWidth;
    tip.style.left = `${left + 12 + tipW > boxRect.width ? left - tipW - 12 : left + 12}px`;
    tip.style.top = `${svgBox.top - boxRect.top + m.top * scale}px`;
  };
  const hide = () => {
    current = -1;
    cross.setAttribute('visibility', 'hidden');
    dots.replaceChildren();
    tip.hidden = true;
  };
  root.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    if (px < m.left - 4 || px > m.left + plotW + 4) return hide();
    show(Math.round(((px - m.left) / plotW) * (n - 1)));
  });
  root.addEventListener('pointerleave', hide);
  root.addEventListener('focus', () => show(n - 1));
  root.addEventListener('blur', hide);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(current - 1);
    else if (e.key === 'ArrowRight') show(current + 1);
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(n - 1);
    else if (e.key === 'Escape') hide();
    else return;
    e.preventDefault();
  });
  return box;
}

function dataTable(title, times, series, unit) {
  const head = h(
    'tr',
    {},
    h('th', { scope: 'col', text: 'Time' }),
    series.map((s) => h('th', { scope: 'col', class: 'num', text: s.name })),
  );
  const rows = [];
  for (let i = times.length - 1; i >= 0; i--) {
    if (series.every((s) => s.values[i] === null || s.values[i] === undefined)) continue;
    rows.push(
      h(
        'tr',
        {},
        h('td', { text: bucketFmt.format(new Date(times[i])) }),
        series.map((s) => {
          const v = s.values[i];
          return h('td', {
            class: 'num',
            text: v === null || v === undefined ? '–' : `${fmtNum(v)}${unit ?? ''}`,
          });
        }),
      ),
    );
  }
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      {},
      h('caption', { text: title }),
      h('thead', {}, head),
      h('tbody', {}, rows.length > 0 ? rows : h('tr', {}, h('td', { text: 'No data yet.' }))),
    ),
  );
}

function cpuSeries(hist) {
  const size = hist.poolSize;
  const list = [];
  for (let i = 0; i < size; i++) {
    const values = hist.points.map((p) => p.cpu[i] ?? null);
    if (values.some((v) => v !== null)) {
      list.push({ index: i, values, peak: Math.max(...values.filter((v) => v !== null)) });
    }
  }
  if (list.length <= SLOTS) {
    return list.map((s) => ({
      name: shardName(s.index),
      color: slotColor(s.index),
      values: s.values,
    }));
  }
  // More shards than colors: the busiest seven keep theirs, the rest fold into one line.
  const keep = [...list].sort((a, b) => b.peak - a.peak).slice(0, SLOTS - 1);
  const kept = new Set(keep.map((s) => s.index));
  const others = hist.points.map((_, j) => {
    let max = null;
    for (const s of list)
      if (!kept.has(s.index) && s.values[j] !== null) max = Math.max(max ?? 0, s.values[j]);
    return max;
  });
  return [
    ...keep
      .sort((a, b) => a.index - b.index)
      .map((s) => ({ name: shardName(s.index), color: slotColor(s.index), values: s.values })),
    { name: 'Other shards (highest)', color: 'var(--reference)', values: others },
  ];
}

const RANGE_TEXT = {
  '1h': 'last hour, one point a minute',
  '24h': 'last 24 hours, highest per 5 minutes',
  '7d': 'last 7 days, highest per hour',
};

function renderHistory() {
  const hist = view.history;
  if (!hist) return;
  const times = hist.points.map((p) => p.t);
  const pick = (k) => hist.points.map((p) => p[k]);
  const charts = [
    {
      title: 'Players',
      sub: `In rooms on all shards, ${RANGE_TEXT[hist.range]}`,
      series: [{ name: 'Players', color: 'var(--series-1)', values: pick('players'), area: true }],
      minMax: 4,
      integer: true,
    },
    {
      title: 'Rooms',
      sub: `Open rooms against room slots on the awake shards, ${RANGE_TEXT[hist.range]}`,
      series: [
        { name: 'Rooms', color: 'var(--series-1)', values: pick('rooms') },
        {
          name: 'Capacity (awake shards)',
          color: 'var(--reference)',
          values: pick('capacity'),
          reference: true,
        },
      ],
      minMax: 4,
      integer: true,
    },
    {
      title: 'Awake shards',
      sub: `Of ${hist.poolSize} in the pool, ${RANGE_TEXT[hist.range]}`,
      series: [{ name: 'Awake shards', color: 'var(--series-1)', values: pick('awake') }],
      step: true,
      minMax: hist.poolSize,
      integer: true,
    },
    {
      title: 'CPU per shard',
      sub: `% of one core while awake, ${RANGE_TEXT[hist.range]}`,
      series: cpuSeries(hist),
      minMax: 10,
      unit: ' %',
    },
  ];
  const points = hist.points.filter((p) => p.players !== null).length;
  $('history-note').textContent =
    points === 0
      ? 'No snapshots in this range yet (shard 0 writes one a minute).'
      : `${points} of ${hist.points.length} points have data · kept ${view.state?.historyRetentionDays ?? 14} days`;

  const chartsBox = $('charts');
  const tables = $('history-tables');
  chartsBox.hidden = view.tableView;
  tables.hidden = !view.tableView;
  if (view.tableView) {
    tables.replaceChildren(...charts.map((c) => dataTable(c.title, times, c.series, c.unit)));
  } else {
    chartsBox.replaceChildren();
    // Measure one cell, then draw every chart at that width.
    const probe = h('div', { class: 'chart' });
    chartsBox.append(probe);
    const width = probe.clientWidth - 32;
    chartsBox.replaceChildren(
      ...charts.map((c) =>
        c.series.length === 0
          ? h(
              'div',
              { class: 'chart' },
              h('h3', { text: c.title }),
              h('p', { class: 'sub', text: 'No awake shard reported CPU in this range.' }),
            )
          : lineChart({ ...c, times, width, range: hist.range }),
      ),
    );
  }
  renderEvents(hist.events);
}

// ---------- Events ----------

const KINDS = {
  woke: ['good', 'Woke up'],
  slept: ['quiet', 'Fell asleep'],
  restarted: ['warn', 'Restarted'],
  version: ['good', 'New version'],
  wakePing: ['', 'Wake request'],
  refusals: ['warn', 'Refused rooms'],
  allFull: ['crit', 'All shards full'],
  capacityBack: ['good', 'Capacity back'],
  started: ['', 'Started'],
};

function renderEvents(events) {
  const box = $('events');
  if (events.length === 0) {
    box.replaceChildren(h('div', { class: 'empty', text: 'No events in this range.' }));
    return;
  }
  const head = h(
    'tr',
    {},
    h('th', { scope: 'col', text: 'Time' }),
    h('th', { scope: 'col', text: 'Shard' }),
    h('th', { scope: 'col', text: 'Event' }),
    h('th', { scope: 'col', text: 'Detail' }),
  );
  const rows = events.map((e) => {
    const [cls, label] = KINDS[e.kind] ?? ['', e.kind];
    return h(
      'tr',
      {},
      h('td', { text: stampFmt.format(new Date(e.at)) }),
      h('td', { text: shardName(e.shard) }),
      h('td', {}, h('span', { class: `kind ${cls}`, text: label })),
      h('td', { class: 'detail', text: e.detail }),
    );
  });
  box.replaceChildren(
    h(
      'table',
      {},
      h('caption', {
        text: `${events.length} event${events.length === 1 ? '' : 's'}, newest first`,
      }),
      h('thead', {}, head),
      h('tbody', {}, rows),
    ),
  );
}

// ---------- Controls ----------

function setPaused(paused) {
  view.paused = paused;
  const btn = $('pause');
  btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
  btn.textContent = paused ? 'Resume' : 'Pause';
  if (paused) {
    clearTimeout(view.stateTimer);
    clearTimeout(view.historyTimer);
    if (view.state) renderState();
  } else {
    void loadState();
    void loadHistory();
  }
}

function init() {
  $('pause').addEventListener('click', () => setPaused(!view.paused));
  for (const btn of $('ranges').querySelectorAll('button')) {
    btn.addEventListener('click', () => {
      view.range = btn.dataset.range;
      for (const b of $('ranges').querySelectorAll('button')) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      }
      void loadHistory();
    });
  }
  $('table-view').addEventListener('change', (e) => {
    view.tableView = e.target.checked;
    renderHistory();
  });
  let resize = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resize);
    resize = setTimeout(renderHistory, 150);
  });
  void loadState();
  void loadHistory();
}

init();
