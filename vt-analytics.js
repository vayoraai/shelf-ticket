/* Vayora Tickets — privacy-first analytics and campaign attribution.
 * Shared by vayora.au and tickets.vayora.au (keep both copies identical).
 *
 * - Google Analytics 4 loads ONLY after the visitor clicks "Accept".
 *   Until then nothing is sent to Google and no GA cookies are set.
 * - Never sends names, emails, ABNs, phone numbers, store codes or any
 *   other personal details to Google. Event parameters are limited to
 *   the allow-list below.
 * - Campaign attribution (utm_* tags and the referring website's domain,
 *   first touch and last touch) is kept in a first-party cookie on
 *   .vayora.au for 90 days ONLY after the visitor accepts. Until then it is
 *   held in memory for the current page only; "No thanks" deletes it.
 *   It holds no personal information.
 * - Any failure here (blocked script, no consent, GA down) is swallowed:
 *   registration, printing and payments never depend on this file.
 */
(function () {
  'use strict';
  var GA_ID = 'G-ZRMDK9LR6T';            // GA4 property "Vayora Tickets (vayora.au + app)", one web stream for both sites
  // Production hosts only: preview builds (*.workers.dev), localhost and any
  // other copy of the site never load GA, so they can't pollute the figures.
  var PROD_HOST = /(^|\.)vayora\.au$/.test(location.hostname);
  var GA_ON = PROD_HOST && /^G-[A-Z0-9]{6,}$/.test(GA_ID) && GA_ID !== 'G-XXXXXXXXXX';
  var CONSENT_COOKIE = 'vt_consent';     // 'granted' | 'denied'
  var UTM_COOKIE = 'vt_utm';
  var SAMPLE_COOKIE = 'vt_sample';
  var pendingTouch = null;               // this page's campaign touch, before consent
  var INTERNAL_COOKIE = 'vt_internal';   // owner/staff devices: excluded by the GA "Internal Traffic" filter
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var PARAM_ALLOW = ['link_location', 'link_text', 'page_path', 'ticket_format', 'method', 'plan', 'sample_used', 'value', 'currency'];
  var host = location.hostname;
  var onVayora = /(^|\.)vayora\.au$/.test(host);

  function setCookie(name, value, days) {
    var c = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + Math.round(days * 864e2) + '; SameSite=Lax';
    if (location.protocol === 'https:') c += '; Secure';
    if (onVayora) c += '; domain=.vayora.au';
    document.cookie = c;
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function clean(v, max) { return String(v || '').replace(/[^\w .:\/@+\-]/g, '').slice(0, max || 100); }

  /* ---------- campaign attribution (no personal data, consent only) ---------- */
  function consented() { return getCookie(CONSENT_COOKIE) === 'granted'; }
  function delCookie(name) {
    var c = name + '=; path=/; max-age=0; SameSite=Lax';
    if (onVayora) c += '; domain=.vayora.au';
    document.cookie = c;
  }
  // Reads this page's campaign touch from the URL (utm_*) or an outside
  // referring website. Called once at load, before the app tidies the URL.
  function readTouch() {
    try {
      var q = new URLSearchParams(location.search), t = {}, has = false;
      UTM_KEYS.forEach(function (k) { var v = q.get(k); if (v) { t[k.slice(4)] = clean(v); has = true; } });
      var ref = '';
      try { if (document.referrer) { var r = new URL(document.referrer).hostname; if (!/(^|\.)vayora\.au$/.test(r) && !/(^|\.)stripe\.com$/.test(r)) ref = clean(r); } } catch (e) {}
      if (!has && !ref) return null;
      if (!has) { t.source = ref; t.medium = 'referral'; }
      t.referrer = ref; t.landing = clean(location.pathname, 80); t.at = Date.now();
      return t;
    } catch (e) { return null; }
  }
  function readAttributionRaw() {
    try {
      var v = getCookie(UTM_COOKIE); if (!v) return null;
      var o = JSON.parse(v);
      if (o && !o.ft && !o.lt && o.source) o = { ft: o, lt: o };   // older single-touch format
      return o;
    } catch (e) { return null; }
  }
  // First touch is kept for 90 days; last touch is replaced by each new campaign visit.
  function saveTouch(t) {
    if (!t || !consented()) return;
    var o = readAttributionRaw() || {};
    if (!o.ft) o.ft = t;
    o.lt = t;
    setCookie(UTM_COOKIE, JSON.stringify(o), 90);
  }
  function readAttribution() {
    var o = consented() ? readAttributionRaw() : null;
    if (!o && pendingTouch && consented()) o = { ft: pendingTouch, lt: pendingTouch };
    if (!o) return null;
    var s = getCookie(SAMPLE_COOKIE);
    o.sample = s ? (function () { try { return JSON.parse(s); } catch (e) { return null; } })() : null;
    return o;
  }
  // Called by the sample ticket maker. Lets a later trial be credited as
  // "made a sample ticket first" — consent only, no ticket content stored.
  function markSample(format) {
    try {
      if (!consented()) return;
      if (getCookie(SAMPLE_COOKIE)) return;
      setCookie(SAMPLE_COOKIE, JSON.stringify({ at: Date.now(), format: clean(format || '', 10) }), 90);
    } catch (e) {}
  }

  /* ---------- GA4 (loaded only after consent) ---------- */
  var gaLoaded = false, queue = [];
  function loadGA() {
    if (!GA_ON || gaLoaded) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
    gtag('js', new Date());
    var cfg = {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: onVayora ? 'vayora.au' : 'auto',
      // Strip query strings from page URLs so nothing typed into a URL reaches GA.
      page_location: location.origin + location.pathname + utmOnlySearch(),
      page_title: document.title
    };
    // Referrer without its query string (a link from an email or search page
    // can carry personal details in its URL).
    try {
      if (document.referrer) {
        var ru = new URL(document.referrer);
        // Coming back from Stripe checkout is the same visit, not a new referral.
        if (/(^|\.)stripe\.com$/.test(ru.hostname)) cfg.ignore_referrer = true;
        else cfg.page_referrer = ru.origin + ru.pathname;
      }
    } catch (e) {}
    if (getCookie(INTERNAL_COOKIE) === '1') cfg.traffic_type = 'internal';
    // 'set' makes the cleaned page_location / page_referrer apply to EVERY
    // event (page_view, scroll, outbound clicks, ours), not just the config hit.
    var base = { page_location: cfg.page_location };
    if (cfg.page_referrer) base.page_referrer = cfg.page_referrer;
    gtag('set', base);
    // Note: the Google tag's automatic page_view still reads the browser URL.
    // The app's own URL parameters carry no personal data, and the GA4 stream
    // has Data redaction switched on for emails and for named query
    // parameters (see the change log) as a second safeguard.
    gtag('config', GA_ID, cfg);
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    queue.splice(0).forEach(function (e) { gtag('event', e[0], e[1]); });
  }
  function utmOnlySearch() {
    var q = new URLSearchParams(location.search), o = new URLSearchParams();
    UTM_KEYS.forEach(function (k) { if (q.get(k)) o.set(k, clean(q.get(k))); });
    var s = o.toString(); return s ? '?' + s : '';
  }
  function track(name, params) {
    try {
      var p = {};
      Object.keys(params || {}).forEach(function (k) { if (PARAM_ALLOW.indexOf(k) >= 0) p[k] = typeof params[k] === 'number' ? params[k] : clean(params[k], 80); });
      p.page_path = p.page_path || location.pathname;
      if (getCookie(CONSENT_COOKIE) !== 'granted' || !GA_ON) return;
      if (gaLoaded && window.gtag) gtag('event', name, p); else queue.push([name, p]);
    } catch (e) {}
  }

  /* ---------- consent banner ---------- */
  function banner() {
    if (!GA_ON || document.getElementById('vt-consent')) return;
    var css = '#vt-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:50;max-width:620px;margin:0 auto;background:#fff;border:1px solid #e0dccd;border-radius:14px;box-shadow:0 20px 50px rgba(23,61,46,.18);padding:16px 18px;font:14px/1.5 Inter,system-ui,sans-serif;color:#20241f;display:flex;gap:14px;align-items:center;flex-wrap:wrap}' +
      '#vt-consent p{margin:0;flex:1 1 300px}#vt-consent a{color:#1f5c41;font-weight:600}' +
      '#vt-consent .b{display:flex;gap:8px}#vt-consent button{font:700 13.5px Inter,system-ui,sans-serif;padding:9px 16px;border-radius:9px;cursor:pointer;border:1px solid #cfcab8;background:#fff;color:#20241f}' +
      '#vt-consent button.ok{background:#1f5c41;border-color:#1f5c41;color:#fff}#vt-consent button:focus-visible{outline:3px solid #d97a1f;outline-offset:2px}' +
      '@media print{#vt-consent{display:none}}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var d = document.createElement('div');
    d.id = 'vt-consent'; d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Cookie choice');
    d.innerHTML = '<p>Can we use Google Analytics cookies to see which pages help stores find us? We never send your name, email or ABN. <a href="https://vayora.au/privacy/">Privacy</a></p>' +
      '<div class="b"><button type="button" data-c="denied">No thanks</button><button type="button" class="ok" data-c="granted">Accept</button></div>';
    d.addEventListener('click', function (e) {
      var c = e.target && e.target.getAttribute && e.target.getAttribute('data-c');
      if (!c) return;
      setCookie(CONSENT_COOKIE, c, 365);
      d.remove();
      if (c === 'granted') { saveTouch(pendingTouch); loadGA(); }
      else { delCookie(UTM_COOKIE); delCookie(SAMPLE_COOKIE); }
      try { document.dispatchEvent(new CustomEvent('vt-consent', { detail: c })); } catch (e) {}
      if (c !== 'granted' && gaLoaded) {
        // Stop GA that was already running, without reloading the page.
        window['ga-disable-' + GA_ID] = true;
        document.cookie.split('; ').forEach(function (kv) { var n = kv.split('=')[0]; if (/^_ga/.test(n)) delCookie(n); });
      }
    });
    (document.body || document.documentElement).appendChild(d);
  }
  function openConsent() {
    var d = document.getElementById('vt-consent'); if (d) d.remove();
    if (!GA_ON) { alert('Analytics is not switched on for this site, so there is nothing to choose.'); return; }
    banner();
  }

  /* ---------- automatic click events on the marketing site ---------- */
  function classify(a) {
    var h = a.getAttribute('href') || '';
    if (/tickets\.vayora\.au\/\?signup=1/.test(h)) return 'trial_click';
    if (/\/free\/Vayora-Tickets-Free\.html/.test(h)) return 'free_download';
    if (/^mailto:.*Demo%20Request/i.test(h)) return 'demo_request';
    if (/licence\.html\?tier=/.test(h)) return 'licence_click';
    if (/^https:\/\/tickets\.vayora\.au\/?$/.test(h)) return 'sign_in_click';
    if (/^mailto:/.test(h)) return 'contact_click';
    return null;
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('[data-vt-consent-open]')) { e.preventDefault(); openConsent(); return; }
    var a = t && t.closest ? t.closest('a[href]') : null;
    if (!a || host === 'tickets.vayora.au') return;
    var ev = a.getAttribute('data-ev') || classify(a);
    if (!ev) return;
    var loc = a.getAttribute('data-loc') || (a.closest('footer') ? 'footer' : a.closest('header') ? 'header' : 'body');
    var p = { link_location: loc, link_text: (a.textContent || '').trim().slice(0, 40) };
    if (ev === 'licence_click') p.plan = /tier=life/.test(a.href) ? 'lifetime' : 'plus';
    track(ev, p);
  }, true);

  /* ---------- start ---------- */
  // ?vt_internal=1 marks this browser as Vayora's own (filtered out of GA);
  // ?vt_internal=0 clears it. Admin sign-ins in the app set it automatically.
  try {
    var iq = new URLSearchParams(location.search).get('vt_internal');
    if (iq === '1') setCookie(INTERNAL_COOKIE, '1', 400);
    if (iq === '0') delCookie(INTERNAL_COOKIE);
  } catch (e) {}
  pendingTouch = readTouch();
  if (GA_ON) {
    var c = getCookie(CONSENT_COOKIE);
    if (c === 'granted') { saveTouch(pendingTouch); loadGA(); }
    else if (!c) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner); else banner(); }
  }

  window.vtTrack = track;
  window.vtAttribution = readAttribution;
  window.vtMarkSample = markSample;
  window.vtMarkInternal = function () { try { if (getCookie(INTERNAL_COOKIE) !== '1') setCookie(INTERNAL_COOKIE, '1', 400); } catch (e) {} };
  window.vtConsent = function () { return getCookie(CONSENT_COOKIE); };
  window.vtOpenConsent = openConsent;
})();
