// Token Launch Radar page: sort, filter and detail, no network, no fetch.
// Rows are arrays: [rank, slug, name, category, chains, tvl, chg7d, age, implied, catMult,
// growthMult, maturityMult, chainMult, [step, step, step], watchlist_flag].
// Live rows are [slug, name, category, tvl, mcap, chg7d].
(function () {
  var D = window.RADAR;
  var rows = D.rows.map(function (a) {
    return {
      rank: a[0], slug: a[1], name: a[2], cat: a[3], chains: a[4], tvl: a[5],
      chg: a[6], age: a[7], val: a[8], catMult: a[9], growthMult: a[10],
      matMult: a[11], chainMult: a[12], steps: a[13], watch: a[14] === 1,
    };
  });
  var live = D.live.map(function (a) {
    return { slug: a[0], name: a[1], cat: a[2], tvl: a[3], mcap: a[4], chg: a[5] };
  });

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function age(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 365) return (n / 365).toFixed(1) + 'y';
    return n + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var qEl = document.getElementById('q');
  var catEl = document.getElementById('cat');
  var chainEl = document.getElementById('chain');
  var watchEl = document.getElementById('watch');
  var sortEl = document.getElementById('sort');
  var rowsEl = document.getElementById('rows');
  var countEl = document.getElementById('count');
  var detailEl = document.getElementById('detail');
  var sel = null;

  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (r.cat && cats.indexOf(r.cat) < 0) cats.push(r.cat);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort();
  chains.sort();
  cats.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; catEl.appendChild(o); });
  chains.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; chainEl.appendChild(o); });

  document.getElementById('meta').innerHTML =
    '<b>' + D.board + '</b> ranked rows &nbsp;·&nbsp; <b>' + D.watch + '</b> watchlist<br>' +
    '<b>' + D.early + '</b> early finds below the floor &nbsp;·&nbsp; <b>' + D.live_n + '</b> already trading';
  document.getElementById('model-line').textContent =
    'Model ' + D.model + ': category multiple from live comparables (global median ' + D.global.toFixed(3) +
    ' when a category has under 3) · floor $' + (D.floor / 1e6).toFixed(0) + 'M · snapshot ' + D.as_of + '.';
  document.getElementById('asof').textContent = D.as_of;
  document.getElementById('board-foot').textContent =
    'Every row records no token. Ranks are by implied value, highest first; the page may sort the same rows another way.';

  function filtered() {
    var q = qEl.value.trim().toLowerCase();
    var cat = catEl.value;
    var chain = chainEl.value;
    var watch = watchEl.checked;
    var list = rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (cat && r.cat !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (watch && !r.watch) return false;
      return true;
    });
    var k = sortEl.value;
    var key = k === 'value' ? 'val' : k === 'tvl' ? 'tvl' : k === 'chg' ? 'chg' : 'age';
    list.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return bv - av || a.rank - b.rank;
    });
    return list;
  }

  function render() {
    var list = filtered();
    countEl.textContent = list.length + ' of ' + rows.length + ' rows';
    rowsEl.innerHTML = list.map(function (r) {
      var cls = r.chg === null ? '' : r.chg >= 0 ? 'up' : 'down';
      return '<tr data-slug="' + esc(r.slug) + '"' + (sel === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + (r.watch ? ' · watchlist' : '') + '</span></td>' +
        '<td><span class="tag">' + esc(r.cat || '—') + '</span></td>' +
        '<td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + money(r.tvl) + '</td>' +
        '<td class="num ' + cls + '">' + pct(r.chg) + '</td>' +
        '<td class="num">' + age(r.age) + '</td>' +
        '<td class="num val">' + money(r.val) + '</td></tr>';
    }).join('');
  }

  function showDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) r = rows[i];
    if (!r) { detailEl.hidden = true; sel = null; return; }
    sel = slug;
    var base = Math.round(r.tvl * r.catMult);
    detailEl.innerHTML =
      '<h2>#' + r.rank + ' — ' + esc(r.name) + '</h2>' +
      '<p class="sub2">' + esc(r.slug) + ' · ' + esc(r.cat || 'no category') + ' · ' + esc(r.chains.join(', ')) +
      ' · records no token · listed ' + (r.age === null ? 'date unknown' : r.age + ' days ago') + '</p>' +
      '<div class="grid">' +
      '<div class="stat"><span>Implied value</span><b>' + money(r.val) + '</b></div>' +
      '<div class="stat"><span>TVL</span><b>' + money(r.tvl) + '</b></div>' +
      '<div class="stat"><span>7-day change</span><b>' + pct(r.chg) + '</b></div>' +
      '<div class="stat"><span>Category multiple</span><b>' + r.catMult.toFixed(3) + 'x</b></div>' +
      '</div>' +
      '<p class="muted">Model: ' + money(r.tvl) + ' TVL &times; ' + r.catMult.toFixed(3) + ' category multiple = ' + money(base) +
      ' base, &times; ' + r.growthMult.toFixed(2) + ' growth &times; ' + r.matMult.toFixed(2) + ' maturity &times; ' +
      r.chainMult.toFixed(2) + ' chains = <b>' + money(r.val) + '</b>.</p>' +
      '<h2>How to farm it</h2><ol>' +
      r.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol>';
    detailEl.hidden = false;
  }

  rowsEl.addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (!tr) return;
    showDetail(tr.getAttribute('data-slug'));
    render();
    detailEl.scrollIntoView({ block: 'nearest' });
  });

  var sortMap = { rank: 'value', name: 'value', cat: 'value', chain: 'value', tvl: 'tvl', chg: 'chg', age: 'age', val: 'value' };
  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      sortEl.value = sortMap[th.getAttribute('data-k')] || 'value';
      render();
    });
  });

  [qEl, catEl, chainEl, watchEl, sortEl].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  var liveEl = document.getElementById('live-rows');
  liveEl.innerHTML = live.map(function (r) {
    var cls = r.chg === null ? '' : r.chg >= 0 ? 'up' : 'down';
    return '<tr><td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + '</span></td>' +
      '<td><span class="tag">' + esc(r.cat || '—') + '</span></td>' +
      '<td class="num">' + money(r.tvl) + '</td>' +
      '<td class="num">' + money(r.mcap) + '</td>' +
      '<td class="num ' + cls + '">' + pct(r.chg) + '</td></tr>';
  }).join('');

  // Deep links: ?detail=<slug>, ?cat=<category>, ?watch=1, ?q=<text>, ?sort=<key>.
  var params = new URLSearchParams(window.location.search);
  if (params.get('q')) qEl.value = params.get('q');
  if (params.get('cat')) catEl.value = params.get('cat');
  if (params.get('chain')) chainEl.value = params.get('chain');
  if (params.get('watch') === '1') watchEl.checked = true;
  if (params.get('sort')) sortEl.value = params.get('sort');
  render();
  if (params.get('detail')) showDetail(params.get('detail'));
})();
