/*
 * Suivi des circulations - mode VISUEL.
 * Données : ?source=<adresse du serveur Google> (version GitHub), sinon diffusion.js à côté de la page.
 * Lecture seule : cette page n'écrit rien. Paramètre d'adresse ?vue=navettes | trains | tout.
 */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var esc = SC.esc, hm = SC.hm;
  var vue = (/[?&]vue=(\w+)/.exec(location.search) || [])[1] || 'tout';
  var source = (function () { var m = /[?&]source=([^&]+)/.exec(location.search); return m ? decodeURIComponent(m[1]) : ''; })();
  var etat = { d: null, cle: '', battement: null, battementVuA: 0, echecs: 0, flash: '', version: null };

  // ------------------------------------------------------------ réception
  window.__diffusion = function (d, meta) {
    if (!d || d.schema !== 1) return;
    etat.echecs = 0;
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

  // ------------------------------------------------------------- cellules
  function maintenant() { return SC.iso(new Date()); }
  function classeEcart(min) { return min < 0 ? 'tot' : (min > 15 ? 'tres-tard' : (min > 0 ? 'tard' : '')); }
  function celluleEcart(l, e) {
    if (l.reel && l.theo) { var m = SC.minutesEntre(l.reel, l.theo); return '<span class="ec ' + classeEcart(m) + '">' + SC.fmtEcart(m) + '</span>'; }
    // en route : retard estimé à l'arrivée, d'après l'heure de départ de l'origine
    if (e.ecartEta != null) return e.ecartEta ? '<span class="ec ' + classeEcart(e.ecartEta) + '">' + SC.fmtEcart(e.ecartEta) + '</span>' : '<span class="ec">à l\'heure</span>';
    if ((e.cle === 'retard' || e.cle === 'attendu' || e.cle === 'imminent') && l.theo) {
      var r = SC.minutesEntre(maintenant(), l.theo);
      if (r > 0) return '<span class="ec ' + classeEcart(r) + '">' + SC.fmtEcart(r) + '</span>';
    }
    if (l.hlr && l.sens === 'D' && e.cle !== 'supprime') return '<span class="ec hlr"><small>HLR</small>' + esc(l.hlr) + '</span>';
    return '<span></span>';
  }
  function celluleHeure(l, barre) {
    var h = l.reel ? hm(l.reel) : hm(l.theo);
    if (!h) return '<span class="h">—</span>';
    return '<span class="h' + (barre ? ' barre' : '') + '">' + h + '<small>' + (l.reel ? 'réel' : 'prévu') + '</small></span>';
  }
  function celluleEtat(e) {
    var avance = e.cle === 'bientot' ? (30 - e.minutes) / 30 : (e.cle === 'route' ? e.progression : null);
    var barre = avance != null ? '<span class="avance" style="width:' + Math.round(avance * 100) + '%"></span>' : '';
    var sous = e.sous ? '<small class="sous">' + esc(e.sous) + (e.eta && e.cle !== 'attendu' && e.cle !== 'retard' ? ' · arr. ' + hm(e.eta) : '') + '</small>' : '';
    return '<span class="etat"><span class="st ' + e.cle + '">' + esc(e.libelle) + barre + '</span>' + sous + '</span>';
  }
  function celluleVoie(l) { return '<span class="vo">' + esc(l.voie || '') + '</span>'; }

  // ------------------------------------------------------------- navettes
  function rvb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null;
    var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function melange(a, b, part) { return a.map(function (v, i) { return Math.round(v * part + b[i] * (1 - part)); }); }
  function enHex(c) { return '#' + c.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  /** Encre la plus lisible sur un fond (contraste WCAG), blanc à contraste presque égal. */
  function encreSur(fond) {
    if (!fond) return '#ffffff';
    var l = fond.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    var lum = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
    return (lum + 0.05) / 0.0555 > 1.05 / (lum + 0.05) + 0.3 ? '#14100a' : '#ffffff';
  }
  /** Fond des lignes de départ (couleur pleine) et d'arrivée (un ton plus sombre), encre commune au groupe. */
  function couleursGroupe(el, hex) {
    var c = rvb(hex) || [242, 140, 40], dep = melange(c, [0, 0, 0], 0.86), arr = melange(c, [13, 26, 38], 0.68);
    el.style.setProperty('--c', enHex(c));
    el.style.setProperty('--ce', encreSur(c));
    el.style.setProperty('--fd', enHex(dep));
    el.style.setProperty('--fa', enHex(arr));
    el.style.setProperty('--el', encreSur(dep));
  }
  function ligneNavette(l, parcours) {
    var e = SC.etatAffichage(l, maintenant(), etat.d.seuilRetardMinutes, parcours);
    return '<div class="r ' + (l.sens === 'D' ? 'dep' : 'arr') + '" data-k="' + esc(l.id) + '">' +
      '<span class="code">' + esc(l.code) + '</span>' +
      '<span class="sens">' + (l.sens === 'D' ? 'Dép.' : 'Arr.') + '</span>' +
      celluleHeure(l, e.cle === 'supprime') + celluleEcart(l, e) +
      '<span class="wg">' + (l.wagons != null ? esc(l.wagons) + ' wgs' : '') + '</span>' +
      celluleVoie(l) + celluleEtat(e) + '</div>';
  }
  /** Prochaines navettes : les départs seulement (LF1, LF2…), quatre par rangée, puis le texte libre de la saisie. */
  function blocProchaines(g) {
    var liste = g.demain || [], departs = liste.filter(function (l) { return l.sens === 'D'; });
    var cartes = (departs.length ? departs : liste).map(function (l) {
      var detail = [l.wagons != null ? l.wagons + ' wagons' : '', l.voie || ''].filter(Boolean).join(' · ');
      return '<div class="rot' + (l.etat === 'supprime' ? ' supprimee' : '') + '"><div class="rl"><b>' + esc(l.code) + '</b><span>' + esc(hm(l.theo) || '—') + '</span></div>' +
        (detail ? '<i>' + esc(detail) + '</i>' : '') + '</div>';
    });
    // demainLibelle absent : diffusion publiée par une saisie pas encore rechargée
    var libelle = g.demainLibelle || (liste.length ? 'Demain · ' + (etat.d.demain || '') : '');
    return '<div class="demain"><div class="demain-tete">Prochaines navettes' + (libelle ? ' · ' + esc(libelle) : '') + '</div>' +
      (cartes.length ? '<div class="rots" style="--r:' + Math.min(4, cartes.length) + '">' + cartes.join('') + '</div>' : '') +
      (g.demainNote ? '<div class="demain-note">' + esc(g.demainNote) + '</div>' : '') + '</div>';
  }
  function blocNavettes(g) {
    var fait = g.lignes.filter(function (l) { return l.reel; }).length;
    var html = '<div class="nav-tete"><h2>' + esc(g.libelle) + '</h2><span>' + (g.lignes.length ? fait + ' / ' + g.lignes.length + ' réalisées' : 'aucune aujourd\'hui') + '</span></div>';
    if (g.lignes.length) {
      html += '<div class="cols"><span>Code</span><span>Sens</span><span>Heure</span><span>Écart</span><span>Wagons</span><span>Voie</span><span>État</span></div>' +
        '<div class="lignes">' + g.lignes.map(function (l) { return ligneNavette(l, g.parcours); }).join('') + '</div>';
    }
    if ((g.demain && g.demain.length) || g.demainNote) html += blocProchaines(g);
    else if (!g.lignes.length) html += '<div class="vide">Aucune navette prévue.</div>';
    return html;
  }

  // ------------------------------------------------------- trains de ligne
  function ligneTrain(t) {
    var a = t.arrivee, d = t.depart, s = etat.d.seuilRetardMinutes, n = maintenant();
    var ea = a ? SC.etatAffichage(a, n, s, t.parcours) : null, ed = d ? SC.etatAffichage(d, n, s) : null;
    var nom = t.nom || t.code;
    var arr = a ? '<span class="num' + (ea.cle === 'supprime' ? ' barre' : '') + '">' + esc(a.numero || '') + '</span>' + celluleEtat(ea) +
      celluleHeure(a, ea.cle === 'supprime') + '<span class="vo">' + esc(ea.cle === 'supprime' ? '' : (a.voie || '')) + '</span>'
      : '<span></span><span></span><span></span><span></span>';
    // au centre : provenance à gauche, entreprise au milieu, destination à droite
    var centre = '<span class="tcentre"><span class="tville">' + (a ? '<small>En provenance de</small>' + esc(nom) : '') + '</span>' +
      '<span class="tef">' + esc(t.groupe) + '</span>' +
      '<span class="tville dest">' + (d ? '<small>À destination de</small>' + esc(nom) : '') + '</span></span>';
    var dep = d ? '<span class="num' + (ed.cle === 'supprime' ? ' barre' : '') + '">' + esc(d.numero || '') + '</span>' + celluleHeure(d, ed.cle === 'supprime') +
      '<span class="ec hlr">' + (d.hlr && !d.reel && ed.cle !== 'supprime' ? esc(d.hlr) : '') + '</span>' +
      '<span class="vo">' + esc(ed.cle === 'supprime' ? '' : (d.voie || '')) + '</span>' + celluleEtat(ed)
      : '<span></span><span></span><span></span><span></span><span></span>';
    return '<div class="t" data-k="' + esc(t.groupe + '|' + t.code + '|' + ((a && a.id) || '') + '|' + ((d && d.id) || '')) + '">' + arr + centre + dep + '</div>';
  }
  function blocTrains(trains) {
    return '<div class="p-tete"><h2>Trains de ligne</h2><span>Arrivée · train · départ</span></div>' +
      (trains.length ? '<div class="tcols"><span>N°</span><span>Arrivée</span><span>Heure</span><span>Voie</span><span class="c">Provenance · entreprise · destination</span>' +
        '<span>N°</span><span>Heure</span><span>HLR</span><span>Voie</span><span>Départ</span></div>' +
        '<div class="lignes">' + trains.map(ligneTrain).join('') + '</div>'
        : '<div class="vide">Aucun train de ligne prévu aujourd\'hui.</div>');
  }

  // ------------------------------------------------ mises à jour sans clignotement
  /** Remplace seulement ce qui a changé ; une ligne identique garde son animation en cours. */
  function majBloc(el, html) {
    if (el.__html === html) return false;
    var tmp = document.createElement('div'); tmp.innerHTML = html;
    var anc = el.querySelector('.lignes'), neu = tmp.querySelector('.lignes');
    var memeStructure = anc && neu && el.children.length === tmp.children.length &&
      Array.prototype.every.call(tmp.children, function (c, i) { return c.className === el.children[i].className; });
    if (memeStructure && anc.children.length === neu.children.length &&
      Array.prototype.every.call(neu.children, function (c, i) { return c.getAttribute('data-k') === anc.children[i].getAttribute('data-k'); })) {
      Array.prototype.forEach.call(tmp.children, function (c, i) { if (c.className !== 'lignes' && c.outerHTML !== el.children[i].outerHTML) el.replaceChild(c.cloneNode(true), el.children[i]); });
      Array.prototype.forEach.call(neu.children, function (c, i) { if (c.outerHTML !== anc.children[i].outerHTML) anc.replaceChild(c.cloneNode(true), anc.children[i]); });
    } else {
      el.innerHTML = html;
    }
    el.__html = html;
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
    var change = false, zone = $('#v-navettes'), nav = d.navettes || [];
    zone.style.setProperty('--n', Math.max(1, nav.length));
    while (zone.children.length > nav.length) zone.removeChild(zone.lastChild);
    nav.forEach(function (g, i) {
      var el = zone.children[i];
      if (!el) { el = document.createElement('div'); el.className = 'nav'; zone.appendChild(el); }
      couleursGroupe(el, g.couleur);
      change = majBloc(el, blocNavettes(g)) || change;
    });
    var trains = $('#v-trains');
    trains.className = 'trains panneau';
    change = majBloc(trains, blocTrains(d.trains || [])) || change;
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
    if (!texte) { ajuster(); return; }
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
  function deborde() {
    var g = $('#v-grille');
    if (g.scrollHeight > g.clientHeight + 1) return true;
    var blocs = document.querySelectorAll('.nav, .panneau');
    for (var b = 0; b < blocs.length; b++) if (blocs[b].scrollHeight > blocs[b].clientHeight + 1) return true;
    var lignes = document.querySelectorAll('.cols, .r, .tcols, .t');
    for (var i = 0; i < lignes.length; i++) if (lignes[i].scrollWidth > lignes[i].clientWidth + 1) return true;
    return false;
  }
  function ajuster() {
    var racine = document.documentElement;
    var base = Math.min(window.innerHeight / 50, window.innerWidth / 90);
    var taille = base * 1.12, garde = 0;
    racine.style.fontSize = taille + 'px';
    while (garde++ < 50 && taille > base * 0.45 && deborde()) { taille *= 0.96; racine.style.fontSize = taille + 'px'; }
  }
  window.addEventListener('resize', function () { etat.flash = '__'; ajuster(); if (etat.d) majFlash(etat.d.flash); });

  // ------------------------------------------------------- état de liaison
  function majLiaison() {
    var el = $('#v-direct'), al = $('#v-alerte'), ecran = $('#ecran');
    var maxSilence = Math.max((etat.d && etat.d.alerteSansNouvellesSecondes) || 45, source ? 120 : 0) * 1000;
    var message = '';
    if (!etat.d) {
      el.className = 'direct attente'; el.querySelector('span').textContent = etat.echecs ? 'Données introuvables' : 'Connexion…';
      ecran.classList.add('sans-donnees');
      $('#v-attente').textContent = etat.echecs ? (source ? 'Serveur injoignable ou sans données : vérifiez Internet et que le poste de saisie a été ouvert.' : 'Fichier de diffusion introuvable. Vérifiez l\'accès au partage réseau et que le poste de saisie est démarré.') : 'En attente des données du poste de saisie…';
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
    if (al.hidden !== !message || al.textContent !== message) { al.hidden = !message; al.textContent = message; ajuster(); }
  }

  // ------------------------------------- mise à jour automatique de la page
  /** Après une publication sur GitHub, l'écran se recharge seul (aucun clavier nécessaire sur le PC des TV). */
  function verifierVersion() {
    if (!/^https?:/.test(location.protocol)) return;
    fetch('version.txt?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : null; }).then(function (v) {
      if (v == null) return;
      v = v.trim();
      if (etat.version === null) etat.version = v;
      else if (v !== etat.version) location.reload();
    }).catch(function () { /* sans effet */ });
  }

  // ------------------------------------------------------------- horloge
  function tic() { $('#v-heure').textContent = hm(maintenant()); }
  function reveil() {
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () { /* refusé : sans effet */ }); } catch (e) { /* non disponible */ }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) reveil(); });

  tic(); setInterval(tic, 1000);
  charger(); setInterval(charger, source ? 5000 : 3000);
  setInterval(majLiaison, 2000);
  setInterval(function () { if (etat.d) rendre(); }, 15000);
  verifierVersion(); setInterval(verifierVersion, 300000);
  reveil(); ajuster(); majLiaison();
})();
