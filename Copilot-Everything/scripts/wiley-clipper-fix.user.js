// ==UserScript==
// @name        Iframe Flatten - Obsidian Clipper Fix
// @namespace   obsidian-clipper-helper
// @version     5.0.0
// @description Flatten primary iframe for Obsidian Web Clipper
// @author      Trevor Robey
// @match       *://read.wiley.com/*
// @noframes
// @grant       none
// @run-at      document-idle
// ==/UserScript==

(function () {
    'use strict';

    var FLATTENED_ID = 'clipper-flattened-content';
    var BADGE_ID = 'clipper-fix-badge';
    var MAX_RETRIES = 20;
    var retries = 0;

    var SKIP_KEYWORDS = ['ads', 'analytics', 'tracking', 'recaptcha', 'facebook',
        'twitter', 'disqus', 'comment', 'chat', 'widget',
        'google_ads', 'doubleclick', 'adsense'];

    function log(msg) {
        console.log('[Clipper Fix] ' + msg);
    }

    function showBadge(text, color) {
        var badge = document.getElementById(BADGE_ID);
        if (!badge) {
            badge = document.createElement('div');
            badge.id = BADGE_ID;
            badge.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:999999;' +
                'padding:8px 14px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;' +
                'color:#fff;pointer-events:none;opacity:1;box-shadow:0 2px 8px rgba(0,0,0,.3);';
            document.body.appendChild(badge);
        }
        badge.textContent = text;
        badge.style.background = color;
        badge.style.opacity = '1';
        if (color === '#2a7') {
            setTimeout(function () { badge.style.opacity = '0'; }, 6000);
        }
    }

    function isSkippable(iframe) {
        var src = (iframe.src || '').toLowerCase();
        var name = (iframe.name || '').toLowerCase();
        var id = (iframe.id || '').toLowerCase();
        for (var i = 0; i < SKIP_KEYWORDS.length; i++) {
            var kw = SKIP_KEYWORDS[i];
            if (src.indexOf(kw) !== -1 || name.indexOf(kw) !== -1 || id.indexOf(kw) !== -1) {
                return true;
            }
        }
        return false;
    }

    function resolveUrls(html, baseUrl) {
        var base;
        try { base = new URL(baseUrl); } catch (e) { return html; }
        var origin = base.origin;
        var dir = baseUrl.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/');

        return html.replace(/(src|href)="(?!data:|blob:|https?:|\/\/|#|mailto:)([^"]+)"/g,
            function (m, attr, val) {
                var resolved = val.charAt(0) === '/' ? origin + val : dir + val;
                return attr + '="' + resolved + '"';
            });
    }

    function injectContent(iframe, html, sourceUrl, method) {
        var old = document.getElementById(FLATTENED_ID);
        if (old) old.remove();

        html = resolveUrls(html, sourceUrl);

        var article = document.createElement('article');
        article.id = FLATTENED_ID;
        article.innerHTML = html;
        iframe.style.display = 'none';
        iframe.parentNode.insertBefore(article, iframe);

        var charCount = article.innerText.length;
        log('Flattened via ' + method + ' (' + charCount + ' chars)');
        showBadge('Flattened (' + charCount + ' chars)', '#2a7');
    }

    function flatten() {
        if (document.getElementById(FLATTENED_ID)) return;

        var iframes = document.querySelectorAll('iframe[src]');
        if (iframes.length === 0) {
            retries++;
            if (retries < MAX_RETRIES) {
                setTimeout(flatten, 500);
            } else {
                log('No iframes found after ' + MAX_RETRIES + ' retries');
            }
            return;
        }

        for (var i = 0; i < iframes.length; i++) {
            var iframe = iframes[i];
            if (isSkippable(iframe)) {
                log('Skipping (ad/widget): ' + iframe.src.substring(0, 80));
                continue;
            }

            // Strategy 1: contentDocument (same-origin, instant)
            try {
                var doc = iframe.contentDocument;
                if (doc && doc.body && doc.body.innerText.length > 500) {
                    log('Same-origin hit (' + doc.body.innerText.length + ' chars)');
                    injectContent(iframe, doc.body.innerHTML, iframe.src, 'contentDocument');
                    return;
                }
            } catch (e) {
                log('contentDocument blocked: ' + e.message);
            }

            // Strategy 2: fetch() for same-origin iframe URLs
            var iframeSrc = iframe.src;
            var sameOrigin = false;
            try {
                sameOrigin = new URL(iframeSrc).origin === window.location.origin;
            } catch (e) {}

            if (sameOrigin) {
                log('Fetching same-origin iframe: ' + iframeSrc.substring(0, 80));
                showBadge('Extracting...', '#888');

                (function (targetIframe, targetSrc) {
                    fetch(targetSrc, { credentials: 'include' })
                        .then(function (resp) {
                            if (!resp.ok) throw new Error('HTTP ' + resp.status);
                            return resp.text();
                        })
                        .then(function (html) {
                            if (document.getElementById(FLATTENED_ID)) return;
                            var bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                            var bodyHtml = bodyMatch ? bodyMatch[1] : html;
                            var textLen = bodyHtml.replace(/<[^>]*>/g, '').trim().length;
                            if (textLen < 100) {
                                log('Fetched content too short (' + textLen + ' chars)');
                                showBadge('Content too short', '#c55');
                                return;
                            }
                            log('Fetched ' + textLen + ' chars');
                            injectContent(targetIframe, bodyHtml, targetSrc, 'fetch');
                        })
                        .catch(function (err) {
                            log('Fetch failed: ' + err.message);
                            showBadge('Fetch failed: ' + err.message, '#c55');
                        });
                })(iframe, iframeSrc);
                return;
            }

            log('Cross-origin iframe, cannot fetch: ' + iframeSrc.substring(0, 80));
        }

        // No iframe was handled — retry
        retries++;
        if (retries < MAX_RETRIES) {
            setTimeout(flatten, 500);
        } else {
            log('Gave up after ' + MAX_RETRIES + ' retries');
            showBadge('Could not extract content', '#c55');
        }
    }

    function init() {
        var iframe = document.querySelector('iframe');
        if (!iframe) {
            log('No iframe yet, watching...');
            new MutationObserver(function (mutations, obs) {
                if (document.querySelector('iframe')) {
                    log('Iframe appeared');
                    obs.disconnect();
                    init();
                }
            }).observe(document.body, { childList: true, subtree: true });
            return;
        }

        log('Iframe detected, starting...');
        showBadge('Extracting...', '#888');

        function tryFlatten() {
            setTimeout(flatten, 300);
        }

        try {
            if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                tryFlatten();
            }
        } catch (e) {
            // cross-origin, wait for load event
        }
        iframe.addEventListener('load', tryFlatten);

        // Also try after a short delay in case load already fired
        setTimeout(flatten, 1000);
    }

    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
