(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const NARR = window.NARR || {}, AUDIO = window.AUDIO || {}, DUR = window.DUR || {};
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* ---------- math helpers ---------- */
const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(arr, r = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function wl2rgb(w) {
  let r = 0, g = 0, b = 0;
  if (w >= 380 && w < 440) { r = -(w - 440) / 60; b = 1; }
  else if (w < 490) { g = (w - 440) / 50; b = 1; }
  else if (w < 510) { g = 1; b = -(w - 510) / 20; }
  else if (w < 580) { r = (w - 510) / 70; g = 1; }
  else if (w < 645) { r = 1; g = -(w - 645) / 65; }
  else if (w <= 750) { r = 1; }
  let f = 1; if (w < 420) f = .35 + .65 * (w - 380) / 40; else if (w > 700) f = .35 + .65 * (750 - w) / 50;
  const c = v => Math.round(255 * Math.pow(Math.max(0, v * f), .8));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/* ---------- generic plot ---------- */
function plot(svg, o) {
  const vb = svg.viewBox.baseVal, W = vb.width, H = vb.height;
  const p = Object.assign({ l: 46, r: 24, t: 14, b: 38 }, o.pad || {});
  const X = x => p.l + (x - o.xmin) / (o.xmax - o.xmin) * (W - p.l - p.r);
  const Y = y => H - p.b - (y - o.ymin) / (o.ymax - o.ymin) * (H - p.t - p.b);
  let h = '';
  if (o.under) h += o.under(X, Y, p, W, H);
  (o.xticks || []).forEach(t => { h += `<line x1="${X(t)}" y1="${H - p.b}" x2="${X(t)}" y2="${H - p.b + 5}" stroke="#98a2b5"/><text x="${X(t)}" y="${H - p.b + 19}" text-anchor="middle" font-size="${o.fs || 12}" fill="#6a7894">${t}</text>`; });
  (o.yticks || []).forEach(t => { h += `<line x1="${p.l}" y1="${Y(t)}" x2="${W - p.r}" y2="${Y(t)}" stroke="#eef0f5"/><text x="${p.l - 6}" y="${Y(t) + 4}" text-anchor="end" font-size="${o.fs || 12}" fill="#6a7894">${t}</text>`; });
  h += `<line x1="${p.l}" y1="${H - p.b}" x2="${W - p.r}" y2="${H - p.b}" stroke="#3a4561" stroke-width="1.5"/><line x1="${p.l}" y1="${H - p.b}" x2="${p.l}" y2="${p.t}" stroke="#3a4561" stroke-width="1.5"/>`;
  if (o.xlabel) h += `<text x="${(p.l + W - p.r) / 2}" y="${H - 4}" text-anchor="middle" font-size="${o.fs || 12}" fill="#3a4561">${o.xlabel}</text>`;
  if (o.ylabel) h += `<text x="${p.l + 4}" y="${p.t + 2}" font-size="${o.fs || 12}" fill="#3a4561">${o.ylabel}</text>`;
  (o.series || []).forEach(s => {
    const n = s.n || 300; let d = '';
    for (let i = 0; i <= n; i++) { const x = o.xmin + (o.xmax - o.xmin) * i / n; const y = Math.min(o.ymax, Math.max(o.ymin, s.f(x, i))); d += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1); }
    if (s.fill) h += `<path d="${d}L${X(o.xmax)} ${Y(o.ymin)}L${X(o.xmin)} ${Y(o.ymin)}Z" fill="${s.fill}"/>`;
    h += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.5}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`;
  });
  if (o.over) h += o.over(X, Y, p, W, H);
  svg.innerHTML = h;
}

/* ---------- inline stage paths ---------- */
$$('[data-wave]').forEach(el => {
  const [x0, y0, len, amp, wl] = el.dataset.wave.split(',').map(Number); let d = '';
  for (let x = 0; x <= len; x += 2) d += (x ? 'L' : 'M') + (x0 + x) + ' ' + (y0 + amp * Math.sin(2 * Math.PI * x / wl)).toFixed(1);
  el.setAttribute('d', d);
});
$$('[data-curve]').forEach(el => {
  const [box, pk] = el.dataset.curve.split('|'); const [x0, y0, W, H] = box.split(',').map(Number);
  const peaks = pk.split(',').map(s => s.split(':').map(Number)); let d = '';
  for (let i = 0; i <= 240; i++) { const f = i / 240; let v = 0; peaks.forEach(([c, h, w]) => v += h * gauss(f, c, w)); d += (i ? 'L' : 'M') + (x0 + f * W).toFixed(1) + ' ' + (y0 - Math.min(1, v) * H).toFixed(1); }
  el.setAttribute('d', d);
});

/* ---------- slide engine ---------- */
const slides = $$('.slide'); let cur = 0; const shown = new Set(); const onShow = {};
$('#pgAll').textContent = slides.length;
slides.forEach((s, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<small>${String(i + 1).padStart(2, '0')} · ${s.dataset.section} · ${s.dataset.min} 分</small>${esc(s.dataset.name)}`;
  b.onclick = () => { $('#toc').classList.remove('open'); go(i); };
  $('#tocGrid').appendChild(b);
});
function go(n) {
  n = Math.max(0, Math.min(slides.length - 1, n));
  players.forEach(p => p.stop());
  slides.forEach((s, i) => s.classList.toggle('active', i === n));
  cur = n; const s = slides[n];
  $('#progress').style.width = ((n + 1) / slides.length * 100) + '%';
  $('#section-tag').textContent = s.dataset.section;
  $('#mins').textContent = '建議 ' + s.dataset.min + ' 分';
  $('#pg').textContent = n + 1;
  try { history.replaceState(null, '', '#' + (n + 1)); } catch (e) { }
  s.scrollTop = 0;
}
$('#next').onclick = () => go(cur + 1);
$('#prev').onclick = () => go(cur - 1);
$('#tocBtn').onclick = () => $('#toc').classList.toggle('open');
$('#toc').onclick = e => { if (e.target.id === 'toc') $('#toc').classList.remove('open'); };
const fs = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { }); };
$('#fsBtn').onclick = fs;
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase(), ty = (e.target.type || '').toLowerCase();
  const page = e.key === 'PageDown' || e.key === 'PageUp';
  const typing = tag === 'select' || tag === 'textarea' || (tag === 'input' && !(page && (ty === 'range' || ty === 'checkbox')));
  if (e.key === 'Escape') { $('#toc').classList.remove('open'); return; }
  if (typing) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(cur + 1); }
  else if (e.key === ' ' && tag !== 'button' && tag !== 'a') { e.preventDefault(); go(cur + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1); }
  else if (e.key === 'Home') go(0); else if (e.key === 'End') go(slides.length - 1);
  else if (e.key === 'f' || e.key === 'F') fs();
  else if (e.key === 'm' || e.key === 'M') $('#toc').classList.toggle('open');
});
// 拖完滑桿或勾完選項後放掉焦點，方向鍵與簡報筆才能繼續換頁
document.addEventListener('pointerup', e => { const t = e.target; if (t && t.tagName === 'INPUT' && (t.type === 'range' || t.type === 'checkbox')) setTimeout(() => t.blur(), 0); });
$$('[data-reveal]').forEach(b => b.onclick = () => { $('#' + b.dataset.reveal).classList.add('show'); b.disabled = true; });

