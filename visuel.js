/*
 * Suivi des circulations - mode VISUEL.
 * Relit diffusion.js toutes les 3 secondes (même dossier que cette page, sur le partage ou servi par le service local).
 * Lecture seule : cette page n'écrit rien. Paramètre d'adresse ?vue=navettes | trains | tout.
 */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var esc = SC.esc, hm = SC.hm;
  var vue = (/[?&]vue=(\w+)/.exec(location.search) || [])[1] || 'tout';
  /** Version GitHub : ?source=<adresse du serveur Google Apps Script>. Sinon, diffusion.js à côté de la page. */
  var source = (function () { var m = /[?&]source=([^&]+)/.exec(location.search); return m ? decodeURIComponent(m[1]) : ''; })();
  var etat = { d: null, cle: '', battement: null, battementVuA: 0, echecs: 0, dernierSucces: 0, html: {}, flash: '', base: 0 };

  // ------------------------------------------------------------ réception
  window.__diffusion = function (d, meta) {
    if (!d || d.schema !== 1) return;
    etat.dernierSucces = Date.now(); etat.echecs = 0;
    var b = meta && meta.battement;
    if (b !== etat.battement) { etat.battement = b; etat.battementVuA = Date.now(); }
    var cle = JSON.stringify(d);
    if (cle !== etat.cle) { etat.cle = cle; etat.d = d; rendre(); }
    majLiaison();
  };
  function charger() {
    if (source) {
      fetch(source + (source.indexOf('?') < 0 ? '?' : '&') + 'action=diffusion&t=' + Date.now(), { cache: 'no-store', redirect: 'follow' })
        .then(function (r) { return r.json(); })
        .then(function (o) { if (o && o.diffusion) window.__diffusion(o.diffusion, o.meta); else { etat.echecs++; majLiaison(); } })
        .catch(function () { etat.echecs++; majLiaison(); });
      return;
    }
    var s = document.createElement('script');
    s.src = 'diffusion.js?t=' + Date.now();
    s.onload = function () { s.remove(); };
    s.onerror = function () { s.remove(); etat.echecs++; majLiaison(); };
    document.head.appendChild(s);
  }

  // --------------------------------------------------------------- rendu
  function maintenant() { return SC.iso(new Date()); }
  function statut(l) { return SC.statutDiffuse(l, maintenant(), etat.d.seuilRetardMinutes); }
  function libelle(st, sens) { return SC.libelleStatut(st, sens); }
  function classeEcart(min) { return min < 0 ? 'tot' : (min > 15 ? 'tres-tard' : (min > 0 ? 'tard' : '')); }
  function celluleEcart(l, st) {
    if (l.reel && l.theo) { var e = SC.minutesEntre(l.reel, l.theo); return '<span class="ec ' + classeEcart(e) + '">' + SC.fmtEcart(e) + '</span>'; }
    if ((st === 'retard' || st === 'annonce') && l.theo) {
      var r = SC.minutesEntre(maintenant(), l.theo);
      if (r > 0) return '<span class="ec ' + classeEcart(r) + '">' + SC.fmtEcart(r) + '</span>';
    }
    if (l.hlr && l.sens === 'D') return '<span class="ec hlr">HLR ' + esc(l.hlr) + '</span>';
    return '<span></span>';
  }
  function celluleHeure(l, barre) {
    var h = l.reel ? hm(l.reel) : hm(l.theo);
    if (!h) return '<span class="h">—</span>';
    return '<span class="h' + (barre ? ' barre' : '') + '">' + h + '<small>' + (l.reel ? 'réel' : 'prévu') + '</small></span>';
  }
  function celluleVoie(l) {
    var rame = l.rame === 'ok' ? '<small class="rame-ok">rame prête</small>' : (l.rame === 'attente' ? '<small class="rame-attente">rame en attente</small>' : '');
    return '<span class="vo">' + esc(l.voie || '') + rame + '</span>';
  }
  function ligneNavette(l, demain) {
    var st = demain ? (l.etat === 'supprime' ? 'supprime' : 'prevu') : statut(l);
    return '<div class="r' + (demain ? ' demain' : '') + '">' +
      '<span class="code">' + esc(l.code) + '</span>' +
      '<span class="sens">' + (l.sens === 'D' ? 'Départ' : 'Arrivée') + '</span>' +
      celluleHeure(l, st === 'supprime') + (demain ? (l.hlr ? '<span class="ec hlr">HLR ' + esc(l.hlr) + '</span>' : '<span></span>') : celluleEcart(l, st)) +
      '<span class="wg">' + (l.wagons != null ? esc(l.wagons) + ' wgs' : '') + '</span>' +
      celluleVoie(demain ? { voie: l.voie } : l) +
      '<span><span class="st ' + st + '">' + esc(libelle(st, l.sens)) + '</span></span></div>';
  }
  function panneauNavettes(g) {
    var html = '<div class="panneau"><div class="p-tete"><h2>' + esc(g.libelle) + '</h2><span>' + g.lignes.length + ' circulations</span></div>' +
      '<div class="cols"><span>Code</span><span>Sens</span><span>Heure</span><span>Écart</span><span>Wagons</span><span>Voie</span><span>État</span></div>' +
      g.lignes.map(function (l) { return ligneNavette(l, false); }).join('');
    if (g.demain && g.demain.length) html += '<div class="sous">Demain · ' + esc(etat.d.demain || '') + '</div>' + g.demain.map(function (l) { return ligneNavette(l, true); }).join('');
    return html + '</div>';
  }
  function wagons(l) { return '<span class="wg">' + (l && l.wagons != null ? esc(l.wagons) + ' wgs' : '') + '</span>'; }
  function ligneTrain(t) {
    var a = t.arrivee, d = t.depart;
    var sa = a ? statut(a) : '', sd = d ? statut(d) : '';
    var arr = a ? '<span><span class="st ' + sa + '">' + esc(libelle(sa, 'A')) + '</span></span>' + celluleHeure(a, sa === 'supprime') + '<span class="vo">' + esc(a.voie || '') + '</span>' + wagons(a)
      : '<span></span><span></span><span></span><span></span>';
    var dep = d ? '<span class="num' + (sd === 'supprime' ? ' barre' : '') + '">' + esc(d.numero || '') + '</span>' + celluleHeure(d, sd === 'supprime') +
      '<span class="ec hlr">' + (d.hlr && !d.reel && sd !== 'supprime' ? esc(d.hlr) : '') + '</span><span class="vo">' + esc(sd === 'supprime' ? '' : (d.voie || '')) + '</span>' +
      (sd === 'supprime' ? '<span></span>' : wagons(d)) + '<span><span class="st ' + sd + '">' + esc(libelle(sd, 'D')) + '</span></span>'
      : '<span></span><span></span><span></span><span></span><span></span><span></span>';
    return '<div class="t">' + arr + '<span class="tcode">' + esc(t.code) + '<small>' + esc(t.groupe) + '</small></span>' + dep + '</div>';
  }
  function panneauTrains(trains) {
    return '<div class="panneau"><div class="p-tete"><h2>Trains de ligne</h2><span>Arrivée · train · départ</span></div>' +
      '<div class="tcols"><span>Arrivée</span><span>Heure</span><span>Voie</span><span>Wagons</span><span class="c">Train</span><span>Départ</span><span>Heure</span><span>HLR</span><span>Voie</span><span>Wagons</span><span>État</span></div>' +
      (trains.length ? trains.map(ligneTrain).join('') : '<div class="vide">Aucun train de ligne prévu aujourd\'hui.</div>') + '</div>';
  }
  function placer(id, html) {
    if (etat.html[id] === html) return false;
    etat.html[id] = html; document.getElementById(id).innerHTML = html;
    return true;
  }
  function rendre() {
    var d = etat.d; if (!d) return;
    $('#ecran').classList.remove('sans-donnees');
    $('#v-titre').textContent = d.titre || 'Circulations du jour';
    $('#v-date').textContent = d.jour ? d.jour.charAt(0).toUpperCase() + d.jour.slice(1) : '';
    var grille = $('#v-grille');
    grille.classList.toggle('navettes-seules', vue === 'navettes');
    grille.classList.toggle('trains-seuls', vue === 'trains');
    var nav = d.navettes || [], change = false;
    var c1 = vue === 'trains' ? '' : nav.slice(0, 1).map(panneauNavettes).join('');
    var c2 = vue === 'trains' ? '' : nav.slice(1).map(panneauNavettes).join('');
    change = placer('v-col1', c1) || change;
    change = placer('v-col2', c2) || change;
    change = placer('v-trains', vue === 'navettes' ? '' : panneauTrains(d.trains || [])) || change;
    $('#v-col1').hidden = !c1; $('#v-col2').hidden = !c2; $('#v-trains').hidden = vue === 'navettes';
    majFlash(d.flash);
    $('#v-maj').textContent = 'Mis à jour ' + (d.publieA ? d.publieA.slice(11) : '') + ' · version ' + d.version;
    if (change) ajuster();
  }

  // ----------------------------------------------------------- flash info
  function majFlash(f) {
    var texte = f && f.texte ? f.texte : '';
    if (texte === etat.flash) return;
    etat.flash = texte;
    var bloc = $('#v-flash'), t = $('#v-flash-txt');
    bloc.hidden = !texte;
    t.textContent = texte;
    if (!texte) return;
    t.style.animation = 'none';
    requestAnimationFrame(function () {
      var largeurFen = $('#v-flash-fen').clientWidth, largeurTxt = t.scrollWidth;
      var vitesse = Math.max(20, (etat.d && etat.d.vitesseFlash) || 90);
      t.style.setProperty('--depart', largeurFen + 'px');
      t.style.setProperty('--fin', (-largeurTxt) + 'px');
      t.style.setProperty('--duree', ((largeurFen + largeurTxt) / vitesse).toFixed(1) + 's');
      t.style.animation = '';
      ajuster();
    });
  }

  // ---------------------------------------- taille : tout doit tenir à l'écran
  function ajuster() {
    var racine = document.documentElement, ecran = $('#ecran');
    var base = Math.min(window.innerHeight / 52, window.innerWidth / 92);
    var taille = base * 1.15;
    racine.style.fontSize = taille + 'px';
    var garde = 0;
    var deborde = function () {
      if (ecran.scrollHeight > window.innerHeight + 1 || $('#v-grille').scrollHeight > $('#v-grille').clientHeight + 1) return true;
      var lignes = document.querySelectorAll('.panneau > .cols, .panneau > .r, .panneau > .tcols, .panneau > .t');
      for (var i = 0; i < lignes.length; i++) if (lignes[i].scrollWidth > lignes[i].clientWidth + 1) return true;
      return false;
    };
    while (garde++ < 40 && taille > base * 0.5 && deborde()) {
      taille *= 0.96; racine.style.fontSize = taille + 'px';
    }
  }
  window.addEventListener('resize', function () { etat.flash = '__'; ajuster(); if (etat.d) majFlash(etat.d.flash); });

  // ------------------------------------------------------- état de liaison
  function majLiaison() {
    var el = $('#v-direct'), al = $('#v-alerte'), ecran = $('#ecran');
    var maxSilence = Math.max((etat.d && etat.d.alerteSansNouvellesSecondes) || 45, source ? 120 : 0) * 1000;
    var message = '';
    if (!etat.d) {
      el.className = 'direct attente'; el.querySelector('span').textContent = etat.echecs ? 'Fichier de diffusion introuvable' : 'Connexion…';
      ecran.classList.add('sans-donnees');
      $('#v-attente').textContent = etat.echecs ? 'Fichier de diffusion introuvable. Vérifiez l\'accès au partage réseau et que le poste de saisie est démarré.' : 'En attente des données du poste de saisie…';
      al.hidden = true; return;
    }
    var coupure = true, donneesDe = etat.d.publieA ? etat.d.publieA.slice(11, 16) : '—';
    if (etat.echecs >= 3) message = (source ? 'Serveur injoignable (Internet ?)' : 'Partage réseau injoignable') + ' · affichage figé sur les données de ' + donneesDe;
    else if (Date.now() - etat.battementVuA > maxSilence) message = 'Poste de saisie à l\'arrêt ou injoignable · données de ' + donneesDe;
    else {
      coupure = false;
      if (etat.d.date !== SC.cleDate(new Date())) message = 'Données de la journée du ' + SC.libelleJour(etat.d.date) + ' : la nouvelle journée n\'est pas encore ouverte';
    }
    el.className = 'direct' + (coupure ? ' coupe' : '');
    el.querySelector('span').textContent = coupure ? 'Liaison interrompue' : 'Direct';
    ecran.classList.toggle('fige', coupure);
    al.hidden = !message; al.textContent = message;
  }

  // ------------------------------------------------------------- horloge
  function tic() {
    $('#v-heure').textContent = hm(maintenant());
  }
  function reveil() {
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () { /* refusé : sans effet */ }); } catch (e) { /* non disponible */ }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) reveil(); });

  tic(); setInterval(tic, 1000);
  charger(); setInterval(charger, source ? 5000 : 3000);
  setInterval(majLiaison, 2000);
  setInterval(function () { if (etat.d) rendre(); }, 15000);
  reveil(); ajuster(); majLiaison();
})();
