/* Vayora Tickets — privacy-first analytics and campaign attribution.
 * Shared by vayora.au and tickets.vayora.au (keep both copies identical).
 *
 * - Google Analytics 4 loads ONLY after the visitor clicks "Accept".
 *   Until then nothing is sent to Google and no GA cookies are set.
 * - Never sends names, emails, ABNs, phone numbers, store codes or any
 *   other personal details to Google. Event parameters are limited to
 *   the allow-list below.
 * - Campaign attribution (utm_* tags and the referring website's domain)
 *   is kept in a first-party cookie on .vayora.au for 90 days so a trial
 *   started on tickets.vayora.au can be credited to the campaign that
 *   brought the visitor. It holds no personal information.
 */
(function () {
  'use strict';
  var GA_ID = 'G-XXXXXXXXXX';            // <-- set your GA4 Measurement ID here (both repos)
  var GA_ON = /^G-[A-Z0-9]{6,}$/.test(GA_ID) && GA_ID !== 'G-XXXXXXXXXX';
  var CONSENT_COOKIE = 'vt_consent';     // 'granted' | 'denied'
  var UTM_COOKIE = 'vt_utm';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var PARAM_ALLOW = ['link_location', 'link_text', 'page_path', 'ticket_format', 'method', 'plan', 'value', 'currency'];
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

  /* ---------- campaign attribution (no personal data) ---------- */
  function captureAttribution() {
    try {
      var q = new URLSearchParams(location.search), utm = {}, has = false;
      UTM_KEYS.forEach(function (k) { var v = q.get(k); if (v) { utm[k.slice(4)] = clean(v); has = true; } });
      var ref = '';
      try { if (document.referrer) { var r = new URL(document.referrer).hostname; if (!/(^|\.)vayora\.au$/.test(r)) ref = clean(r); } } catch (e) {}
      var existing = readAttribution();
      if (has) {
        utm.referrer = ref || (existing && existing.referrer) || '';
        utm.landing = clean(location.pathname, 80);
        utm.at = Date.now();
        setCookie(UTM_COOKIE, JSON.stringify(utm), 90);
      } else if (ref && !existing) {
        setCookie(UTM_COOKIE, JSON.stringify({ source: ref, medium: 'referral', referrer: ref, landing: clean(location.pathname, 80), at: Date.now() }), 90);
      }
    } catch (e) {}
  }
  function readAttribution() {
    try { var v = getCookie(UTM_COOKIE); return v ? JSON.parse(v) : null; } catch (e) { return null; }
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
    gtag('config', GA_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: onVayora ? 'vayora.au' : 'auto',
      // Strip query strings from page URLs so nothing typed into a URL reaches GA.
      page_location: location.origin + location.pathname + utmOnlySearch(),
      page_title: document.title
    });
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
      if (c === 'granted') loadGA();
      else if (gaLoaded) location.reload(); // stop GA that was already running
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
  captureAttribution();
  if (GA_ON) {
    var c = getCookie(CONSENT_COOKIE);
    if (c === 'granted') loadGA();
    else if (!c) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner); else banner(); }
  }

  window.vtTrack = track;
  window.vtAttribution = readAttribution;
  window.vtOpenConsent = openConsent;
})();