/* ---------- scores ---------- */
const SCORES = {};
function award(id, got, max) {
  SCORES[id] = [got, max];
  const g = Object.values(SCORES).reduce((a, v) => a + v[0], 0), m = Object.values(SCORES).reduce((a, v) => a + v[1], 0);
  $('#totalScore').textContent = `${g} / ${m} 分`;
  $('#totalNote').textContent = `已完成 ${Object.keys(SCORES).length} / 6 個關卡（5 個小遊戲 ＋ 結業測驗）。`;
}

/* ---------- narrated animation player ---------- */
const players = [];
$$('.anim').forEach(box => {
  const id = box.dataset.anim, steps = NARR[id] || [], n = steps.length;
  const els = $$('[data-from]', box), cap = $('.cap', box), ctl = $('.ctl', box);
  ctl.innerHTML = `<button class="btn primary" data-a="play">▶ 播放旁白</button><button class="btn" data-a="prev">‹ 上一步</button><button class="btn" data-a="next">下一步 ›</button><button class="btn" data-a="re">↺ 重播</button><label class="stat"><input type="checkbox" data-a="mute"> 無聲模式（只看字幕）</label><span class="stat" data-a="stat"></span><span class="dots">${steps.map(() => '<i></i>').join('')}</span>`;
  const btn = $('[data-a=play]', ctl), stat = $('[data-a=stat]', ctl), dots = $$('.dots i', ctl), mute = $('[data-a=mute]', ctl);
  const audio = new Audio(); audio.preload = 'auto';
  let step = 0, playing = false, timer = null, loaded = -1, finished = false;
  function setStep(i) {
    step = Math.max(0, Math.min(n - 1, i));
    els.forEach(el => { const f = +el.dataset.from, t = el.dataset.to === undefined ? 99 : +el.dataset.to; el.classList.toggle('on', step >= f && step <= t); });
    cap.textContent = steps[step] ? steps[step].cap : '';
    dots.forEach((d, k) => d.classList.toggle('on', k <= step));
  }
  function ui() { btn.textContent = playing ? '⏸ 暫停' : '▶ 播放旁白'; }
  function advance() { if (!playing) return; if (step < n - 1) timer = setTimeout(() => run(step + 1), 500); else { playing = false; finished = true; ui(); stat.textContent = '播放完畢'; } }
  function silent(i) { stat.textContent = '字幕模式'; timer = setTimeout(advance, ((DUR[id] || [])[i] || steps[i].cap.length * .25) * 1000); }
  function run(i) {
    clearTimeout(timer); setStep(i); stat.textContent = '';
    const src = (AUDIO[id] || [])[i];
    if (mute.checked || !src) { audio.pause(); silent(i); return; }
    audio.src = src; loaded = i;
    const pr = audio.play(); if (pr && pr.catch) pr.catch(() => { if (playing && loaded === i) silent(i); });
  }
  audio.onended = advance;
  audio.onerror = () => { if (playing) silent(step); };
  const api = {
    stop() { clearTimeout(timer); audio.pause(); playing = false; ui(); },
    toggle() {
      if (playing) { api.stop(); return; }
      playing = true; ui();
      if (finished) { finished = false; run(0); return; }
      if (!mute.checked && loaded === step && audio.currentTime > 0 && !audio.ended) { audio.play().catch(() => silent(step)); return; }
      run(step);
    }
  };
  btn.onclick = () => api.toggle();
  $('[data-a=prev]', ctl).onclick = () => { api.stop(); loaded = -1; finished = false; setStep(step - 1); stat.textContent = ''; };
  $('[data-a=next]', ctl).onclick = () => { api.stop(); loaded = -1; finished = false; setStep(step + 1); stat.textContent = ''; };
  $('[data-a=re]', ctl).onclick = () => { api.stop(); loaded = -1; finished = false; playing = true; ui(); run(0); };
  setStep(0); players.push(api);
});

