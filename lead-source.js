/* Superior Home Solutions TX — inquiry attribution only; no pageview tracking. */
(function () {
  'use strict';
  var KEY = 'shs-inquiry-source-v1';
  function clean(value, fallback) {
    var safe = String(value || '').replace(/[^a-zA-Z0-9 _./-]/g, '').trim().slice(0, 80);
    return safe || fallback || 'Unknown';
  }
  function referrerHost() {
    try {
      var host = new URL(document.referrer).hostname.toLowerCase();
      return host === window.location.hostname.toLowerCase() ? '' : host;
    } catch (error) { return ''; }
  }
  function firstVisit() {
    var params = new URLSearchParams(window.location.search);
    var referrer = referrerHost();
    var source = clean(params.get('utm_source'), '');
    var medium = clean(params.get('utm_medium'), '');
    var campaign = clean(params.get('utm_campaign'), 'None');
    if (!source) {
      if (params.has('gclid')) {
        source = 'google'; medium = medium || 'paid';
      } else {
        source = clean(referrer, 'Direct or unknown');
      }
    }
    if (!medium) medium = referrer ? 'referral' : source === 'Direct or unknown' ? 'direct or unknown' : 'unspecified';
    return {
      source: source,
      medium: medium,
      campaign: campaign,
      landing: clean(window.location.pathname, '/')
    };
  }
  var first = null;
  try {
    var saved = window.sessionStorage.getItem(KEY);
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && typeof parsed.source === 'string' &&
          typeof parsed.medium === 'string' && typeof parsed.landing === 'string') {
        first = parsed;
      }
    }
  } catch (error) {
    // Private-browsing or storage restrictions should never interrupt the site.
  }
  if (!first) {
    first = firstVisit();
    try { window.sessionStorage.setItem(KEY, JSON.stringify(first)); }
    catch (error) { /* Storage is optional. */ }
  }
  window.SHSLeadSource = Object.freeze({
    fields: function () {
      return {
        'Lead source': clean(first.source),
        'Lead medium': clean(first.medium),
        'Campaign': clean(first.campaign, 'None'),
        'Landing page': clean(first.landing, '/'),
        'Submitted page': clean(window.location.pathname, '/')
      };
    }
  });
})();
