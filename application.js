/*
 * Suivi des circulations - application installable sur le bureau, comme le Suivi trains :
 * service worker, bouton « Installer l'application », petite démo d'ouverture (cascade de lettres qui forment le titre, « Passer »).
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
  // Cascade de lettres : une pluie de caractères en fond, puis les lettres du titre tombent du haut de l'écran
  // en défilant et se posent une à une à leur place. Environ 4 secondes.
  var COULEURS = ['#F28C28', '#2D8CFF', '#F2C230', '#8E5CF7', '#22B573']; // TDF, TN, ATL, Naviland, Ferovergne
  var SIGNES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function auHasard() { return SIGNES.charAt(Math.floor(Math.random() * SIGNES.length)); }

  function intro() {
    var sauter = false;
    try { sauter = sessionStorage.getItem('suivi:sans-intro') === '1'; sessionStorage.removeItem('suivi:sans-intro'); } catch (e) { /* sans effet */ }
    if (sauter || !enLigne || /[?&]intro=non\b/.test(location.search) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var style = document.createElement('style');
    style.textContent =
      '.intro-appli{position:fixed;inset:0;z-index:99999;overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:pointer;' +
      'background:radial-gradient(ellipse at 50% 45%,#11293C 0%,#08121B 58%,#03070B 100%);transition:opacity .55s ease}' +
      '.intro-appli.fin{opacity:0;pointer-events:none}' +
      '.intro-appli canvas{position:absolute;inset:0;width:100%;height:100%;animation:introPluie 4.4s linear forwards}' +
      '.intro-titre{position:relative;padding:0 16px;text-align:center;font-family:Bahnschrift,"Segoe UI",sans-serif;font-weight:600}' +
      '.intro-ligne{display:flex;flex-wrap:wrap;justify-content:center;column-gap:.45em;line-height:1.15}' +
      '.intro-ligne.grand{font-size:clamp(30px,6vw,96px);letter-spacing:.04em;--fin:#fff;--eclat:#F2C230}' +
      '.intro-ligne.petit{font-size:clamp(16px,2.6vw,40px);letter-spacing:.14em;--fin:#F2C230;--eclat:#fff}' +
      '.intro-mot{display:inline-flex;white-space:nowrap}' +
      '.intro-l{position:relative;display:inline-block;color:transparent;will-change:transform}' +
      '.intro-l i{position:absolute;left:0;right:0;top:0;font-style:normal;text-align:center;color:#A9CBE6;text-shadow:0 0 12px rgba(45,140,255,.7)}' +
      '.intro-l.posee i{animation:introEclat .8s ease-out forwards}' +
      '.intro-rail{position:relative;display:flex;width:min(78vw,1000px);height:6px;margin:clamp(12px,2.4vh,28px) auto;border-radius:3px;overflow:hidden;clip-path:inset(0 50% 0 50%)}' +
      '.intro-rail i{flex:1}' +
      '.intro-rail::after{content:"";position:absolute;top:0;bottom:0;left:-20%;width:18%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.95),transparent)}' +
      '.intro-rail.trace{animation:introRail .7s cubic-bezier(.2,.7,.3,1) forwards}' +
      '.intro-rail.trace::after{animation:introReflet 1s ease-in-out .8s forwards}' +
      '.intro-passer{position:absolute;right:24px;bottom:24px;padding:8px 18px;border-radius:999px;border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.1);color:#fff;font:600 14px "Segoe UI",sans-serif;cursor:pointer}' +
      '@keyframes introPluie{0%,40%{opacity:.9}75%,100%{opacity:.3}}' +
      '@keyframes introEclat{0%{color:var(--eclat);text-shadow:0 0 24px var(--eclat),0 0 6px var(--eclat)}100%{color:var(--fin);text-shadow:0 3px 18px rgba(0,0,0,.75)}}' +
      '@keyframes introRail{to{clip-path:inset(0 0 0 0)}}' +
      '@keyframes introReflet{to{left:102%}}';
    document.head.appendChild(style);
    var el = document.createElement('div');
    el.className = 'intro-appli';
    el.innerHTML = '<canvas></canvas>' +
      '<div class="intro-titre" role="img" aria-label="Suivi des circulations, ' + (appli === 'ecrans' ? 'Écrans' : 'Saisie') + ', LHTE">' +
      '<div class="intro-ligne grand"></div>' +
      '<div class="intro-rail">' + COULEURS.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</div>' +
      '<div class="intro-ligne petit"></div></div>' +
      '<button type="button" class="intro-passer">Passer ›</button>';
    document.body.appendChild(el);

    // les lettres : chacune garde sa largeur finale (texte transparent) et montre au-dessus des signes qui défilent
    var lettres = [], t0 = performance.now();
    function ecrire(ligne, texte, debut, ecart, alea) {
      var n = 0, fin = debut;
      texte.split(' ').forEach(function (mot) {
        var bloc = document.createElement('span');
        bloc.className = 'intro-mot';
        Array.from(mot).forEach(function (c) {
          var l = document.createElement('span'), i = document.createElement('i');
          var melange = /[A-ZÉ0-9]/.test(c), delai = Math.round(debut + n++ * ecart + Math.random() * alea);
          l.className = 'intro-l';
          l.textContent = c;
          i.textContent = melange ? auHasard() : c;
          l.appendChild(i);
          bloc.appendChild(l);
          // chute avec un léger rebond : posée à 70 % de la durée
          if (l.animate) {
            l.animate([
              { transform: 'translate(' + Math.round(Math.random() * 80 - 40) + 'px,-115vh) rotate(' + Math.round(Math.random() * 90 - 45) + 'deg)', easing: 'cubic-bezier(.45,0,.85,.4)' },
              { transform: 'translate(0,0) rotate(0deg)', offset: 0.7, easing: 'cubic-bezier(.25,.7,.4,1)' },
              { transform: 'translate(0,-.18em) rotate(0deg)', offset: 0.84, easing: 'cubic-bezier(.6,0,.85,.5)' },
              { transform: 'translate(0,0) rotate(0deg)' }
            ], { duration: 1000, delay: delai, fill: 'backwards' });
          }
          lettres.push({ el: l, i: i, c: c, melange: melange, delai: delai, pose: delai + 700, vu: 0 });
          fin = Math.max(fin, delai + 700);
        });
        ligne.appendChild(bloc);
      });
      return fin;
    }
    var rail = el.querySelector('.intro-rail');
    var finTitre = ecrire(el.querySelector('.grand'), 'SUIVI DES CIRCULATIONS', 250, 45, 140);
    var finSous = ecrire(el.querySelector('.petit'), (appli === 'ecrans' ? 'ÉCRANS' : 'SAISIE') + ' · LHTE', finTitre - 200, 55, 90);
    setTimeout(function () { rail.classList.add('trace'); }, finTitre - 350);

    // la pluie de fond : des colonnes de signes qui tombent et s'effacent (quelques-uns aux couleurs des navettes)
    var toile = el.querySelector('canvas'), ctx = toile.getContext('2d'), colonnes = [], pas = 20, L = 0, H = 0, avant = 0;
    function dimensionner() {
      var r = Math.min(window.devicePixelRatio || 1, 2);
      L = window.innerWidth; H = window.innerHeight;
      toile.width = Math.round(L * r); toile.height = Math.round(H * r);
      ctx.setTransform(r, 0, 0, r, 0, 0);
      pas = Math.max(16, Math.round(Math.min(L, H) / 36));
      ctx.font = '600 ' + Math.round(pas * 0.8) + 'px Bahnschrift, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      colonnes = [];
      for (var x = pas / 2; x < L; x += pas) colonnes.push({ x: x, y: -Math.round(Math.random() * H * 0.8), cadence: 35 + Math.random() * 55, proch: 0 });
    }
    function pluie(t) {
      var dt = avant ? Math.min(t - avant, 50) : 16;
      avant = t;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - Math.pow(0.88, dt / 16.7)).toFixed(3) + ')';
      ctx.fillRect(0, 0, L, H);
      ctx.globalCompositeOperation = 'source-over';
      colonnes.forEach(function (c) {
        if (t < c.proch) return;
        c.proch = t + c.cadence;
        c.y += pas;
        if (c.y > H + pas) { c.y = -pas * Math.floor(Math.random() * 12); c.cadence = 35 + Math.random() * 55; }
        if (c.y < 0) return;
        ctx.fillStyle = Math.random() < 0.08 ? COULEURS[Math.floor(Math.random() * COULEURS.length)] : 'rgba(170,205,232,.75)';
        ctx.fillText(auHasard(), c.x, c.y);
      });
    }
    function boucle(t) {
      if (!el.isConnected) return;
      pluie(t);
      var ecoule = t - t0;
      lettres.forEach(function (o) {
        if (o.posee || ecoule < o.delai) return;
        if (ecoule >= o.pose) { o.posee = true; o.i.textContent = o.c; o.el.classList.add('posee'); }
        else if (o.melange && t - o.vu > 65) { o.vu = t; o.i.textContent = auHasard(); }
      });
      requestAnimationFrame(boucle);
    }
    dimensionner();
    window.addEventListener('resize', dimensionner);
    requestAnimationFrame(boucle);

    var fini = false, minuteur = setTimeout(fermer, finSous + 1100);
    function fermer() {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      document.removeEventListener('keydown', touche, true);
      window.removeEventListener('resize', dimensionner);
      el.classList.add('fin');
      setTimeout(function () { el.remove(); style.remove(); }, 650);
    }
    // une touche ferme la démo sans aller jusqu'au formulaire de saisie
    function touche(e) { e.preventDefault(); e.stopPropagation(); fermer(); }
    document.addEventListener('keydown', touche, true);
    el.addEventListener('click', fermer);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', intro); else intro();
})();