/* ---------- 波長探險 ---------- */
(() => {
  const segs = [['X 光', -2, 1, '#64748b'], ['紫外線', 1, 2.602, '#7c3aed'], ['', 2.602, 2.845, 'linear-gradient(90deg,#bf5af2,#0a84ff,#34c759,#ffd60a,#ff3b30)'], ['紅外線', 2.845, 6, '#b91c1c'], ['微波・無線電波', 6, 9, '#78350f']];
  const bar = $('#embar');
  bar.innerHTML = segs.map(s => `<div style="width:${(s[2] - s[1]) / 11 * 100}%;background:${s[3]}">${s[0]}</div>`).join('') + '<div class="mk" id="wlMk"></div>';
  const info = [
    [1, 'X 光', '🏥 醫院照 X 光、機場行李安檢。能量高，能穿透行李箱。', '🔎 今天的案子：XRF 看元素（關卡 4）'],
    [2.602, '紫外線', '🧴 曬黑、驗鈔燈、紫外線殺菌燈。', '🔎 相關技術：螢光分析'],
    [2.845, '可見光', '🌈 彩虹，還有你看到的所有顏色。', '🔎 今天的案子：薑黃素驗硼砂（550 奈米）'],
    [3.398, '近紅外光', '📱 電視遙控器、手機臉部辨識。', '🔎 今天的案子：雞蛋新鮮度（740–1070 奈米）'],
    [6, '紅外線', '🌡️ 額溫槍、熱像儀——溫熱的物體都會放出紅外線。', '🔎 今天的案子：紅外光譜看分子指紋'],
    [8.477, '微波', '🍱 微波爐、Wi-Fi、手機訊號。', '🔎 再往右一點，就是核磁共振（NMR）用的波段 →'],
    [9.01, '無線電波（緊接在微波後面）', '📻 廣播、電視訊號；醫院的磁振造影（MRI）也用它。', '🔎 相關技術：核磁共振（NMR）——讓氫原子核共振，看出分子結構，例如分辨咖啡真偽']
  ];
  const fmt = nm => nm < 1 ? nm.toFixed(2) + ' 奈米' : nm < 1e3 ? Math.round(nm) + ' 奈米' : nm < 1e6 ? (nm / 1e3).toFixed(nm < 1e4 ? 1 : 0) + ' 微米' : nm < 1e7 ? (nm / 1e6).toFixed(1) + ' 毫米' : nm < 1e9 ? (nm / 1e7).toFixed(nm < 1e8 ? 1 : 0) + ' 公分' : '1 公尺';
  const r = $('#wlRange');
  function upd() {
    const L = -2 + r.value / 1000 * 11, nm = Math.pow(10, L); const it = info.find(x => L < x[0]) || info[info.length - 1];
    $('#wlMk').style.left = (r.value / 10) + '%';
    $('#wlVal').textContent = '波長 ' + fmt(nm); $('#wlBand').textContent = it[1]; $('#wlLife').textContent = it[2]; $('#wlCase').textContent = it[3];
    const sw = $('#wlSw'); const vis = it[1] === '可見光';
    sw.style.background = vis ? wl2rgb(nm) : 'repeating-linear-gradient(45deg,#d6dbe6 0 8px,#eef0f5 8px 16px)'; sw.title = vis ? '' : '眼睛看不見';
  }
  r.oninput = upd; upd();
})();

/* ---------- classify game (遊戲①⑤) ---------- */
function classify(root, id, bins, items) {
  let order, i, score, done;
  function start() { order = shuffle(items); i = 0; score = 0; draw(); }
  function draw() {
    if (i >= order.length) {
      award(id, score, order.length);
      root.innerHTML = `<div class="card itemcard"><div class="badge">${score === order.length ? '🏆' : score >= order.length * .6 ? '👍' : '💪'}</div>答對 ${score} / ${order.length} 題<small>${score === order.length ? '全對！你是天生的偵探。' : '再玩一次，挑戰全對！'}</small></div><div class="row" style="margin-top:12px;justify-content:center"><button class="btn primary" data-k="again">↺ 再玩一次</button></div>`;
      $('[data-k=again]', root).onclick = start; return;
    }
    const it = order[i]; done = false;
    root.innerHTML = `<div class="ghead"><span class="pill a">第 ${i + 1} / ${order.length} 題</span><span class="score">得分 ${score}</span></div>
      <div class="card itemcard">${esc(it.t)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
      <div class="bins">${bins.map((b, k) => `<button class="btn" data-b="${k}">${esc(b)}</button>`).join('')}</div>
      <div class="row" style="justify-content:space-between"><div class="fb"></div><button class="btn primary" data-k="next" style="visibility:hidden">下一題 →</button></div>`;
    $$('[data-b]', root).forEach(b => b.onclick = () => {
      if (done) return; done = true; const k = +b.dataset.b, ok = k === it.a; if (ok) score++;
      b.classList.add(ok ? 'ok' : 'bad'); if (!ok) $(`[data-b="${it.a}"]`, root).classList.add('ok');
      $$('[data-b]', root).forEach(x => x.disabled = true);
      const fb = $('.fb', root); fb.className = 'fb ' + (ok ? 'ok' : 'bad'); fb.textContent = (ok ? '✔ 答對了！' : '✘ 再想想：') + it.why;
      $('.score', root).textContent = '得分 ' + score; $('[data-k=next]', root).style.visibility = 'visible';
    });
    $('[data-k=next]', root).onclick = () => { i++; draw(); };
  }
  start();
}
classify($('#g1'), 'g1', ['X 光', '紫外線', '可見光', '紅外線'], [
  { t: '🧳 機場行李安檢', a: 0, why: '波長短、能量高的 X 光才能穿透行李箱。' },
  { t: '⚛️ XRF 分析蜂蜜裡的元素', a: 0, why: 'XRF 就是「X 光螢光」，用 X 光激發原子。' },
  { t: '🧴 曬黑、要擦防曬乳', a: 1, why: '曬黑的元凶是陽光裡的紫外線。' },
  { t: '💵 驗鈔燈讓防偽油墨發光', a: 1, why: '驗鈔燈發出紫外線，油墨吸收後放出螢光。' },
  { t: '🌈 雨後的彩虹', a: 2, why: '彩虹就是陽光中可見光的光譜。' },
  { t: '🧪 薑黃素驗硼砂', sub: '測 550 奈米的吸光度', a: 2, why: '550 奈米落在 400–700 奈米的可見光範圍。' },
  { t: '📺 電視遙控器', a: 3, why: '遙控器發出的是眼睛看不到的近紅外光。' },
  { t: '🥚 掃一下就知道蛋放了幾天', sub: '用 740–1070 奈米的光', a: 3, why: '比紅光（約 700 奈米）更長，屬於近紅外光。' },
  { t: '🌡️ 額溫槍量體溫', a: 3, why: '額溫槍接收的是皮膚放出的紅外線。' }
]);
classify($('#g5'), 'g5', ['🧪 分光光度計（可見光）', '🥚 近紅外光譜', '🕺 拉曼／紅外光譜', '⚛️ X 光螢光 XRF'], [
  { t: '魚丸有沒有加硼砂？', sub: '加薑黃素呈色後，量有多紅', a: 0, why: '有顏色、要知道「多濃」→ 量可見光的吸光度。' },
  { t: '飲料裡的色素加了多少？', a: 0, why: '色素有顏色，越濃吸光度越高 → 分光光度計。' },
  { t: '不打破蛋殼，估計蛋放了幾天', a: 1, why: '近紅外光能穿過蛋殼表層，而且不破壞樣品。' },
  { t: '奶粉有沒有被大量摻入三聚氰胺？', a: 2, why: '要認出「是哪種分子」→ 找 676 的拉曼指紋峰。' },
  { t: '瓶裝水裡的小顆粒是哪一種塑膠？', a: 2, why: '每種塑膠的分子指紋不同 → 拉曼或紅外光譜比對圖庫。' },
  { t: '即溶咖啡是 Arabica 還是 Robusta？', a: 2, why: '比較分子指紋的細微差異 → 紅外光譜加上電腦分類。' },
  { t: '這批番茄是哪個產地來的？', sub: '比較土壤帶來的元素', a: 3, why: '要看「有哪些元素」→ 元素指紋，用 XRF。' },
  { t: '蜂蜜裡的鉀、鈣、鋅有多少？', a: 3, why: '鉀、鈣、鋅都是元素 → XRF 看峰位與峰高。' }
]);

