/* Superior Home Solutions TX — GA4, basic opt-in analytics.
   Loads Google Analytics only after the visitor explicitly agrees.
   Sends generate_lead only after FormSubmit confirms success. */
(function () {
  'use strict';
  var MEASUREMENT_ID = 'G-TK32KZLXP6';
  var KEY = 'shs-analytics-choice-v1';
  var choice = null;
  var loaded = false;
  var panel = null;

  try {
    var saved = window.localStorage.getItem(KEY);
    if (saved === 'yes' || saved === 'no') choice = saved;
  } catch (error) { /* Storage might be unavailable. Default to no tracking. */ }

  function isSpanish() {
    try { return window.localStorage.getItem('shs-lang') === 'es'; }
    catch (error) { return document.documentElement.lang === 'es'; }
  }

  function loadGoogleTag() {
    if (loaded || choice !== 'yes') return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID);
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(tag);
  }

  function clearAnalyticsCookies() {
    // Revoke first-party Google Analytics cookies if a visitor opts out later.
    document.cookie.split(';').forEach(function (part) {
      var name = part.trim().split('=')[0];
      if (!/^_ga(?:_|$)/.test(name)) return;
      document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
      var host = location.hostname;
      document.cookie = name + '=; Max-Age=0; path=/; domain=' + host + '; SameSite=Lax';
      document.cookie = name + '=; Max-Age=0; path=/; domain=.' + host + '; SameSite=Lax';
    });
  }

  function textFor(lang) {
    return lang === 'es' ? {
      title: 'Analítica opcional',
      copy: '¿Nos permite medir las visitas y las solicitudes para mejorar esta página? No utilizamos esta opción para publicidad.',
      accept: 'Aceptar',
      reject: 'No, gracias',
      privacy: 'Privacidad',
      settings: 'Preferencias de analítica',
      aria: 'Preferencias de analítica'
    } : {
      title: 'Optional website analytics',
      copy: 'May we measure visits and inquiries to improve this website? This option is not used for advertising.',
      accept: 'Allow analytics',
      reject: 'No thanks',
      privacy: 'Privacy',
      settings: 'Analytics preferences',
      aria: 'Analytics preferences'
    };
  }

  function drawBanner(force) {
    if (!force && choice !== null) return;
    if (panel) panel.remove();
    var lang = isSpanish() ? 'es' : 'en';
    var t = textFor(lang);
    panel = document.createElement('section');
    panel.id = 'shs-analytics-choice';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', t.aria);
    panel.style.cssText = [
      'position:fixed', 'z-index:95', 'left:16px', 'bottom:16px',
      'width:min(470px,calc(100% - 32px))', 'background:#F5F1EA',
      'color:#24484B', 'border:1px solid #C9BFAE', 'box-shadow:0 8px 30px rgba(26,40,40,.16)',
      'padding:18px 20px', 'font-family:Manrope,Arial,sans-serif', 'font-size:13px'
    ].join(';');
    var title = document.createElement('strong');
    title.textContent = t.title;
    title.style.cssText = 'display:block;font-size:15px;margin-bottom:5px';
    var copy = document.createElement('p');
    copy.textContent = t.copy;
    copy.style.cssText = 'margin:0 0 12px;line-height:1.55';
    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:9px';
    var accept = document.createElement('button');
    accept.type = 'button';
    accept.id = 'shs-analytics-accept';
    accept.textContent = t.accept;
    accept.style.cssText = 'background:#24484B;color:#F5F1EA;border:1px solid #24484B;padding:10px 14px;min-height:44px;font:600 12px Manrope,Arial,sans-serif;cursor:pointer';
    var reject = document.createElement('button');
    reject.type = 'button';
    reject.id = 'shs-analytics-reject';
    reject.textContent = t.reject;
    reject.style.cssText = 'background:transparent;color:#24484B;border:1px solid #24484B;padding:10px 14px;min-height:44px;font:600 12px Manrope,Arial,sans-serif;cursor:pointer';
    var privacy = document.createElement('a');
    privacy.href = '/privacy.html';
    privacy.textContent = t.privacy;
    privacy.style.cssText = 'font-size:12px;color:#24484B;text-decoration:underline;text-underline-offset:3px';
    accept.addEventListener('click', function () { setChoice('yes'); });
    reject.addEventListener('click', function () { setChoice('no'); });
    actions.append(accept, reject, privacy);
    panel.append(title, copy, actions);
    document.body.appendChild(panel);
  }

  function setChoice(next) {
    var wasLoaded = loaded;
    choice = next;
    try { window.localStorage.setItem(KEY, next); } catch (error) {}
    if (panel) { panel.remove(); panel = null; }
    if (next === 'yes') loadGoogleTag();
    else {
      if (wasLoaded) {
        // Stop measurement immediately before reloading without the Google tag.
        window['ga-disable-' + MEASUREMENT_ID] = true;
        if (typeof window.gtag === 'function') {
          window.gtag('consent', 'update', {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied'
          });
        }
      }
      clearAnalyticsCookies();
      if (wasLoaded) location.reload();
    }
  }

  function addSettingsLink() {
    var footer = document.querySelector('footer');
    var target = footer || document.querySelector('main') || document.body;
    if (document.getElementById('shs-analytics-settings')) return;
    var link = document.createElement('button');
    link.type = 'button';
    link.id = 'shs-analytics-settings';
    link.style.cssText = footer
      ? 'display:block;margin:18px 0 0;padding:8px 0;background:none;border:0;text-decoration:underline;text-underline-offset:3px;color:#E4DDD1;font:500 12px Manrope,Arial,sans-serif;cursor:pointer'
      : 'display:block;margin:20px 0;padding:8px 0;background:none;border:0;text-decoration:underline;text-underline-offset:3px;color:#24484B;font:500 12px Manrope,Arial,sans-serif;cursor:pointer';
    link.addEventListener('click', function () { drawBanner(true); });
    target.appendChild(link);
    updateSettingsText();
  }

  function updateSettingsText() {
    var link = document.getElementById('shs-analytics-settings');
    if (link) link.textContent = textFor(isSpanish() ? 'es' : 'en').settings;
    if (panel) drawBanner(true);
  }

  function start() {
    addSettingsLink();
    // The site's rendering framework may replace the footer after load.
    // Reinsert the preference control if it gets removed during a rerender.
    var observer = new MutationObserver(function () {
      if (!document.getElementById('shs-analytics-settings')) addSettingsLink();
    });
    observer.observe(document.body, { subtree: true, childList: true });
    if (choice === 'yes') loadGoogleTag();
    else drawBanner(false);
    window.addEventListener('shs-lang', updateSettingsText);
  }

  window.SHSAnalytics = Object.freeze({
    measurementId: MEASUREMENT_ID,
    hasConsent: function () { return choice === 'yes'; },
    lead: function (formType) {
      if (choice !== 'yes' || !loaded || typeof window.gtag !== 'function') return;
      window.gtag('event', 'generate_lead', {
        form_type: formType === 'contact' ? 'contact' : 'consultation'
      });
    },
    preferences: function () { drawBanner(true); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
