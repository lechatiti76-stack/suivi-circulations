/*
 * Suivi des circulations - application installable sur le bureau, comme le Suivi trains :
 * service worker, bouton « Installer l'application », petite démo d'ouverture (vidéo LHTE muette, « Passer »).
 * Chargé par saisie.html (data-appli="saisie") et visuel.html (data-appli="ecrans").
 * Version GitHub seulement : sur le poste local (localhost), rien ne s'active.
 */
(function () {
  'use strict';
  var script = document.currentScript, appli = (script && script.getAttribute('data-appli')) || 'saisie';
  var enLigne = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  // -------------------------------------------------------- service worker
  if (enLigne && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* sans effet */ }); });
  }

  // ------------------------------------------------------------ installation
  var invite = null, abonnes = [];
  function prevenir() { abonnes.forEach(function (f) { f(!!invite); }); }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; prevenir(); });
  window.addEventListener('appinstalled', function () { invite = null; prevenir(); });
  window.SuiviAppli = {
    /** Déjà ouverte comme application (fenêtre sans barre d'adresse). */
    installee: function () { return window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)').matches; },
    /** f(true) quand le navigateur propose l'installation, f(false) sinon. */
    suivre: function (f) { abonnes.push(f); f(!!invite); },
    installer: function () {
      if (!invite) return Promise.resolve(false);
      var p = invite; invite = null;
      p.prompt();
      return p.userChoice.then(function (c) { prevenir(); return c.outcome === 'accepted'; });
    },
    /** Rechargement automatique (nouvelle version) : pas de démo à la réouverture. */
    sansIntroAuProchainChargement: function () { try { sessionStorage.setItem('suivi:sans-intro', '1'); } catch (e) { /* sans effet */ } }
  };

  // ---------------------------------------------------- démo d'ouverture
  function intro() {
    var sauter = false;
    try { sauter = sessionStorage.getItem('suivi:sans-intro') === '1'; sessionStorage.removeItem('suivi:sans-intro'); } catch (e) { /* sans effet */ }
    if (sauter || !enLigne || /[?&]intro=non\b/.test(location.search) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var style = document.createElement('style');
    style.textContent =
      '.intro-appli{position:fixed;inset:0;z-index:99999;background:#000;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:opacity .55s ease}' +
      '.intro-appli.fin{opacity:0;pointer-events:none}' +
      '.intro-appli video{width:100%;height:100%;object-fit:contain;background:#000}' +
      '.intro-titre{position:absolute;left:0;right:0;bottom:9vh;text-align:center;color:#fff;font-family:Bahnschrift,"Segoe UI",sans-serif;letter-spacing:.08em;text-transform:uppercase;' +
      'text-shadow:0 2px 14px rgba(0,0,0,.8);opacity:0;animation:introTitre 1.1s ease .8s forwards}' +
      '.intro-titre b{display:block;font-size:clamp(22px,4.2vw,56px)}' +
      '.intro-titre span{display:block;margin-top:.45em;font-size:clamp(13px,1.8vw,22px);color:#F2C230}' +
      '.intro-passer{position:absolute;right:24px;bottom:24px;padding:8px 18px;border-radius:999px;border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.1);color:#fff;font:600 14px "Segoe UI",sans-serif;cursor:pointer}' +
      '@keyframes introTitre{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}';
    document.head.appendChild(style);
    var el = document.createElement('div');
    el.className = 'intro-appli';
    el.innerHTML = '<video muted playsinline preload="auto" src="intro.mp4"></video>' +
      '<div class="intro-titre"><b>Suivi des circulations</b><span>' + (appli === 'ecrans' ? 'Écrans' : 'Saisie') + ' · LHTE</span></div>' +
      '<button type="button" class="intro-passer">Passer ›</button>';
    document.body.appendChild(el);
    var video = el.querySelector('video'), fini = false;
    function fermer() {
      if (fini) return;
      fini = true;
      document.removeEventListener('keydown', touche, true);
      el.classList.add('fin');
      setTimeout(function () { video.pause(); video.removeAttribute('src'); el.remove(); style.remove(); }, 650);
    }
    // une touche ferme la démo sans aller jusqu'au formulaire de saisie
    function touche(e) { e.preventDefault(); e.stopPropagation(); fermer(); }
    document.addEventListener('keydown', touche, true);
    el.addEventListener('click', fermer);
    video.addEventListener('ended', fermer);
    video.addEventListener('error', function () { setTimeout(fermer, 2200); });
    var lecture = video.play();
    if (lecture && lecture.catch) lecture.catch(function () { setTimeout(fermer, 2200); });
    setTimeout(fermer, 9000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', intro); else intro();
})();