/* ---------- 顏色實驗室 ---------- */
(() => {
  const DY = [
    { n: '藍色 1 號（亮藍）', pk: [[630, 1, 38]], eat: '橙紅光（約 630 奈米）', see: '藍色', col: '#1e6fe0' },
    { n: '紅色 40 號', pk: [[504, 1, 45]], eat: '藍綠光（約 504 奈米）', see: '紅色', col: '#e0282e' },
    { n: '薑黃素', pk: [[425, 1, 40]], eat: '藍紫光（約 425 奈米）', see: '黃色', col: '#f6c915' },
    { n: '葉綠素', pk: [[430, 1, 28], [662, .8, 22]], eat: '藍紫光（約 430 奈米）和紅光（約 662 奈米）', see: '綠色', col: '#22a559' }
  ];
  const box = $('#dyeBtns'); box.innerHTML = DY.map((d, i) => `<button class="btn" data-i="${i}">${d.n}</button>`).join('');
  function pick(i) {
    const d = DY[i]; $$('button', box).forEach((b, k) => b.classList.toggle('sel', k === i));
    $('#dyeSw').style.background = d.col; $('#dyeEat').innerHTML = `被吃掉的光：<b>${d.eat}</b>`; $('#dyeSee').textContent = `→ 剩下的光混在一起，看起來是${d.see}`;
    plot($('#dyeSvg'), {
      xmin: 400, xmax: 700, ymin: 0, ymax: 1.15, xticks: [400, 450, 500, 550, 600, 650, 700], xlabel: '波長（奈米）', ylabel: '吸收（被吃掉多少）', pad: { b: 52 },
      under: (X, Y, p, W, H) => { let s = ''; for (let w = 400; w < 700; w += 5) s += `<rect x="${X(w)}" y="${p.t}" width="${X(w + 5) - X(w) + .6}" height="${H - p.b - p.t}" fill="${wl2rgb(w)}" opacity=".9"/>`; return s; },
      series: [{ f: x => d.pk.reduce((a, [c, h, w]) => a + h * gauss(x, c, w), 0), color: '#0d1024', width: 3, fill: 'rgba(13,16,36,.72)' }]
    });
  }
  $$('button', box).forEach(b => b.onclick = () => pick(+b.dataset.i)); pick(0);
})();

/* ---------- 檢量線 ---------- */
const K = 0.095;
function calPlot(svg, C, target) {
  plot(svg, {
    xmin: 0, xmax: 10, ymin: 0, ymax: 1, xticks: [0, 2, 4, 6, 8, 10], yticks: [0.2, 0.4, 0.6, 0.8, 1], fs: 14, xlabel: '濃度（µg/mL）', ylabel: '吸光度', pad: { l: 50, b: 44, t: 22 },
    series: [{ f: x => K * x, color: '#006eb5', width: 3 }],
    over: (X, Y, p, W) => {
      let s = '';
      if (target !== null && target !== undefined) s += `<line x1="${p.l}" y1="${Y(target)}" x2="${W - p.r}" y2="${Y(target)}" stroke="#c8155c" stroke-width="2" stroke-dasharray="7 6"/><text x="${W - p.r - 4}" y="${Y(target) - 7}" text-anchor="end" font-size="14" font-weight="700" fill="#c8155c">儀器讀數 ${target.toFixed(3)}</text>`;
      s += `<line x1="${X(C)}" y1="${Y(K * C)}" x2="${X(C)}" y2="${Y(0)}" stroke="#98a2b5" stroke-dasharray="4 4"/><circle cx="${X(C)}" cy="${Y(K * C)}" r="9" fill="#c8155c" stroke="#fff" stroke-width="3"/>`;
      return s;
    }
  });
}
(() => {
  const r = $('#beerRange');
  const upd = () => { const C = +r.value; $('#beerC').textContent = C.toFixed(1) + ' µg/mL'; $('#beerA').textContent = (K * C).toFixed(3); $('#beerTube').style.background = `rgba(216,30,91,${(.06 + .088 * C).toFixed(3)})`; calPlot($('#beerSvg'), C, null); };
  r.oninput = upd; upd();
})();

/* ---------- 硼砂步驟 ---------- */
(() => {
  const T = ['① 薑黃素本身是黃色的。', '② 加入食物的萃取液（酸性）：如果裡面有硼酸，薑黃素會和它結合，變成玫瑰紅色。紅得越深，硼越多——用 550 奈米的光量吸光度，就能定量。', '③ 再加氨水確認：紅色變成墨綠色，就確定是硼，不是別的東西在搗蛋。'];
  let s = 0; const set = () => { $$('.steps .st').forEach(e => e.classList.toggle('on', +e.dataset.st <= s)); $('#boricTxt').textContent = T[s]; $('#boricNext').disabled = s >= 2; };
  $('#boricNext').onclick = () => { s = Math.min(2, s + 1); set(); }; $('#boricReset').onclick = () => { s = 0; set(); }; set();
})();

