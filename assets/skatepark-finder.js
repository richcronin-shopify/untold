(() => {
  const root = document.querySelector('[data-skateparks-index]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = 'true';

  const MIN_CHARS = 2;
  const LOADING_DELAY = 300;
  const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
  const CLUSTER = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/';

  const TYPE_GROUPS = {
    track: ['BMX Track / Dirt Jumps', 'Skatepark & Pump / BMX Track'],
    skatepark: ['Skatepark', 'Street Plaza', 'Bowl / Pool', 'Mini Ramp', 'Multi-Sport Action Park', 'Skatepark & Pump / BMX Track'],
    plaza: ['Street Plaza'],
    pump: ['Pump Track', 'Skatepark & Pump / BMX Track']
  };
  const TYPE_GROUP_LABELS = {
    track: 'Track/Dirt jumps',
    skatepark: 'Skatepark',
    plaza: 'Street Plaza',
    pump: 'Pump track'
  };
  const FEATURE_LABELS = {
    dirt_jumps: 'Dirt jumps',
    trails: 'Trails',
    bowls: 'Bowls',
    ramps: 'Ramps',
    boxes: 'Boxes',
    plaza: 'Plaza'
  };

  const perPage = parseInt(root.dataset.perPage, 10) || 24;
  const placeholder = root.dataset.placeholder || '';
  const loggedIn = root.dataset.loggedIn === 'true';
  const endpoint = (root.dataset.endpoint || '/apps/parks').replace(/\/$/, '');
  const loginUrl = root.dataset.loginUrl || '/account/login';
  const registerUrl = root.dataset.registerUrl || '/account/register';
  const favourites = new Set(
    (root.dataset.favourites || '').split(',').map((s) => s.trim()).filter(Boolean)
  );

  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => [...root.querySelectorAll(sel)];
  const q = $('[data-sp-q]');
  const regionSel = $('[data-sp-region]');
  const countySel = $('[data-sp-county]');
  const typeSel = $('[data-sp-type]');
  const settingSel = $('[data-sp-setting]');
  const sortSel = $('[data-sp-sort]');
  const reset = $('[data-sp-reset]');
  const status = $('[data-sp-status]');
  const countEl = $('[data-sp-count]');
  const chips = $('[data-sp-chips]');
  const results = $('[data-sp-results]');
  const grid = $('[data-sp-results-grid]');
  const more = $('[data-sp-more]');
  const server = $('[data-sp-server]');
  const list = $('[data-sp-list]');
  const mapWrap = $('[data-sp-map-wrap]');
  const mapEl = $('[data-sp-map]');
  const viewBtns = $$('[data-sp-view]');
  const searchBtn = $('[data-sp-search]');
  const resultsAnchor = $('[data-sp-results-anchor]');
  const modal = $('[data-sp-auth-modal]');
  const stats = {
    total: $('[data-sp-stat="total"]'),
    regions: $('[data-sp-stat="regions"]'),
    types: $('[data-sp-stat="types"]'),
    outdoor: $('[data-sp-stat="outdoor"]')
  };

  let data = null;
  let loading = null;
  let matches = [];
  let shown = 0;
  let viewMode = 'list';
  let map = null;
  let cluster = null;
  let leafletLoading = null;
  let applySeq = 0;
  let typeGroup = '';
  let userLocation = null;
  let sortMode = 'az';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const uniqSorted = (arr) => [...new Set(arr.map(tidy).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en-GB'));
  const options = (all, items) => '<option value="">' + all + '</option>' + items.map((v) => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
  const settingLabel = (s) => (s === 'Covered / Undercover' ? 'Covered' : s || '');
  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const feedUrl = (page, param) => {
    const u = new URL(window.location.pathname, window.location.origin);
    u.searchParams.set('view', 'skateparks-data');
    if (page > 1) u.searchParams.set(param || 'page', page);
    const t = window.Shopify && window.Shopify.theme;
    if (t && t.role && t.role !== 'main' && t.id) u.searchParams.set('preview_theme_id', t.id);
    return u.toString();
  };

  const rebuildSelect = (sel, all, items) => {
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = options(all, items);
    sel.value = items.includes(current) ? current : '';
  };

  const load = () => {
    if (data) return Promise.resolve(data);
    if (loading) return loading;
    const getPage = (n, param) => fetch(feedUrl(n, param), { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new Error('Feed ' + r.status);
      return r.json();
    });
    loading = getPage(1).then((first) => {
      const rest = [];
      for (let n = 2; n <= first.pages; n++) rest.push(getPage(n, first.param));
      return Promise.all(rest).then((pages) => {
        data = first.items.concat(...pages.map((p) => p.items));
        data.forEach((p) => {
          p.y = tidy(p.y);
          p.s = tidy(p.s);
          p.r = tidy(p.r);
          p.c = tidy(p.c);
          p.f = tidy(p.f);
          p.h = tidy(p.h);
          p._s = norm([p.n, p.t, p.c, p.r, p.y, p.s, p.p, (p.p || '').replace(/\s/g, '')].join(' '));
        });
        data.sort((a, b) => a.n.localeCompare(b.n, 'en-GB'));
        rebuildSelect(regionSel, 'All regions', uniqSorted(data.map((p) => p.r)));
        rebuildSelect(typeSel, 'All park types', uniqSorted(data.map((p) => p.y)));
        rebuildSelect(settingSel, 'All settings', uniqSorted(data.map((p) => p.s)));
        renderStats(data);
        return data;
      });
    }).catch((e) => {
      loading = null;
      throw e;
    });
    return loading;
  };

  const withLoading = (promise) => {
    if (data) return promise;
    let shownMsg = false;
    const timer = setTimeout(() => {
      shownMsg = true;
      if (status) status.textContent = 'Loading parks…';
    }, LOADING_DELAY);
    return promise.finally(() => {
      clearTimeout(timer);
      if (shownMsg && status && status.textContent === 'Loading parks…') status.textContent = '';
    });
  };

  const fillCounties = () => {
    if (!data || !countySel) return;
    const r = regionSel.value;
    const current = countySel.value;
    const counties = uniqSorted(data.filter((p) => !r || p.r === r).map((p) => p.c));
    countySel.innerHTML = options('All counties', counties);
    countySel.value = counties.includes(current) ? current : '';
    countySel.disabled = counties.length === 0;
  };

  const term = () => {
    const t = norm(q && q.value);
    return t.length >= MIN_CHARS ? t : '';
  };

  const filtersActive = () => !!(term() || (regionSel && regionSel.value) || (countySel && countySel.value) || (typeSel && typeSel.value) || (settingSel && settingSel.value) || typeGroup);

  const updateUrl = () => {
    const u = new URL(window.location.href);
    ['q', 'region', 'county', 'type', 'type_group', 'setting', 'view_mode', 'sort'].forEach((k) => u.searchParams.delete(k));
    if (term()) u.searchParams.set('q', q.value.trim());
    if (regionSel.value) u.searchParams.set('region', regionSel.value);
    if (countySel.value) u.searchParams.set('county', countySel.value);
    if (typeSel.value) u.searchParams.set('type', typeSel.value);
    if (typeGroup) u.searchParams.set('type_group', typeGroup);
    if (settingSel.value) u.searchParams.set('setting', settingSel.value);
    if (viewMode === 'map') u.searchParams.set('view_mode', 'map');
    if (sortMode && sortMode !== 'az') u.searchParams.set('sort', sortMode);
    history.replaceState(null, '', u.toString());
  };

  const computeMatches = () => {
    const words = term().split(' ').filter(Boolean);
    const r = regionSel.value;
    const c = countySel.value;
    const y = typeSel.value;
    const s = settingSel.value;
    const groupTypes = typeGroup ? TYPE_GROUPS[typeGroup] : null;
    let list = data.filter((p) =>
      (!r || p.r === r) &&
      (!c || p.c === c) &&
      (!y || p.y === y) &&
      (!groupTypes || groupTypes.includes(p.y)) &&
      (!s || p.s === s) &&
      words.every((w) => p._s.includes(w))
    );
    if (sortMode === 'za') {
      list = list.slice().sort((a, b) => b.n.localeCompare(a.n, 'en-GB'));
    } else if (sortMode === 'near' && userLocation) {
      list = list.slice().sort((a, b) => dist(userLocation, a) - dist(userLocation, b));
    } else {
      list = list.slice().sort((a, b) => a.n.localeCompare(b.n, 'en-GB'));
    }
    return list;
  };

  const dist = (origin, p) => {
    const lat = parseFloat(p.a);
    const lng = parseFloat(p.o);
    if (!isFinite(lat) || !isFinite(lng)) return Infinity;
    const toRad = Math.PI / 180;
    const dLat = (lat - origin.lat) * toRad;
    const dLng = (lng - origin.lng) * toRad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(origin.lat * toRad) * Math.cos(lat * toRad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  };

  const countText = (n) => n.toLocaleString('en-GB') + (n === 1 ? ' park' : ' parks');

  const renderStats = (set) => {
    if (!set) return;
    const fmt = (n) => n.toLocaleString('en-GB');
    if (stats.total) stats.total.textContent = fmt(set.length);
    if (stats.regions) stats.regions.textContent = fmt(uniqSorted(set.map((p) => p.r)).length);
    if (stats.types) stats.types.textContent = fmt(uniqSorted(set.map((p) => p.y)).length);
    if (stats.outdoor) stats.outdoor.textContent = fmt(set.filter((p) => p.s === 'Outdoor').length);
  };

  const arrowIcon = ($('[data-sp-arrow-icon]') && $('[data-sp-arrow-icon]').innerHTML) || '→';

  const featureItems = (p) => {
    const keys = String(p.f || '').split(',').map(tidy).filter(Boolean).slice(0, 2);
    const items = keys.map((key) => ({ key, label: FEATURE_LABELS[key] || key }));
    if (p.s) items.push({ key: 'setting-' + slug(p.s), label: settingLabel(p.s) });
    return items;
  };

  const card = (p, i) => {
    const meta = esc(p.t || '') + (p.c && p.c !== p.t ? ', ' + esc(p.c) : '');
    const img = p.i
      ? '<img src="' + esc(p.i) + '" alt="" loading="' + (i < 4 ? 'eager' : 'lazy') + '" decoding="async" width="640" height="400" referrerpolicy="no-referrer" class="skatepark-card__image">'
      : placeholder
        ? '<img src="' + esc(placeholder) + '" alt="" loading="' + (i < 4 ? 'eager' : 'lazy') + '" decoding="async" width="640" height="400" class="skatepark-card__image skatepark-card__image--placeholder">'
        : '<span class="skatepark-card__placeholder" aria-hidden="true">' + esc((p.n || '?').charAt(0)) + '</span>';
    const fav = p.h && favourites.has(p.h);
    const bookmark = p.h
      ? '<button type="button" class="skatepark-card__bookmark" data-sp-bookmark data-park-handle="' + esc(p.h) + '" aria-pressed="' + (fav ? 'true' : 'false') + '" aria-label="' + (fav ? 'Remove ' : 'Save ') + esc(p.n) + (fav ? ' from favourites' : ' to favourites') + '">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
        '<path class="skatepark-card__bookmark-off" d="M7 3.5h10A1.5 1.5 0 0 1 18.5 5v16L12 17.5 5.5 21V5A1.5 1.5 0 0 1 7 3.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
        '<path class="skatepark-card__bookmark-on" d="M7 3.5h10A1.5 1.5 0 0 1 18.5 5v16L12 17.5 5.5 21V5A1.5 1.5 0 0 1 7 3.5z" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
        '</svg></button>'
      : '';
    const feats = featureItems(p).map((f) =>
      '<li class="skatepark-card__feature" data-feature="' + esc(f.key) + '"><span class="skatepark-card__feature-icon" aria-hidden="true"></span><span>' + esc(f.label) + '</span></li>'
    ).join('');
    return '<article class="skatepark-card"' + (p.h ? ' data-park-handle="' + esc(p.h) + '"' : '') + '>' +
      '<div class="skatepark-card__media">' +
        '<a href="' + esc(p.u) + '" class="skatepark-card__media-link" tabindex="-1" aria-hidden="true">' + img + '</a>' +
        (p.y ? '<span class="skatepark-card__badge">' + esc(p.y) + '</span>' : '') +
        (p.e ? '<span class="skatepark-card__events">Upcoming events</span>' : '') +
        bookmark +
      '</div>' +
      '<div class="skatepark-card__body">' +
        '<h3 class="skatepark-card__title"><a href="' + esc(p.u) + '">' + esc(p.n) + '</a></h3>' +
        '<p class="skatepark-card__meta">' + meta + '</p>' +
        (p.r ? '<p class="skatepark-card__region">' + esc(p.r) + '</p>' : '') +
        (feats ? '<ul class="skatepark-card__features" role="list">' + feats + '</ul>' : '') +
        '<a href="' + esc(p.u) + '" class="skatepark-card__arrow" aria-label="View ' + esc(p.n) + '">' + arrowIcon + '</a>' +
      '</div></article>';
  };

  const renderMore = () => {
    const next = matches.slice(shown, shown + perPage);
    grid.insertAdjacentHTML('beforeend', next.map((p, i) => card(p, shown + i)).join(''));
    shown += next.length;
    if (more) more.hidden = shown >= matches.length;
  };

  const renderList = () => {
    if (server) server.hidden = true;
    if (results) results.hidden = false;
    grid.innerHTML = '';
    shown = 0;
    renderMore();
  };

  const renderChips = () => {
    if (!chips) return;
    const items = [];
    if (term()) items.push({ key: 'q', label: q.value.trim() });
    if (regionSel.value) items.push({ key: 'region', label: regionSel.value });
    if (countySel.value) items.push({ key: 'county', label: countySel.value });
    if (typeGroup) items.push({ key: 'type_group', label: TYPE_GROUP_LABELS[typeGroup] || typeGroup });
    if (typeSel.value) items.push({ key: 'type', label: typeSel.value });
    if (settingSel.value) items.push({ key: 'setting', label: settingSel.value });
    chips.innerHTML = items.map((item) =>
      '<button type="button" class="skateparks-index__chip" data-sp-chip="' + esc(item.key) + '">' +
        esc(item.label) + ' <span aria-hidden="true">×</span><span class="visually-hidden">Remove ' + esc(item.label) + ' filter</span>' +
      '</button>'
    ).join('');
    if (reset) reset.hidden = items.length === 0;
  };

  const syncPills = () => {
    $$('[data-sp-region-pill]').forEach((btn) => {
      const on = (btn.dataset.spRegionPill || '') === (regionSel.value || '');
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('[data-sp-type-pill]').forEach((btn) => {
      const val = btn.dataset.spTypePill || '';
      const on = val === (typeGroup || '');
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  const addCss = (href) => new Promise((resolve) => {
    if (document.querySelector('link[href="' + href + '"]')) return resolve();
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.onload = resolve; l.onerror = resolve;
    document.head.appendChild(l);
  });
  const addJs = (src) => new Promise((resolve, reject) => {
    if (document.querySelector('script[src="' + src + '"]')) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });

  const loadLeaflet = () => {
    if (window.L && window.L.markerClusterGroup) return Promise.resolve();
    if (leafletLoading) return leafletLoading;
    leafletLoading = Promise.all([
      addCss(LEAFLET + 'leaflet.css'),
      addCss(CLUSTER + 'MarkerCluster.css'),
      addCss(CLUSTER + 'MarkerCluster.Default.css')
    ]).then(() => addJs(LEAFLET + 'leaflet.js')).then(() => addJs(CLUSTER + 'leaflet.markercluster.js'));
    return leafletLoading;
  };

  const popupHtml = (p) => {
    const place = esc(p.t || '') + (p.c && p.c !== p.t ? ', ' + esc(p.c) : '');
    return '<div class="skatepark-popup"><strong class="skatepark-popup__title">' + esc(p.n) + '</strong>' +
      (place ? '<span class="skatepark-popup__place">' + place + '</span>' : '') +
      (p.y ? '<span class="skatepark-popup__type">' + esc(p.y) + '</span>' : '') +
      '<a class="skatepark-popup__link" href="' + esc(p.u) + '">View park →</a></div>';
  };

  const renderMap = () => {
    if (!map || !data) return;
    const L = window.L;
    const set = matches;
    cluster.clearLayers();
    const markers = [];
    set.forEach((p) => {
      const lat = parseFloat(p.a);
      const lng = parseFloat(p.o);
      if (!isFinite(lat) || !isFinite(lng)) return;
      const m = L.marker([lat, lng], { title: p.n, alt: p.n });
      m.bindPopup(() => popupHtml(p));
      markers.push(m);
    });
    cluster.addLayers(markers);
    if (markers.length === 1) {
      map.setView(markers[0].getLatLng(), 14);
    } else if (markers.length > 1) {
      map.fitBounds(cluster.getBounds(), { padding: [30, 30], maxZoom: 14 });
    }
  };

  const ensureMap = () => {
    if (map) return Promise.resolve();
    return loadLeaflet().then(() => {
      if (map) return;
      const L = window.L;
      map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: true }).setView([54.5, -3], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }).addTo(map);
      cluster = L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 50 });
      map.addLayer(cluster);
      map.on('focus', () => map.scrollWheelZoom.enable());
      map.on('blur', () => map.scrollWheelZoom.disable());
    });
  };

  const setView = (mode, opts) => {
    viewMode = mode === 'map' ? 'map' : 'list';
    viewBtns.forEach((b) => {
      const on = b.dataset.spView === viewMode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (list) list.hidden = viewMode === 'map';
    if (mapWrap) mapWrap.hidden = viewMode !== 'map';
    if (!(opts && opts.silent)) updateUrl();
    if (viewMode === 'map') {
      withLoading(Promise.all([load(), ensureMap()])).then(() => {
        map.invalidateSize();
        apply({ keepUrl: true });
      }).catch(() => { if (status) status.textContent = 'Sorry, the map is unavailable right now.'; });
    } else {
      apply({ keepUrl: true });
    }
  };

  const apply = (opts) => {
    const seq = ++applySeq;
    if (!(opts && opts.keepUrl)) updateUrl();
    syncPills();
    renderChips();

    withLoading(load()).then(() => {
      if (seq !== applySeq) return;
      fillCounties();
      matches = computeMatches();
      const label = countText(matches.length);
      if (countEl) countEl.textContent = label;
      if (status) status.textContent = filtersActive() ? label + ' found' : '';
      if (viewMode === 'map') renderMap();
      else renderList();
    }).catch(() => {
      if (seq === applySeq && status) status.textContent = 'Sorry, the park search is unavailable right now.';
    });
  };

  const clearFilter = (key) => {
    if (key === 'q' && q) { q.value = ''; lastTerm = ''; }
    if (key === 'region' && regionSel) { regionSel.value = ''; if (countySel) { countySel.value = ''; countySel.disabled = true; } }
    if (key === 'county' && countySel) countySel.value = '';
    if (key === 'type' && typeSel) typeSel.value = '';
    if (key === 'type_group') typeGroup = '';
    if (key === 'setting' && settingSel) settingSel.value = '';
    apply();
  };

  const clearAll = () => {
    if (q) q.value = '';
    lastTerm = '';
    if (regionSel) regionSel.value = '';
    if (countySel) { countySel.value = ''; countySel.disabled = true; }
    if (typeSel) typeSel.value = '';
    if (settingSel) settingSel.value = '';
    typeGroup = '';
    apply();
  };

  const scrollToResults = () => {
    if (!resultsAnchor) return;
    resultsAnchor.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  const requestNearMe = () => {
    if (!navigator.geolocation) {
      if (status) status.textContent = 'Location is not available in this browser.';
      sortMode = 'az';
      if (sortSel) sortSel.value = 'az';
      apply();
      return;
    }
    if (status) status.textContent = 'Finding parks near you…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        apply();
      },
      () => {
        if (status) status.textContent = 'Location permission was denied. Showing A–Z instead.';
        sortMode = 'az';
        if (sortSel) sortSel.value = 'az';
        apply();
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  const returnUrl = () => `${location.pathname}${location.search}`;

  const authHref = (base) => {
    const url = new URL(base, location.origin);
    url.searchParams.set('return_url', returnUrl());
    url.searchParams.set('return_to', location.href);
    return url.toString();
  };

  const openAuthModal = () => {
    if (!modal) {
      location.assign(authHref(registerUrl));
      return;
    }
    const reg = modal.querySelector('[data-sp-auth-register]');
    const log = modal.querySelector('[data-sp-auth-login]');
    if (reg) reg.setAttribute('href', authHref(registerUrl));
    if (log) log.setAttribute('href', authHref(loginUrl));
    modal.hidden = false;
    modal.classList.add('is-open');
    const closeBtn = modal.querySelector('[data-sp-auth-close]');
    if (closeBtn) closeBtn.focus();
    else if (reg) reg.focus();
    document.body.style.overflow = 'hidden';
  };

  const closeAuthModal = () => {
    if (!modal) return;
    modal.hidden = true;
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  };

  const bookmarkLabel = (btn, pressed) => {
    const title = (btn.closest('.skatepark-card') && btn.closest('.skatepark-card').querySelector('.skatepark-card__title'))
      ? btn.closest('.skatepark-card').querySelector('.skatepark-card__title').textContent.trim()
      : 'this park';
    return (pressed ? 'Remove ' : 'Save ') + title + (pressed ? ' from favourites' : ' to favourites');
  };

  const setBookmarkState = (handle, pressed) => {
    if (pressed) favourites.add(handle);
    else favourites.delete(handle);
    $$('[data-sp-bookmark][data-park-handle="' + handle + '"]').forEach((btn) => {
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      btn.setAttribute('aria-label', bookmarkLabel(btn, pressed));
    });
  };

  const toggleFavourite = async (button) => {
    const handle = button.dataset.parkHandle;
    if (!handle) return;
    if (!loggedIn) {
      openAuthModal();
      return;
    }
    if (button.disabled) return;
    const previous = button.getAttribute('aria-pressed') === 'true';
    setBookmarkState(handle, !previous);
    button.disabled = true;
    try {
      const response = await fetch(`${endpoint}/favourite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ handle }),
        cache: 'no-store'
      });
      let body = null;
      try { body = await response.json(); } catch { body = null; }
      if (body && body.code === 'login_required') {
        setBookmarkState(handle, previous);
        openAuthModal();
        return;
      }
      if (!response.ok || !body || body.ok === false) {
        setBookmarkState(handle, previous);
        return;
      }
      setBookmarkState(handle, Boolean(body.favourite));
    } catch {
      setBookmarkState(handle, previous);
    } finally {
      button.disabled = false;
    }
  };

  /* Events */
  let timer;
  let lastTerm = '';
  if (q) {
    q.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const t = term();
        if (t === lastTerm && !filtersActive()) return;
        lastTerm = t;
        apply();
      }, 250);
    });
  }
  if (regionSel) regionSel.addEventListener('change', () => { if (countySel) countySel.value = ''; apply(); });
  if (countySel) countySel.addEventListener('change', () => apply());
  if (typeSel) typeSel.addEventListener('change', () => { typeGroup = ''; apply(); });
  if (settingSel) settingSel.addEventListener('change', () => apply());
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      sortMode = sortSel.value || 'az';
      if (sortMode === 'near' && !userLocation) requestNearMe();
      else apply();
    });
  }
  if (more) more.addEventListener('click', renderMore);
  if (reset) reset.addEventListener('click', clearAll);
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      apply();
      scrollToResults();
    });
  }
  const form = $('[data-sp-form]');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      apply();
      scrollToResults();
    });
  }
  viewBtns.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.spView !== viewMode) setView(b.dataset.spView);
  }));

  $$('[data-sp-region-pill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (regionSel) regionSel.value = btn.dataset.spRegionPill || '';
      if (countySel) { countySel.value = ''; }
      apply();
      scrollToResults();
    });
  });
  const moreRegions = $('[data-sp-region-more]');
  const restRegions = $('[data-sp-region-rest]');
  if (moreRegions && restRegions) {
    moreRegions.addEventListener('click', () => {
      const expanded = restRegions.hidden !== false ? false : true;
      const next = !expanded;
      restRegions.hidden = !next;
      moreRegions.setAttribute('aria-expanded', next ? 'true' : 'false');
      const n = moreRegions.dataset.count || '';
      moreRegions.textContent = next ? 'Show less' : ('+' + n);
    });
  }
  $$('[data-sp-type-pill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      typeGroup = btn.dataset.spTypePill || '';
      if (typeSel) typeSel.value = '';
      apply();
      scrollToResults();
    });
  });

  if (chips) {
    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sp-chip]');
      if (btn) clearFilter(btn.dataset.spChip);
    });
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sp-bookmark]');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      toggleFavourite(btn);
    }
  });

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-sp-auth-close]')) closeAuthModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeAuthModal();
    });
  }

  /* Popular carousel */
  const swiperEl = $('[data-sp-popular-swiper]');
  const initPopular = () => {
    if (!swiperEl || typeof Swiper === 'undefined') return;
    if (swiperEl.swiper) return;
    const prev = $('[data-sp-popular] .swiper-slider__arrow--prev');
    const next = $('[data-sp-popular] .swiper-slider__arrow--next');
    new Swiper(swiperEl, {
      slidesPerView: 1.15,
      spaceBetween: 16,
      watchOverflow: true,
      navigation: prev && next ? { prevEl: prev, nextEl: next } : false,
      breakpoints: {
        750: { slidesPerView: 2, spaceBetween: 16 },
        990: { slidesPerView: 3, spaceBetween: 20 }
      },
      a11y: {
        enabled: true,
        prevSlideMessage: 'Previous parks',
        nextSlideMessage: 'Next parks',
        paginationBulletMessage: 'Go to park group'
      }
    });
  };

  /* Initial state from URL */
  const params = new URLSearchParams(window.location.search);
  const ensureOption = (sel, v) => {
    if (!sel) return;
    if (v && ![...sel.options].some((o) => o.value === v)) sel.insertAdjacentHTML('beforeend', '<option value="' + esc(v) + '">' + esc(v) + '</option>');
    sel.value = v || '';
  };
  if (q) q.value = params.get('q') || '';
  lastTerm = term();
  ensureOption(regionSel, params.get('region'));
  ensureOption(typeSel, params.get('type'));
  ensureOption(settingSel, params.get('setting'));
  const initialCounty = params.get('county') || '';
  const initialMode = params.get('view_mode') === 'map' ? 'map' : 'list';
  const initialGroup = params.get('type_group') || '';
  if (initialGroup && TYPE_GROUPS[initialGroup] && !params.get('type')) typeGroup = initialGroup;
  sortMode = params.get('sort') || 'az';
  if (sortSel) sortSel.value = sortMode === 'near' ? 'near' : (sortMode === 'za' ? 'za' : 'az');

  const start = () => {
    if (sortMode === 'near') requestNearMe();
    else setView(initialMode, { silent: true });
  };

  if (initialCounty) {
    withLoading(load()).then(() => {
      if (regionSel) regionSel.value = params.get('region') || '';
      if (typeSel) typeSel.value = params.get('type') || '';
      if (settingSel) settingSel.value = params.get('setting') || '';
      fillCounties();
      if (countySel) countySel.value = initialCounty;
      start();
    }).catch(() => { if (status) status.textContent = 'Sorry, the park search is unavailable right now.'; });
  } else {
    start();
  }

  const prefetch = () => { load().then(() => { if (!filtersActive() && viewMode === 'list') apply({ keepUrl: true }); }).catch(() => {}); };
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  if (document.readyState === 'complete') idle(prefetch, { timeout: 4000 });
  else window.addEventListener('load', () => idle(prefetch, { timeout: 4000 }), { once: true });

  const startPopular = () => initPopular();
  if (typeof Swiper !== 'undefined') startPopular();
  else window.addEventListener('load', startPopular);

  document.addEventListener('shopify:section:load', (e) => {
    if (e.target && e.target.contains(root)) initPopular();
  });
})();
