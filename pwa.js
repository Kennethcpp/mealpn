/* Naija Meal Planner — PWA install helper
   - Registers the service worker
   - Shows an "Install app" popup to first-time visitors (before the daily ad gate)  */
(function () {
    'use strict';

    var SEEN_KEY = 'mp_pwa_seen';

    function get(k) {
        try { var v = localStorage.getItem(k); if (v) return v; } catch (e) {}
        try {
            var m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)'));
            if (m) return decodeURIComponent(m[1]);
        } catch (e) {}
        return null;
    }
    function set(k, v) {
        try { localStorage.setItem(k, v); } catch (e) {}
        try { document.cookie = k + '=' + encodeURIComponent(v) + '; path=/; max-age=31536000; SameSite=Lax'; } catch (e) {}
    }

    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                     window.navigator.standalone === true;
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    var deferred = null;   // the browser's install prompt (Chrome/Edge/Android)
    var domReady = false;
    var shown = false;
    var overlay = null;

    // While true, the daily ad gate waits its turn (see applyGate in each page)
    window.mpPwaBusy = !standalone && !get(SEEN_KEY);

    // ---------- Service worker ----------
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').catch(function () {});
        });
    }

    // ---------- Styles for the popup ----------
    function injectStyles() {
        var css = '' +
            '.mp-pwa-overlay{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:1.2rem;background:rgba(255,255,255,.6);backdrop-filter:blur(3px);}' +
            '.mp-pwa-card{background:#fff;border:2px solid #020202;border-radius:24px;box-shadow:0 18px 40px rgba(0,153,92,.18);padding:2rem 1.8rem 1.5rem;max-width:420px;width:100%;text-align:center;font-family:"Segoe UI",Roboto,system-ui,-apple-system,sans-serif;color:#020202;}' +
            '.mp-pwa-icon{width:72px;height:72px;border-radius:18px;margin-bottom:1rem;box-shadow:0 6px 16px rgba(0,153,92,.25);}' +
            '.mp-pwa-card h2{font-size:1.4rem;margin-bottom:.6rem;}' +
            '.mp-pwa-card p{font-size:.92rem;color:#6b7280;line-height:1.55;margin-bottom:1rem;}' +
            '.mp-pwa-list{list-style:none;text-align:left;margin:0 0 1.3rem;padding:0;font-size:.88rem;}' +
            '.mp-pwa-list li{padding:.3rem 0;display:flex;gap:.6rem;align-items:flex-start;}' +
            '.mp-pwa-list i{color:#00995C;margin-top:3px;}' +
            '.mp-pwa-btn{width:100%;padding:.9rem 1.2rem;border:none;border-radius:40px;background:#00995C;color:#fff;font-size:1rem;font-weight:700;cursor:pointer;transition:transform .15s,box-shadow .15s;}' +
            '.mp-pwa-btn:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(0,153,92,.25);}' +
            '.mp-pwa-btn:focus-visible,.mp-pwa-later:focus-visible{outline:3px solid #00995C66;outline-offset:3px;}' +
            '.mp-pwa-later{display:block;width:100%;margin-top:.7rem;padding:.6rem;border:none;background:none;color:#6b7280;font-size:.88rem;font-weight:600;cursor:pointer;}' +
            '.mp-pwa-steps{background:#f5f5f5;border-radius:12px;padding:.8rem 1rem;text-align:left;font-size:.88rem;line-height:1.7;margin-bottom:1.1rem;}';
        var st = document.createElement('style');
        st.textContent = css;
        document.head.appendChild(st);
    }

    // ---------- Popup ----------
    function release() {
        window.mpPwaBusy = false;
        if (typeof window.applyGate === 'function') window.applyGate();
    }

    function close() {
        set(SEEN_KEY, '1');
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        release();
    }

    function show(mode) {
        if (shown || standalone) return;
        shown = true;
        window.mpPwaBusy = true;
        if (typeof window.applyGate === 'function') window.applyGate();
        injectStyles();

        overlay = document.createElement('div');
        overlay.className = 'mp-pwa-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'mpPwaTitle');

        var action;
        if (mode === 'ios') {
            action = '<div class="mp-pwa-steps">' +
                     '<div>1. In Safari, tap the <b>Share</b> button <i class="fas fa-share-square"></i></div>' +
                     '<div>2. Choose <b>Add to Home Screen</b></div>' +
                     '<div>3. Tap <b>Add</b></div></div>' +
                     '<button class="mp-pwa-btn" id="mpPwaInstall" type="button">Got it</button>';
        } else {
            action = '<button class="mp-pwa-btn" id="mpPwaInstall" type="button">Install app</button>';
        }

        overlay.innerHTML =
            '<div class="mp-pwa-card">' +
              '<img class="mp-pwa-icon" src="icons/icon-192.png" alt="">' +
              '<h2 id="mpPwaTitle">Install Naija Meal Planner</h2>' +
              '<p>Add it to your home screen for a one-tap daily routine.</p>' +
              '<ul class="mp-pwa-list">' +
                '<li><i class="fas fa-check-circle"></i><span>Opens like a real app, straight to today\'s plan</span></li>' +
                '<li><i class="fas fa-check-circle"></i><span>Loads fast and works with a weak connection</span></li>' +
                '<li><i class="fas fa-check-circle"></i><span>Free, and takes no storage space to speak of</span></li>' +
              '</ul>' +
              action +
              '<button class="mp-pwa-later" id="mpPwaLater" type="button">Maybe later</button>' +
            '</div>';
        document.body.appendChild(overlay);

        var installBtn = document.getElementById('mpPwaInstall');
        document.getElementById('mpPwaLater').addEventListener('click', close);

        installBtn.addEventListener('click', function () {
            if (mode === 'android' && deferred) {
                deferred.prompt();
                deferred.userChoice.then(function () { deferred = null; close(); })
                                   .catch(function () { close(); });
            } else {
                close();
            }
        });
        installBtn.focus({ preventScroll: true });
    }

    // ---------- Events ----------
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();          // we show our own popup instead of the browser's mini-bar
        deferred = e;
        if (domReady && window.mpPwaBusy && !shown) show('android');
    });

    window.addEventListener('appinstalled', function () {
        set(SEEN_KEY, '1');
        deferred = null;
        if (overlay) close(); else release();
    });

    document.addEventListener('DOMContentLoaded', function () {
        domReady = true;
        if (!window.mpPwaBusy) return;            // already seen, or already installed

        if (deferred) { show('android'); return; }
        if (isIOS)    { show('ios'); return; }

        // Give the browser a moment to offer installation; if it never does
        // (unsupported browser), skip the popup and let the gate appear.
        setTimeout(function () {
            if (!shown) release();
        }, 2500);
    });
})();