/* ---------- 遊戲② 檢量線闖關 ---------- */
(() => {
  const root = $('#g2');
  const S = [{ e: '🍡', n: '魚丸', a: 0.570 }, { e: '🍜', n: '油麵', a: 0 }, { e: '🍘', n: '年糕', a: 0.285 }, { e: '🍙', n: '粽子', a: 0.760 }];
  let i, score, done;
  function start() { i = 0; score = 0; draw(); }
  function draw() {
    if (i >= S.length) {
      award('g2', score, S.length);
      root.innerHTML = `<div class="card itemcard"><div class="badge">${score === S.length ? '🏆' : '🔬'}</div>判對 ${score} / ${S.length} 份檢體<small>訣竅：吸光度 ÷ 0.095 ＝ 濃度。硼砂是禁用添加物，只要檢出就違規。</small></div><div class="row" style="margin-top:12px;justify-content:center"><button class="btn primary" data-k="again">↺ 再玩一次</button></div>`;
      $('[data-k=again]', root).onclick = start; return;
    }
    const s = S[i], trueC = s.a / K; done = false;
    root.innerHTML = `<div class="grid2">
      <div>
       <div class="ghead"><span class="pill a">檢體 ${i + 1} / ${S.length}</span><span class="score">得分 ${score}</span></div>
       <div class="card"><div class="row" style="flex-wrap:nowrap"><div class="emoji" style="font-size:2.6rem">${s.e}</div><div><h4>${s.n}的萃取液，加薑黃素呈色後</h4><p>儀器在 550 奈米量到的吸光度：<b class="accent2" style="font-size:1.3em">${s.a.toFixed(3)}</b></p></div></div></div>
       <p class="body" style="margin-top:8px">① 拖動滑桿，讓紅點對準虛線，讀出濃度：<b class="readout" data-k="c"></b></p>
       <input type="range" min="0" max="10" step="0.5" value="5" data-k="r" aria-label="濃度滑桿">
       <p class="body">② 下判定：</p>
       <div class="row"><button class="btn" data-v="0">✅ 沒檢出，合格</button><button class="btn" data-v="1">🚨 檢出硼酸，違規</button><button class="btn primary" data-k="next" style="visibility:hidden">下一份 →</button></div>
       <div class="fb"></div>
      </div>
      <div class="card"><svg viewBox="0 0 520 330" data-k="svg"></svg></div></div>`;
    const r = $('[data-k=r]', root), svg = $('[data-k=svg]', root);
    const upd = () => { $('[data-k=c]', root).textContent = (+r.value).toFixed(1) + ' µg/mL'; calPlot(svg, +r.value, s.a); };
    r.oninput = upd; upd();
    $$('[data-v]', root).forEach(b => b.onclick = () => {
      if (done) return; done = true; const cOk = Math.abs(+r.value - trueC) < .01, vOk = (+b.dataset.v === 1) === (s.a > 0), ok = cOk && vOk; if (ok) score++;
      b.classList.add(vOk ? 'ok' : 'bad'); $$('[data-v]', root).forEach(x => x.disabled = true); r.disabled = true;
      r.value = trueC; upd();
      const fb = $('.fb', root); fb.className = 'fb ' + (ok ? 'ok' : 'bad');
      fb.textContent = (ok ? '✔ 完全正確！' : cOk ? '✘ 濃度讀對了，但判定錯了。' : vOk ? '△ 判定對了，但濃度沒對準。' : '✘ 再看一次。') + ` ${s.a.toFixed(3)} ÷ 0.095 ＝ ${trueC.toFixed(1)} µg/mL，` + (s.a > 0 ? '檢出硼酸 → 違規。' : '沒有呈現紅色 → 沒檢出。');
      $('.score', root).textContent = '得分 ' + score; $('[data-k=next]', root).style.visibility = 'visible';
    });
    $('[data-k=next]', root).onclick = () => { i++; draw(); };
  }
  start();
})();

/* ---------- 雞蛋 NIR ---------- */
(() => {
  const B = [[890, '碳–氫鍵（C–H）的訊號：油脂這類有機分子都有它。', '#f59e0b'], [960, '氧–氫鍵（O–H）的訊號：和「水分」有關。', '#0a84ff'], [1020, '氮–氫鍵（N–H）的訊號：和「蛋白質」有關。', '#c8155c']];
  let sel = -1;
  const f = x => .3 + .12 * gauss(x, 890, 24) + .5 * gauss(x, 962, 34) + .2 * gauss(x, 1020, 20) + .00035 * (x - 740);
  function draw() {
    plot($('#eggSvg'), {
      xmin: 740, xmax: 1070, ymin: 0, ymax: 1.05, xticks: [750, 800, 850, 900, 950, 1000, 1050], xlabel: '波長（奈米）', ylabel: '吸收',
      under: (X, Y, p, W, H) => sel < 0 ? '' : `<rect x="${X(B[sel][0] - 22)}" y="${p.t}" width="${X(B[sel][0] + 22) - X(B[sel][0] - 22)}" height="${H - p.b - p.t}" fill="${B[sel][2]}" opacity=".2"/>`,
      series: [{ f, color: '#0d1024', width: 3 }],
      over: (X, Y) => B.map((b, k) => `<circle cx="${X(b[0])}" cy="${Y(f(b[0]))}" r="${k === sel ? 9 : 6}" fill="${b[2]}" stroke="#fff" stroke-width="2"/>`).join('')
    });
  }
  $('#eggBtns').innerHTML = B.map((b, k) => `<button class="btn" data-i="${k}">約 ${b[0]} 奈米</button>`).join('');
  $$('#eggBtns button').forEach(b => b.onclick = () => { sel = +b.dataset.i; $$('#eggBtns button').forEach((x, k) => x.classList.toggle('sel', k === sel)); $('#eggTxt').textContent = B[sel][1]; draw(); });
  draw();
})();

/* ---------- 拉曼光譜庫 ---------- */
const LIB = [
  { n: '澱粉', key: '478', pk: [[478, 1, 16], [865, .25, 14], [940, .3, 14], [1125, .28, 14]] },
  { n: '三聚氰胺', key: '676', pk: [[676, 1, 11]] },
  { n: '醣類（乳糖、蔗糖）', key: '850／1085／1125', pk: [[850, .85, 13], [1085, .6, 14], [1125, .75, 13]] },
  { n: '蛋白質', key: '1003', pk: [[1003, 1, 8], [1441, .3, 16], [1655, .5, 24]] },
  { n: '類胡蘿蔔素', key: '1156／1523', pk: [[1003, .15, 8], [1156, .8, 11], [1523, 1, 12]] },
  { n: '油脂', key: '1441／1655／1745', pk: [[1265, .3, 13], [1301, .5, 12], [1441, .95, 13], [1655, .7, 12], [1745, .35, 11]] }
];
const ram = (pk, x) => pk.reduce((a, [c, h, w]) => a + h * gauss(x, c, w), 0);
const milk = x => .6 * ram(LIB[3].pk, x) + .7 * ram(LIB[5].pk, x) + .55 * ram(LIB[2].pk, x);
const RX = [400, 600, 800, 1000, 1200, 1400, 1600, 1800];

/* ---------- 三聚氰胺滑桿 ---------- */
(() => {
  const r = $('#melRange'); const R = rng(7), noise = Array.from({ length: 301 }, () => (R() - .5) * .07);
  function upd() {
    const p = +r.value; $('#melVal').textContent = p.toFixed(1) + ' %';
    const t = $('#melTxt');
    if (p === 0) { t.textContent = '純奶粉：676 的位置什麼都沒有。往右拖，開始摻假 →'; t.style.color = 'var(--ink-2)'; }
    else if (p < .5) { t.textContent = '😶 摻了一點點，但訊號淹沒在雜訊裡——看不出來！'; t.style.color = 'var(--warn)'; }
    else { t.textContent = '🚨 676 的位置冒出一個不該有的峰——三聚氰胺現形！'; t.style.color = 'var(--danger)'; }
    plot($('#melSvg'), {
      xmin: 400, xmax: 1800, ymin: -.08, ymax: 1.35, xticks: RX, xlabel: '拉曼位移（波數 cm⁻¹）', ylabel: '訊號強度',
      under: (X, Y, pd, W, H) => `<rect x="${X(646)}" y="${pd.t}" width="${X(706) - X(646)}" height="${H - pd.b - pd.t}" fill="#c8155c" opacity="${p >= .5 ? .16 : .06}"/><text x="${X(676)}" y="${pd.t + 14}" text-anchor="middle" font-size="13" font-weight="700" fill="#c8155c">676</text>`,
      series: [{ f: (x, i) => milk(x) + p * .22 * gauss(x, 676, 11) + noise[i], color: '#0d1024', width: 2 }],
      over: (X, Y) => `<text x="${X(1003)}" y="${Y(.72)}" text-anchor="middle" font-size="12" fill="#6a7894">蛋白質</text><text x="${X(1441)}" y="${Y(1.0)}" text-anchor="middle" font-size="12" fill="#6a7894">油脂</text><text x="${X(1100)}" y="${Y(.62)}" text-anchor="middle" font-size="12" fill="#6a7894">乳糖</text>`
    });
  }
  r.oninput = upd; upd();
})();

/* ---------- 遊戲③ 指紋比對 ---------- */
(() => {
  const root = $('#g3'); let rounds, i, score, done;
  function start() { const o = shuffle([0, 2, 3, 4, 5]).slice(0, 4).map(k => ({ a: k, mix: false })); rounds = o.concat([{ a: 1, mix: true }]); i = 0; score = 0; draw(); }
  function draw() {
    if (i >= rounds.length) {
      award('g3', score, rounds.length);
      root.innerHTML = `<div class="card itemcard"><div class="badge">${score === rounds.length ? '🏆' : '🔍'}</div>比對成功 ${score} / ${rounds.length} 件<small>你剛剛做的事，就是光譜儀的「資料庫比對」功能。</small></div><div class="row" style="margin-top:12px;justify-content:center"><button class="btn primary" data-k="again">↺ 再玩一次</button></div>`;
      $('[data-k=again]', root).onclick = start; return;
    }
    const rd = rounds[i], R = rng(100 + i * 13 + rd.a); done = false;
    const noise = Array.from({ length: 401 }, () => (R() - .5) * .08);
    root.innerHTML = `<div class="ghead"><span class="pill ${rd.mix ? 'b' : 'a'}">${rd.mix ? '加分題' : '第 ' + (i + 1) + ' / ' + rounds.length + ' 件'}</span><b class="small" style="color:var(--ink)">${rd.mix ? '這罐奶粉的光譜裡，多了一個不該有的成分。是誰？' : '未知樣品的拉曼光譜在上面。點選下方資料庫中「峰的位置」相同的那一個。'}</b><span class="score">得分 ${score}</span></div>
      <div class="card" style="padding:6px 10px"><svg viewBox="0 0 1200 190" data-k="u" style="max-height:27vh;width:100%"></svg></div>
      <div class="lib">${LIB.map((l, k) => `<button data-b="${k}">${l.n}　<span class="pill">${l.key}</span><svg viewBox="0 0 400 56" data-m="${k}"></svg></button>`).join('')}</div>
      <div class="row" style="justify-content:space-between"><div class="fb"></div><button class="btn primary" data-k="next" style="visibility:hidden">下一件 →</button></div>`;
    plot($('[data-k=u]', root), { xmin: 400, xmax: 1800, ymin: -.08, ymax: 1.3, xticks: RX, fs: 14, pad: { l: 20, b: 26, t: 8 }, series: [{ n: 400, f: (x, j) => (rd.mix ? milk(x) + .9 * gauss(x, 676, 11) : ram(LIB[rd.a].pk, x)) + noise[j], color: '#c8155c', width: 2.2 }] });
    LIB.forEach((l, k) => plot($(`[data-m="${k}"]`, root), { xmin: 400, xmax: 1800, ymin: 0, ymax: 1.15, pad: { l: 6, r: 6, t: 4, b: 4 }, series: [{ f: x => ram(l.pk, x), color: '#006eb5', width: 2, fill: 'rgba(0,110,181,.12)' }] }));
    $$('[data-b]', root).forEach(b => b.onclick = () => {
      if (done) return; done = true; const k = +b.dataset.b, ok = k === rd.a; if (ok) score++;
      b.classList.add(ok ? 'ok' : 'bad'); if (!ok) $(`[data-b="${rd.a}"]`, root).classList.add('ok');
      const fb = $('.fb', root); fb.className = 'fb ' + (ok ? 'ok' : 'bad');
      fb.textContent = (ok ? '✔ 比對成功！' : '✘ 不是它。') + (rd.mix ? '奶粉本來就有蛋白質、油脂、乳糖；多出來的 676 峰是三聚氰胺。' : `關鍵是 ${LIB[rd.a].key} 的峰 → ${LIB[rd.a].n}。`);
      $('.score', root).textContent = '得分 ' + score; $('[data-k=next]', root).style.visibility = 'visible';
    });
    $('[data-k=next]', root).onclick = () => { i++; draw(); };
  }
  start();
})();

/* ---------- 遊戲④ XRF ---------- */
(() => {
  const root = $('#g4');
  const EL = [['K', '鉀', 3.31], ['Ca', '鈣', 3.69], ['Fe', '鐵', 6.40], ['Cu', '銅', 8.05], ['Zn', '鋅', 8.64], ['Rb', '銣', 13.39], ['Sr', '鍶', 14.16]];
  const RD = [{ n: '樣品 A', s: { K: .9, Ca: .6, Fe: .4 } }, { n: '樣品 B', s: { Ca: .8, Zn: .45, Sr: .55 } }, { n: '樣品 C', s: { K: .7, Cu: .5, Zn: .65, Rb: .4 } }];
  let i, score, done, pick;
  function start() { i = 0; score = 0; draw(); }
  function draw() {
    if (i >= RD.length) {
      award('g4', score, RD.length);
      root.innerHTML = `<div class="card itemcard"><div class="badge">${score === RD.length ? '🏆' : '⚛️'}</div>解碼成功 ${score} / ${RD.length} 份<small>峰的位置＝元素身分。真正的 XRF 軟體也是這樣查表的。</small></div><div class="row" style="margin-top:12px;justify-content:center"><button class="btn primary" data-k="again">↺ 再玩一次</button></div>`;
      $('[data-k=again]', root).onclick = start; return;
    }
    const rd = RD[i]; done = false; pick = new Set();
    root.innerHTML = `<div class="grid2">
      <div class="card"><svg viewBox="0 0 560 310" data-k="svg"></svg><p class="note">模擬能譜。峰位為各元素真實的特徵能量。</p></div>
      <div>
       <div class="ghead"><span class="pill a">${rd.n}（${i + 1} / ${RD.length}）</span><span class="score">得分 ${score}</span></div>
       <p class="body">對照「元素能量表」，把能譜裡出現的元素<b class="hl">全部</b>選出來：</p>
       <div class="chips" style="margin:10px 0">${EL.map(e => `<button class="btn" data-e="${e[0]}">${e[1]} ${e[0]}<br><span class="small">${e[2].toFixed(2)} keV</span></button>`).join('')}</div>
       <div class="row"><button class="btn primary" data-k="go">送出答案</button><button class="btn primary" data-k="next" style="display:none">下一份 →</button></div>
       <div class="fb"></div>
      </div></div>`;
    plot($('[data-k=svg]', root), {
      xmin: 2, xmax: 16, ymin: 0, ymax: 1.15, xticks: [2, 4, 6, 8, 10, 12, 14, 16], fs: 13, xlabel: '能量（keV）', ylabel: '強度',
      series: [{ n: 700, f: x => EL.reduce((a, e) => a + (rd.s[e[0]] || 0) * gauss(x, e[2], .11), 0) + .02, color: '#0d1024', width: 2.2, fill: 'rgba(245,196,0,.35)' }],
      over: (X, Y) => { const es = EL.filter(e => rd.s[e[0]]); return es.map((e, k) => { const prev = es[k - 1], near = prev && e[2] - prev[2] < 1; return `<text x="${X(e[2]) + (near ? 4 : 0)}" y="${Y(rd.s[e[0]]) - 8}" text-anchor="${near ? 'start' : k < es.length - 1 && es[k + 1][2] - e[2] < 1 ? 'end' : 'middle'}" font-size="14" font-weight="700" fill="#c8155c">${e[2].toFixed(2)}</text>`; }).join(''); }
    });
    $$('[data-e]', root).forEach(b => b.onclick = () => { if (done) return; const k = b.dataset.e; pick.has(k) ? pick.delete(k) : pick.add(k); b.classList.toggle('sel', pick.has(k)); });
    $('[data-k=go]', root).onclick = () => {
      if (done) return; done = true; const ans = Object.keys(rd.s); const ok = ans.length === pick.size && ans.every(k => pick.has(k)); if (ok) score++;
      $$('[data-e]', root).forEach(b => { const k = b.dataset.e, a = ans.includes(k), p = pick.has(k); b.classList.remove('sel'); if (a) b.classList.add('ok'); else if (p) b.classList.add('bad'); b.disabled = true; });
      const fb = $('.fb', root); fb.className = 'fb ' + (ok ? 'ok' : 'bad');
      fb.textContent = (ok ? '✔ 完全正確！' : '✘ 差一點。') + '這份樣品含有：' + EL.filter(e => ans.includes(e[0])).map(e => e[1]).join('、') + '。';
      $('.score', root).textContent = '得分 ' + score; $('[data-k=go]', root).style.display = 'none'; $('[data-k=next]', root).style.display = '';
    };
    $('[data-k=next]', root).onclick = () => { i++; draw(); };
  }
  start();
})();

/* ---------- 光譜 × 電腦 ---------- */
(() => {
  const svg = $('#aiSvg'); let mode = 0; const R = rng(42);
  const pts = Array.from({ length: 56 }, (_, k) => { const a = k < 29; return [a ? 150 + (R() - .5) * 150 : 370 + (R() - .5) * 150, a ? 110 + (R() - .5) * 110 : 205 + (R() - .5) * 110, a]; });
  const base = x => .25 + .5 * gauss(x, 1050, 120) + .45 * gauss(x, 1650, 90) + .3 * gauss(x, 1450, 60) + .2 * gauss(x, 1740, 30);
  function draw() {
    if (!mode) {
      plot(svg, { xmin: 810, xmax: 1911, ymin: 0, ymax: 1.1, xticks: [900, 1100, 1300, 1500, 1700, 1900], xlabel: '波數（cm⁻¹）', ylabel: '吸收', series: [{ f: x => base(x), color: '#006eb5', width: 2.5 }, { f: x => base(x) + .035 * gauss(x, 1710, 30) - .02 * gauss(x, 1000, 50), color: '#f97316', width: 2.5, dash: '6 5' }], over: (X, Y) => `<text x="${X(1000)}" y="${Y(1.0)}" font-size="13" fill="#006eb5" font-weight="700">— Arabica</text><text x="${X(1000)}" y="${Y(.9)}" font-size="13" fill="#f97316" font-weight="700">- - Robusta</text>` });
      $('#aiTxt').textContent = '兩條線幾乎重疊。你看得出哪裡不一樣嗎？'; $('#aiBtn').textContent = '🤖 讓電腦找出差異';
    } else {
      svg.innerHTML = `<line x1="40" y1="290" x2="500" y2="290" stroke="#3a4561" stroke-width="1.5"/><line x1="40" y1="290" x2="40" y2="20" stroke="#3a4561" stroke-width="1.5"/><text x="270" y="312" text-anchor="middle" font-size="12" fill="#3a4561">電腦找到的差異方向 1</text><text x="46" y="18" font-size="12" fill="#3a4561">差異方向 2</text>` +
        pts.map(p => `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="7" fill="${p[2] ? '#006eb5' : '#f97316'}" opacity=".8"><animate attributeName="cx" from="270" to="${p[0].toFixed(0)}" dur="0.9s" fill="freeze"/><animate attributeName="cy" from="160" to="${p[1].toFixed(0)}" dur="0.9s" fill="freeze"/></circle>`).join('') +
        `<text x="150" y="40" text-anchor="middle" font-size="15" font-weight="700" fill="#006eb5">Arabica</text><text x="390" y="280" text-anchor="middle" font-size="15" font-weight="700" fill="#f97316">Robusta</text>`;
      $('#aiTxt').textContent = '電腦把每條光譜的 286 個數字濃縮成一個點：一支咖啡一個點，兩個品種自動分成兩群。'; $('#aiBtn').textContent = '↺ 回到光譜';
    }
  }
  $('#aiBtn').onclick = () => { mode = 1 - mode; draw(); }; draw();
})();

/* ---------- 結業測驗 ---------- */
(() => {
  const root = $('#quiz');
  const Q = [
    ['白光穿過三稜鏡後，被拆成的那條彩色光帶叫做什麼？', ['光譜', '光圈', '光年', '光暈'], 0, '依波長排開的光，就是光譜。'],
    ['可見光裡，哪一種顏色的波長最長？', ['紫光', '綠光', '紅光', '藍光'], 2, '紅光約 700 奈米最長，紫光約 400 奈米最短。'],
    ['葉子看起來是綠色，是因為……', ['葉子自己會發出綠光', '綠光被葉子吸收了', '綠光沒被吸收、反射到眼睛', '葉子把所有的光都吸收'], 2, '你看到的顏色＝沒被吃掉的光。'],
    ['同一種有色溶液，濃度變成 2 倍，吸光度會？', ['不變', '變成 2 倍', '變成一半', '變成 0'], 1, '比爾定律：吸光度和濃度成正比。'],
    ['用薑黃素檢驗硼砂，呈色後要量哪個波長的吸光度？', ['250 奈米', '550 奈米', '960 奈米', '1745 奈米'], 1, '玫瑰紅色的產物在 550 奈米吸收最強。'],
    ['檢量線是「吸光度 ＝ 0.095 × 濃度」。量到吸光度 0.380，濃度是？', ['2.0 µg/mL', '3.6 µg/mL', '4.0 µg/mL', '8.0 µg/mL'], 2, '0.380 ÷ 0.095 ＝ 4.0。'],
    ['紅外光譜和拉曼光譜被稱為「分子指紋」，是因為……', ['分子表面有紋路', '每種化學鍵有專屬的振動頻率', '所有分子的光譜都一樣', '光譜是用手指按出來的'], 1, '不同的鍵 → 不同的峰 → 排起來像指紋。'],
    ['奶粉的拉曼光譜在 676 的位置多了一個峰，最可能是摻了？', ['澱粉', '乳糖', '三聚氰胺', '食鹽'], 2, '676 是三聚氰胺的特徵峰。'],
    ['XRF 能譜裡，峰的「位置」告訴我們什麼？', ['樣品的重量', '含有哪一種元素', '樣品的顏色', '樣品的溫度'], 1, '位置＝元素身分；高度＝含量。'],
    ['用手持近紅外光譜儀檢查雞蛋新鮮度，最大的優點是？', ['可以順便把蛋煮熟', '不用打破蛋殼', '可以改變蛋的顏色', '可以讓蛋變新鮮'], 1, '快速、非破壞，是光譜分析的最大優勢。']
  ];
  let i, score, done;
  function start() { i = 0; score = 0; draw(); }
  function draw() {
    if (i >= Q.length) {
      const pct = score * 10; award('quiz', score, Q.length);
      root.innerHTML = `<div class="card itemcard"><div class="badge">${pct >= 90 ? '🏅' : pct >= 60 ? '🎓' : '📚'}</div>${pct} 分<small>${pct >= 90 ? '恭喜獲得「首席光譜偵探」徽章！' : pct >= 60 ? '合格！你已經是正式探員。' : '還差一點，回頭看看動畫再挑戰一次。'}</small></div><div class="row" style="margin-top:12px;justify-content:center"><button class="btn primary" data-k="again">↺ 重新測驗</button></div>`;
      $('[data-k=again]', root).onclick = start; return;
    }
    const q = Q[i]; done = false;
    root.innerHTML = `<div class="ghead"><span class="pill a">第 ${i + 1} / ${Q.length} 題</span><span class="score">目前 ${score * 10} 分</span></div>
      <div class="card"><p class="h2" style="margin:0;font-size:var(--t2)">${esc(q[0])}</p></div>
      <div class="qopt">${q[1].map((o, k) => `<button class="btn" data-b="${k}">${'ABCD'[k]}．${esc(o)}</button>`).join('')}</div>
      <div class="row" style="justify-content:space-between"><div class="fb"></div><button class="btn primary" data-k="next" style="visibility:hidden">${i === Q.length - 1 ? '看成績 →' : '下一題 →'}</button></div>`;
    $$('[data-b]', root).forEach(b => b.onclick = () => {
      if (done) return; done = true; const ok = +b.dataset.b === q[2]; if (ok) score++;
      b.classList.add(ok ? 'ok' : 'bad'); if (!ok) $(`[data-b="${q[2]}"]`, root).classList.add('ok'); $$('[data-b]', root).forEach(x => x.disabled = true);
      const fb = $('.fb', root); fb.className = 'fb ' + (ok ? 'ok' : 'bad'); fb.textContent = (ok ? '✔ 答對了！' : '✘ 答錯了。') + q[3];
      $('.score', root).textContent = `目前 ${score * 10} 分`; $('[data-k=next]', root).style.visibility = 'visible';
    });
    $('[data-k=next]', root).onclick = () => { i++; draw(); };
  }
  start();
})();

/* ---------- boot ---------- */
const h = parseInt(location.hash.slice(1), 10);
go(h >= 1 && h <= slides.length ? h - 1 : 0);
window.addEventListener('hashchange', () => { const k = parseInt(location.hash.slice(1), 10); if (k >= 1 && k <= slides.length && k - 1 !== cur) go(k - 1); });
})();
