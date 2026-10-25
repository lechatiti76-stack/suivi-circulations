/*
 * Suivi des circulations - logique commune aux modes SAISIE et VISUEL.
 * Aucune dépendance. Utilisable dans le navigateur (window.SC) et sous Node (tests).
 * Les dates sont des chaînes locales "AAAA-MM-JJTHH:MM:SS" (sans fuseau).
 */
(function (racine, fabrique) {
  var SC = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = SC;
  else racine.SC = SC;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  var JOURS_COURTS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var SCHEMA_DIFFUSION = 1;

  // ------------------------------------------------------------------ dates
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function lireDate(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  function iso(d) {
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' +
      p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  }
  function cleDate(d) { return iso(d).slice(0, 10); }
  function ajouterJours(cle, n) { var d = lireDate(cle); d.setDate(d.getDate() + n); return cleDate(d); }
  /** Lundi = 1 ... dimanche = 7 (comme JOURSEM(...;2) dans Excel). */
  function jourSemaine(cle) { var d = lireDate(cle); return ((d.getDay() + 6) % 7) + 1; }
  function libelleJour(cle) {
    var d = lireDate(cle);
    return JOURS[jourSemaine(cle) - 1] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()];
  }
  function libelleDateCourte(cle) { var d = lireDate(cle); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function hm(s) { return s ? String(s).slice(11, 16) : ''; }
  /** Format des mails existants : 9h15. */
  function hhmm(s) { if (!s) return ''; var h = +String(s).slice(11, 13), m = String(s).slice(14, 16); return h + 'h' + m; }
  /** Accepte 915, 9:15, 9h15, 09.15, 9 ; renvoie "HH:MM" ou null. */
  function normHeure(txt) {
    var t = String(txt == null ? '' : txt).trim().toLowerCase().replace(/\s+/g, '');
    if (!t) return null;
    var m = /^(\d{1,2})(?:[:h.](\d{0,2}))?$/.exec(t);
    if (!m && /^\d{3,4}$/.test(t)) m = [t, t.slice(0, t.length - 2), t.slice(-2)];
    if (!m) return null;
    var h = +m[1], mi = m[2] ? +m[2] : 0;
    if (h > 23 || mi > 59 || (m[2] && m[2].length === 1)) return null;
    return p2(h) + ':' + p2(mi);
  }
  function combiner(cle, heure) { var h = normHeure(heure); return h ? cle + 'T' + h + ':00' : null; }
  /** Heure saisie "HH:MM" placée la veille, le jour même ou le lendemain, au plus près de la référence. */
  function heureProche(cle, heure, refIso) {
    var base = combiner(cle, heure);
    if (!base || !refIso) return base;
    var ref = lireDate(refIso).getTime(), best = base, ecartMin = Infinity;
    [-1, 0, 1].forEach(function (k) {
      var c = combiner(ajouterJours(cle, k), heure), e = Math.abs(lireDate(c).getTime() - ref);
      if (e < ecartMin) { ecartMin = e; best = c; }
    });
    return best;
  }
  function minutesEntre(a, b) { return Math.round((lireDate(a).getTime() - lireDate(b).getTime()) / 60000); }
  function fmtEcart(min) {
    if (min == null || isNaN(min)) return '';
    var a = Math.abs(min);
    return (min > 0 ? '+' : (min < 0 ? '−' : '')) + Math.floor(a / 60) + ':' + p2(a % 60);
  }
  function minutesDuJour(heure) { var h = normHeure(heure); return h ? (+h.slice(0, 2)) * 60 + (+h.slice(3, 5)) : null; }

  // ------------------------------------------------------------- utilitaires
  function copie(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function estNumeroTrain(num) { return /^\d{4,}$/.test(norm(num)); }
  function groupeDe(planning, id) {
    var g = (planning && planning.groupes) || [];
    for (var i = 0; i < g.length; i++) if (g[i].id === id) return g[i];
    return null;
  }
  function familleDe(planning, c) { var g = groupeDe(planning, c.groupe); return g ? g.famille : 'ligne'; }

  // --------------------------------------------------------- règles métier
  function normaliserVoie(v, params) {
    var s = norm(v);
    var alias = (params && params.aliasVoies) || {};
    return alias[s] || s;
  }
  function voieConnue(v, params) { return ((params && params.voies) || []).indexOf(normaliserVoie(v, params)) >= 0; }

  /** EF de la base de correspondances (Paramètres), sinon '' . */
  function efDeLaBase(num, params) {
    var s = norm(num), base = (params && params.correspondancesEF) || {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k) && norm(k) === s) return base[k];
    return '';
  }
  /** Base de correspondances d'abord, puis règles reprises de la colonne C du classeur (Nom de l'EF). */
  function deduireEF(num, journee, planning, params) {
    var s = norm(num);
    if (!s) return '';
    var connu = efDeLaBase(s, params);
    if (connu) return connu;
    var internes = (params && params.mouvementsInternes) || {};
    for (var ef in internes) if (Object.prototype.hasOwnProperty.call(internes, ef) && internes[ef].indexOf(s) >= 0) return ef;
    if (/^nrs/.test(s)) return 'NRS';
    if (/^\d+$/.test(s)) {
      if (s.charAt(1) === '0' && '964'.indexOf(s.charAt(2)) >= 0) return 'NRS';
      if (/^(11|51)/.test(s)) return 'NRS';
    }
    var c = journee ? trouverCirculation(journee, s) : null;
    if (c) { var g = groupeDe(planning, c.groupe); if (g && g.ef) return g.ef; }
    return '';
  }
  /** Règles reprises de la colonne G (Provenance / Destination). */
  function deduireZone(num) {
    var s = norm(num);
    if (!/^\d{4,}$/.test(s)) return '';
    var p = s.charAt(2) + s.charAt(3);
    var a = { '49': 'F. Soutien', '94': 'F. Soutien', '19': 'F.A.', '91': 'F.A.', '69': 'Maritime', '96': 'Maritime', '09': 'Soquence', '90': 'Soquence' };
    if (a[p]) return a[p];
    if (s.charAt(1) === '0' || s.charAt(1) === '2') return 'RFN';
    var b = { '79': 'Maprosol', '97': 'Maprosol', '39': 'Chevron', '93': 'Chevron', '89': 'Eramet', '98': 'Eramet', '29': 'TPF', '92': 'TPF' };
    return b[p] || '';
  }
  function deduireTraction(ef, params) {
    if (!ef) return '';
    return ((params && params.efElectriques) || []).indexOf(String(ef).toUpperCase()) >= 0 ? 'Élec.' : 'Th.';
  }

  // ------------------------------------------------------------- planning
  function appliquerVariantes(pc, jour) {
    var r = copie(pc);
    (pc.variantes || []).forEach(function (v) {
      if ((v.jours || []).indexOf(jour) >= 0) {
        ['hlr', 'heure', 'numero', 'sillon', 'wagonsDemandes', 'voiePrevue'].forEach(function (k) { if (v[k] !== undefined) r[k] = v[k]; });
      }
    });
    return r;
  }
  function numerosDe(c) {
    var out = [];
    [c.numero, c.sillon].forEach(function (n) { n = norm(n); if (n && out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  function instancier(pc, cle, planning) {
    var r = appliquerVariantes(pc, jourSemaine(cle));
    var fam = familleDe(planning, r);
    return {
      id: r.id, planId: r.id, groupe: r.groupe, code: r.code, sens: r.sens,
      numero: r.numero || '', sillon: r.sillon || '',
      hlr: normHeure(r.hlr) || '', theo: combiner(cle, r.heure),
      wagonsDemandes: r.wagonsDemandes == null || r.wagonsDemandes === '' ? null : +r.wagonsDemandes,
      voiePrevue: r.voiePrevue || '',
      rame: (fam === 'navette' && r.sens === 'D') ? 'attente' : null,
      etat: null, reel: null, mails: {}, deroule: {}, ajoutee: false
    };
  }
  /** Circulations prévues pour une date, selon les jours de circulation et les variantes. */
  function genererCirculations(planning, cle) {
    var jour = jourSemaine(cle);
    return ((planning && planning.circulations) || [])
      .filter(function (pc) { return (appliquerVariantes(pc, jour).jours || []).indexOf(jour) >= 0; })
      .map(function (pc) { return instancier(pc, cle, planning); });
  }
  function nouvelleJournee(planning, cle, prepVeille, maintenant) {
    var circ = prepVeille && prepVeille.date === cle && prepVeille.circulations ? copie(prepVeille.circulations) : genererCirculations(planning, cle);
    return {
      schema: 1, date: cle, version: 0, creeA: iso(maintenant || new Date()),
      mouvements: [], circulations: circ,
      flash: { actif: false, texte: '', jusqua: '' },
      demain: { date: ajouterJours(cle, 1), circulations: genererCirculations(planning, ajouterJours(cle, 1)) },
      cloture: null
    };
  }

  // ------------------------------------------------- journal et rapprochement
  function mouvementsActifs(j) { return (j.mouvements || []).filter(function (m) { return !m.supprime; }); }
  /** Circulation prévue correspondant à un numéro (n° interne ou sillon). Les circulations déjà réalisées passent après. */
  function trouverCirculation(j, num) {
    var s = norm(num);
    if (!s) return null;
    var cand = (j.circulations || []).filter(function (c) { return numerosDe(c).indexOf(s) >= 0 && c.etat !== 'supprime'; });
    if (!cand.length) return null;
    var libre = cand.filter(function (c) { return !etatCirculation(c, j).reel; });
    return (libre[0] || cand[0]);
  }
  /** Valeurs d'une circulation déduites des mouvements qui lui sont rattachés. */
  function etatCirculation(c, j) {
    var liens = mouvementsActifs(j).filter(function (m) { return m.lien === c.id; })
      .sort(function (a, b) { return a.annonce < b.annonce ? -1 : (a.annonce > b.annonce ? 1 : a.n - b.n); });
    var d = { annonce: liens.length ? liens[0].annonce : null, voie: null, wagons: null, cv: null, reel: c.reel || null, liens: liens.length };
    if (liens.length) d.voie = liens[liens.length - 1].voie || null;
    for (var i = liens.length - 1; i >= 0; i--) {
      if (/^\d+$/.test(String(liens[i].compo || ''))) { d.wagons = +liens[i].compo; d.cv = liens[i].cv || null; break; }
    }
    if (!d.reel) for (var k = 0; k < liens.length; k++) if (liens[k].reel) { d.reel = liens[k].reel; break; }
    return d;
  }
  /** Statut d'une circulation : supprime, fait, deja, annonce, retard, prevu. */
  function statutCirculation(c, d, maintenantIso, seuilMin) {
    if (c.etat === 'supprime') return 'supprime';
    if (d.reel) return 'fait';
    if (c.etat === 'deja') return 'deja';
    if (d.annonce) return 'annonce';
    if (c.theo && maintenantIso && minutesEntre(maintenantIso, c.theo) > (seuilMin == null ? 15 : seuilMin)) return 'retard';
    return 'prevu';
  }
  function libelleStatut(st, sens) {
    return { supprime: 'Supprimé', fait: sens === 'D' ? 'Parti' : 'Arrivé', deja: 'Déjà là', annonce: 'Annoncé', retard: 'Retard', prevu: 'Prévu' }[st] || '';
  }
  function derniereVoie(j, num) {
    var s = norm(num), mv = mouvementsActifs(j);
    for (var i = mv.length - 1; i >= 0; i--) if (norm(mv[i].num) === s) return mv[i].vers || mv[i].voie || '';
    return '';
  }
  function prochainNumeroLigne(j) {
    var n = 0;
    (j.mouvements || []).forEach(function (m) { if (m.n > n) n = m.n; });
    return n + 1;
  }
  /** Mouvement interne (locomotive, manœuvre NRS) : pas un numéro de train. */
  function estMouvementInterne(num, params) {
    var s = norm(num), internes = (params && params.mouvementsInternes) || {};
    for (var ef in internes) if (Object.prototype.hasOwnProperty.call(internes, ef) && internes[ef].indexOf(s) >= 0) return true;
    return /^(loco|nrs)/.test(s);
  }
  /** La voie de destination est-elle obligatoire pour ce numéro ? (Paramètres › saisie.versObligatoire) */
  function versObligatoire(num, params) {
    var regle = (params && params.saisie && params.saisie.versObligatoire) || 'internes';
    if (regle === 'toujours') return true;
    if (regle === 'jamais') return false;
    return estMouvementInterne(num, params);
  }
  /** Contrôle d'un champ de la saisie ; renvoie le message d'erreur ou ''. */
  function verifierChamp(champ, m, params) {
    var v = String(m[champ] == null ? '' : m[champ]).trim().toLowerCase();
    if (champ === 'num') return v ? '' : 'Le numéro est obligatoire.';
    if (champ === 'voie') return !v ? 'La voie est obligatoire.' : (voieConnue(v, params) ? '' : 'Voie « ' + v + ' » inconnue.');
    if (champ === 'compo') return !v ? 'Wagons : un nombre ou « hlp ».' : (v === 'hlp' || /^\d{1,3}$/.test(v) ? '' : 'Wagons : un nombre ou « hlp ».');
    if (champ === 'vers') {
      if (!v) return versObligatoire(m.num, params) ? 'La voie de destination est obligatoire pour ' + norm(m.num) + '.' : '';
      return voieConnue(v, params) ? '' : 'Voie de destination « ' + v + ' » inconnue.';
    }
    return '';
  }
  /** Contrôles avant enregistrement d'un mouvement. */
  function verifierMouvement(m, j, params, idIgnore) {
    var erreurs = [], avert = [];
    ['num', 'voie', 'compo', 'vers'].forEach(function (k) { var e = verifierChamp(k, m, params); if (e) erreurs.push(e); });
    var c = String(m.compo || '').trim().toLowerCase();
    if (/^\d+$/.test(c) && +c > 80) avert.push('Plus de 80 wagons : à vérifier.');
    if (m.reel && m.annonce && minutesEntre(m.reel, m.annonce) < 0) avert.push('Heure réelle antérieure à l\'annonce.');
    if (estNumeroTrain(m.num)) {
      var dbl = mouvementsActifs(j).filter(function (x) { return x.id !== idIgnore && norm(x.num) === norm(m.num); })[0];
      if (dbl) avert.push('Numéro déjà saisi ligne ' + dbl.n + ' à ' + hm(dbl.annonce) + '.');
    }
    return { erreurs: erreurs, avertissements: avert };
  }

  // ------------------------------------------------------------ diffusion
  function voieAffichee(c, d) {
    var v = (d.reel || d.annonce) ? d.voie : c.voiePrevue;
    return v ? String(v).toUpperCase() : '';
  }
  function ligneDiffusee(c, d, fam) {
    return {
      id: c.id, code: c.code, sens: c.sens,
      numero: fam === 'navette' ? (c.numero || c.sillon) : (c.sillon || c.numero),
      theo: c.theo || null, hlr: c.hlr || '',
      annonce: !!d.annonce, reel: d.reel || null,
      wagons: d.wagons != null ? d.wagons : (c.wagonsDemandes != null ? c.wagonsDemandes : null),
      voie: voieAffichee(c, d),
      rame: (fam === 'navette' && c.sens === 'D' && !d.reel && c.etat !== 'supprime') ? (c.rame || null) : null,
      etat: c.etat === 'supprime' || c.etat === 'deja' ? c.etat : null
    };
  }
  function trierParHeure(a, b) { return (a.theo || '9') < (b.theo || '9') ? -1 : ((a.theo || '9') > (b.theo || '9') ? 1 : 0); }
  /** Regroupe arrivées et départs d'un même code en rotations, comme la feuille « tri trains 2 ». */
  function rotations(circs) {
    var parCode = {}, ordre = [];
    circs.forEach(function (c) {
      var k = c.groupe + '|' + c.code;
      if (!parCode[k]) { parCode[k] = { A: [], D: [] }; ordre.push(k); }
      parCode[k][c.sens === 'D' ? 'D' : 'A'].push(c);
    });
    var out = [];
    ordre.forEach(function (k) {
      var r = parCode[k]; r.A.sort(trierParHeure); r.D.sort(trierParHeure);
      for (var i = 0; i < Math.max(r.A.length, r.D.length); i++) out.push({ groupe: k.split('|')[0], code: k.split('|')[1], arrivee: r.A[i] || null, depart: r.D[i] || null });
    });
    out.sort(function (x, y) {
      var a = (x.arrivee && x.arrivee.theo) || (x.depart && x.depart.theo) || '9';
      var b = (y.arrivee && y.arrivee.theo) || (y.depart && y.depart.theo) || '9';
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return out;
  }
  /**
   * Contenu du fichier diffusé aux écrans. Liste blanche : seuls ces champs quittent le poste de saisie.
   * Ni mouvements, ni EF, ni situation des voies, ni commentaires, ni mails, ni annuaire.
   */
  function projeterDiffusion(j, planning, params, maintenantIso) {
    var maint = maintenantIso || iso(new Date());
    var groupes = (planning && planning.groupes) || [];
    var vis = (params && params.visuel) || {};
    var navettes = [], trains = [];
    var demainVisible = vis.afficherDemain !== false && j.demain && hm(maint) >= (normHeure(vis.demainAPartirDe) || '00:00');
    groupes.forEach(function (g) {
      var circs = (j.circulations || []).filter(function (c) { return c.groupe === g.id; });
      if (g.famille === 'navette') {
        var lignes = circs.slice().sort(trierParHeure).map(function (c) { return ligneDiffusee(c, etatCirculation(c, j), 'navette'); });
        var dem = [];
        if (demainVisible) {
          dem = (j.demain.circulations || []).filter(function (c) { return c.groupe === g.id; }).sort(trierParHeure)
            .map(function (c) { return ligneDiffusee(c, { annonce: null, reel: null, voie: null, wagons: null }, 'navette'); });
        }
        navettes.push({ id: g.id, libelle: g.libelle, couleur: couleurGroupe(g, vis), lignes: lignes, demain: dem });
      } else {
        rotations(circs).forEach(function (r) {
          trains.push({
            groupe: g.libelle, code: r.code,
            arrivee: r.arrivee ? ligneDiffusee(r.arrivee, etatCirculation(r.arrivee, j), 'ligne') : null,
            depart: r.depart ? ligneDiffusee(r.depart, etatCirculation(r.depart, j), 'ligne') : null
          });
        });
      }
    });
    trains.sort(function (x, y) {
      var a = (x.arrivee && x.arrivee.theo) || (x.depart && x.depart.theo) || '9';
      var b = (y.arrivee && y.arrivee.theo) || (y.depart && y.depart.theo) || '9';
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    var f = j.flash || {};
    var flashActif = f.actif && norm(f.texte) && (!f.jusqua || hm(maint) < f.jusqua || maint.slice(0, 10) < j.date);
    return {
      schema: SCHEMA_DIFFUSION,
      date: j.date, jour: libelleJour(j.date),
      demain: j.demain ? JOURS[jourSemaine(j.demain.date) - 1] : '',
      titre: vis.titre || 'Circulations du jour',
      seuilRetardMinutes: (params && params.exploitation && params.exploitation.seuilRetardMinutes) || 15,
      vitesseFlash: vis.vitesseFlash || 90,
      alerteSansNouvellesSecondes: vis.alerteSansNouvellesSecondes || 45,
      version: j.version, publieA: maint,
      navettes: navettes, trains: trains,
      flash: flashActif ? { texte: String(f.texte).trim(), jusqua: f.jusqua || '' } : null
    };
  }
  var COULEURS_NAVETTES = { TDF: '#F28C28', TN: '#2D8CFF', ATL: '#F2C230' };
  var COULEURS_SECOURS = ['#2EB872', '#B07CFF', '#FF6FA8'];
  /** Couleur d'un groupe de navettes : Paramètres › visuel.couleurs, sinon TDF orange, TN bleu, ATL jaune. */
  function couleurGroupe(g, vis) {
    var c = (vis && vis.couleurs && vis.couleurs[g.id]) || g.couleur || COULEURS_NAVETTES[g.id];
    if (c) return c;
    var h = 0; String(g.id).split('').forEach(function (ch) { h = (h + ch.charCodeAt(0)) % COULEURS_SECOURS.length; });
    return COULEURS_SECOURS[h];
  }
  /**
   * État affiché sur les écrans, avec le compte à rebours. cle : supprime, fait, deja, imminent, bientot, attendu, retard, prevu.
   * « Annoncé » devient « Arrivée imminente » ou « Départ imminent » ; dans les 30 minutes : « Arrive dans 12 min ».
   */
  function etatAffichage(l, maintenantIso, seuilMin) {
    var seuil = seuilMin == null ? 15 : seuilMin, arr = l.sens !== 'D';
    if (l.etat === 'supprime') return { cle: 'supprime', libelle: 'Supprimé' };
    if (l.reel) return { cle: 'fait', libelle: (arr ? 'Arrivé ' : 'Parti ') + hm(l.reel) };
    if (l.etat === 'deja') return { cle: 'deja', libelle: 'Déjà là' };
    if (l.annonce) return { cle: 'imminent', libelle: arr ? 'Arrivée imminente' : 'Départ imminent' };
    if (!l.theo) return { cle: 'prevu', libelle: 'Prévu' };
    var m = minutesEntre(l.theo, maintenantIso);
    if (m > 30) return { cle: 'prevu', libelle: 'Prévu' };
    if (m > 0) return { cle: 'bientot', libelle: (arr ? 'Arrive dans ' : 'Départ dans ') + m + ' min', minutes: m };
    if (-m <= seuil) return { cle: 'attendu', libelle: arr ? 'Attendu' : 'Départ attendu' };
    return { cle: 'retard', libelle: 'Retard ' + fmtEcart(-m) };
  }
  /** Statut d'une ligne diffusée, recalculé par l'écran avec sa propre horloge. */
  function statutDiffuse(l, maintenantIso, seuilMin) {
    if (!l) return '';
    if (l.etat === 'supprime') return 'supprime';
    if (l.reel) return 'fait';
    if (l.etat === 'deja') return 'deja';
    if (l.annonce) return 'annonce';
    if (l.theo && minutesEntre(maintenantIso, l.theo) > (seuilMin == null ? 15 : seuilMin)) return 'retard';
    return 'prevu';
  }

  // ---------------------------------------------------------------- mails
  var TYPES_MAIL = ['navetteDepart', 'ligneArrivee', 'ligneDepart'];
  function typeMail(c, planning) {
    var fam = familleDe(planning, c);
    if (fam === 'navette') return c.sens === 'D' ? 'navetteDepart' : null;
    return c.sens === 'D' ? 'ligneDepart' : 'ligneArrivee';
  }
  function modeMail(type, params) {
    var m = (params && params.mails) || {};
    return (m.modes && m.modes[type]) || m.mode || 'simulation';
  }
  function remplir(modele, v, html) {
    return String(modele || '').replace(/\{(\w+)\}/g, function (_, k) { return v[k] == null ? '' : (html ? esc(v[k]) : String(v[k])); });
  }
  var DEROULE = [
    ['conducteur', 'Arrivée du conducteur sur le terminal à'],
    ['miseEnTete', 'Mise en tête à'],
    ['bonDepart', 'Annonce « Bon au départ » à'],
    ['retourRegulateur', 'Retour du régulateur à'],
    ['ouvertureSignal', 'Ouverture du signal à']
  ];
  /** Construit le mail d'une circulation réalisée, ou null si aucun destinataire ou envoi désactivé. */
  function construireMail(j, c, planning, params, suffixe) {
    var type = typeMail(c, planning);
    if (!type) return null;
    var mode = modeMail(type, params);
    if (mode === 'desactive') return null;
    var g = groupeDe(planning, c.groupe) || {};
    var m = (params && params.mails) || {};
    var listes = m.listes || {};
    var to = (g.listeMail && listes[g.listeMail]) || [];
    if (!to.length) return null;
    var d = etatCirculation(c, j);
    if (!d.reel) return null;
    var v = {
      code: c.code, sillon: c.sillon || c.numero, numero: c.numero || c.sillon, destinataire: g.destinataire || g.libelle || '',
      heure: hhmm(d.reel), date: libelleDateCourte(j.date), jj: j.date.slice(8, 10), site: (params && params.site) || ''
    };
    var mod = (m.modeles && m.modeles[type]) || {};
    var deroule = '';
    if (type === 'ligneDepart') {
      var renseigne = DEROULE.filter(function (e) { return c.deroule && c.deroule[e[0]]; });
      if (renseigne.length || mode === 'brouillon') {
        deroule = '<p><u>Déroulé des évènements :</u></p><ul>' + DEROULE.map(function (e) {
          return '<li>' + esc(e[1]) + ' ' + esc((c.deroule && c.deroule[e[0]]) ? c.deroule[e[0]].replace(':', 'h') : '') + '</li>';
        }).join('') + '</ul>';
      }
    }
    var html = '<html><body style="font-family:Calibri,Arial,sans-serif;font-size:12pt;">' +
      '<p>' + remplir(mod.intro, v, true) + '</p>' +
      '<p style="font-size:15pt;margin:10px 0;"><strong><span style="color:#483D8B;">' + remplir(mod.ligne, v, true) + '</span></strong></p>' +
      deroule + '<br><!--signature--></body></html>';
    return {
      id: (j.date + '_' + c.id + '_' + type + (suffixe ? '_' + suffixe : '')).replace(/[^A-Za-z0-9_.-]/g, '-'),
      type: type, mode: mode,
      to: to, cc: type === 'navetteDepart' ? (m.copieNavettes || []) : [],
      bcc: type !== 'navetteDepart' && m.listeCopieCacheeLignes ? (listes[m.listeCopieCacheeLignes] || []) : [],
      sujet: remplir(mod.sujet, v, false), html: html
    };
  }
  var STATUTS_MAIL_OK = ['envoye', 'brouillon', 'simule', 'deja'];
  /** Circulations réalisées dont le mail n'est pas encore parti. */
  function mailsEnAttente(j, planning, params) {
    return (j.circulations || []).filter(function (c) {
      var type = typeMail(c, planning);
      if (!type || c.etat === 'supprime') return false;
      if (!etatCirculation(c, j).reel) return false;
      var st = c.mails && c.mails[type];
      if (st && STATUTS_MAIL_OK.indexOf(st.statut) >= 0) return false;
      if (st && st.statut === 'erreur' && (st.essais || 0) >= 5) return false;
      return !!construireMail(j, c, planning, params);
    });
  }

  // ------------------------------------------------- statistiques et archives
  function statistiques(j, planning, params) {
    var coupure = minutesDuJour((params && params.exploitation && params.exploitation.coupurePoste) || '13:30');
    var mv = mouvementsActifs(j);
    var s = {
      date: j.date, mouvements: mv.length, trainsNumerotes: 0, manoeuvresNrs: 0, hlp: 0,
      locom: { matin: { hlp: 0, charge: 0 }, apresMidi: { hlp: 0, charge: 0 } },
      locosup: { matin: { hlp: 0, charge: 0 }, apresMidi: { hlp: 0, charge: 0 } },
      circulationsPrevues: 0, realisees: 0, supprimees: 0, dejaLa: 0, retardMoyenNavettes: null, retardMaxNavettes: null
    };
    mv.forEach(function (m) {
      var n = norm(m.num), hlp = norm(m.compo) === 'hlp';
      if (hlp) s.hlp++;
      if (estNumeroTrain(n)) s.trainsNumerotes++;
      if (/^nrs/.test(n)) s.manoeuvresNrs++;
      var mobile = n === 'locom' || n === 'loco' ? 'locom' : (n === 'locosup' || n === 'locosupp' ? 'locosup' : null);
      if (mobile) {
        var poste = minutesDuJour(hm(m.annonce)) < coupure ? 'matin' : 'apresMidi';
        s[mobile][poste][hlp ? 'hlp' : 'charge']++;
      }
    });
    var retards = [];
    (j.circulations || []).forEach(function (c) {
      s.circulationsPrevues++;
      var d = etatCirculation(c, j);
      if (c.etat === 'supprime') s.supprimees++;
      else if (d.reel) {
        s.realisees++;
        if (familleDe(planning, c) === 'navette' && c.theo) retards.push(minutesEntre(d.reel, c.theo));
      } else if (c.etat === 'deja') s.dejaLa++;
    });
    if (retards.length) {
      s.retardMoyenNavettes = Math.round(retards.reduce(function (a, b) { return a + b; }, 0) / retards.length);
      s.retardMaxNavettes = Math.max.apply(null, retards);
    }
    return s;
  }
  function csvCellule(v) {
    var t = v == null ? '' : String(v);
    return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function csv(lignes) { return lignes.map(function (l) { return l.map(csvCellule).join(';'); }).join('\r\n') + '\r\n'; }
  function exporterMouvements(j, planning, params) {
    var rows = [['n', 'date', 'annonce', 'numero', 'ef', 'traction', 'zone', 'voie', 'wagons', 'charges_vides', 'situation_voie', 'vers', 'reel', 'commentaire', 'circulation', 'supprime']];
    (j.mouvements || []).forEach(function (m) {
      var c = m.lien ? (j.circulations || []).filter(function (x) { return x.id === m.lien; })[0] : null;
      rows.push([m.n, j.date, hm(m.annonce), m.num, m.ef, deduireTraction(m.ef, params), deduireZone(m.num), m.voie, m.compo, m.cv, m.sit, m.vers, hm(m.reel), m.comm,
        c ? c.code + ' (' + (groupeDe(planning, c.groupe) || {}).libelle + ')' : '', m.supprime ? 'oui' : '']);
    });
    return csv(rows);
  }
  function exporterCirculations(j, planning) {
    var rows = [['date', 'groupe', 'code', 'sens', 'numero', 'sillon', 'hlr', 'theorique', 'annonce', 'reel', 'ecart_min', 'voie', 'wagons', 'wagons_demandes', 'etat', 'mail']];
    (j.circulations || []).forEach(function (c) {
      var d = etatCirculation(c, j), st = statutCirculation(c, d, null, 15);
      var type = typeMail(c, planning), mail = type && c.mails && c.mails[type] ? c.mails[type].statut : '';
      rows.push([j.date, (groupeDe(planning, c.groupe) || {}).libelle || c.groupe, c.code, c.sens === 'D' ? 'départ' : 'arrivée', c.numero, c.sillon, c.hlr,
        hm(c.theo), hm(d.annonce), hm(d.reel), d.reel && c.theo ? minutesEntre(d.reel, c.theo) : '', d.voie || '', d.wagons == null ? '' : d.wagons,
        c.wagonsDemandes == null ? '' : c.wagonsDemandes, st === 'retard' || st === 'prevu' ? 'non réalisé' : libelleStatut(st, c.sens).toLowerCase(), mail]);
    });
    return csv(rows);
  }
  var ENTETE_STATS = ['date', 'mouvements', 'trains_numerotes', 'manoeuvres_nrs', 'hlp',
    'locom_hlp_matin', 'locom_charge_matin', 'locom_hlp_apres_midi', 'locom_charge_apres_midi',
    'locosup_hlp_matin', 'locosup_charge_matin', 'locosup_hlp_apres_midi', 'locosup_charge_apres_midi',
    'circulations_prevues', 'realisees', 'supprimees', 'deja_la', 'retard_moyen_navettes_min', 'retard_max_navettes_min'];
  function ligneStatistiques(s) {
    return [s.date, s.mouvements, s.trainsNumerotes, s.manoeuvresNrs, s.hlp,
      s.locom.matin.hlp, s.locom.matin.charge, s.locom.apresMidi.hlp, s.locom.apresMidi.charge,
      s.locosup.matin.hlp, s.locosup.matin.charge, s.locosup.apresMidi.hlp, s.locosup.apresMidi.charge,
      s.circulationsPrevues, s.realisees, s.supprimees, s.dejaLa,
      s.retardMoyenNavettes == null ? '' : s.retardMoyenNavettes, s.retardMaxNavettes == null ? '' : s.retardMaxNavettes].map(csvCellule).join(';');
  }

  // ------------------------------------------------------ planning : variantes
  /** Texte lisible des variantes : "lun,mar: hlr=07:00; sam: heure=08:06". */
  function variantesEnTexte(vs) {
    return (vs || []).map(function (v) {
      var champs = Object.keys(v).filter(function (k) { return k !== 'jours'; }).map(function (k) { return k + '=' + (v[k] == null ? '' : v[k]); });
      return (v.jours || []).map(function (n) { return JOURS_COURTS[n - 1]; }).join(',') + ': ' + champs.join(', ');
    }).join('; ');
  }
  function texteEnVariantes(t) {
    var out = [];
    String(t || '').split(';').forEach(function (bloc) {
      bloc = bloc.trim(); if (!bloc) return;
      var i = bloc.indexOf(':'); if (i < 0) throw new Error('Variante sans « : » : ' + bloc);
      var jours = bloc.slice(0, i).split(',').map(function (x) {
        var k = JOURS_COURTS.indexOf(norm(x).slice(0, 3)); if (k < 0) throw new Error('Jour inconnu : ' + x); return k + 1;
      });
      var v = { jours: jours };
      bloc.slice(i + 1).split(',').forEach(function (kv) {
        kv = kv.trim(); if (!kv) return;
        var e = kv.indexOf('='); if (e < 0) throw new Error('Attendu champ=valeur : ' + kv);
        var k = kv.slice(0, e).trim(), val = kv.slice(e + 1).trim();
        if (['hlr', 'heure', 'numero', 'sillon', 'voiePrevue', 'wagonsDemandes'].indexOf(k) < 0) throw new Error('Champ inconnu : ' + k);
        if (k === 'hlr' || k === 'heure') { var h = normHeure(val); if (!h) throw new Error('Heure invalide : ' + val); val = h; }
        if (k === 'wagonsDemandes') { if (val === '' || val === 'null') val = null; else if (/^\d+$/.test(val)) val = +val; else throw new Error('Wagons invalides : ' + val); }
        v[k] = val;
      });
      out.push(v);
    });
    return out;
  }

  /**
   * Mémorise les wagons demandés et voies prévues d'une journée comme habitude de son jour de semaine
   * (variante du planning). Renvoie le nouveau planning et le nombre de circulations modifiées.
   */
  function memoriserHabitudes(planning, circs, cle) {
    var jour = jourSemaine(cle), p = copie(planning), n = 0;
    (circs || []).forEach(function (c) {
      var pc = (p.circulations || []).filter(function (x) { return x.id === c.planId; })[0];
      if (!pc) return;
      var base = appliquerVariantes(pc, jour);
      var w = c.wagonsDemandes == null || c.wagonsDemandes === '' ? null : +c.wagonsDemandes, voie = c.voiePrevue || '';
      var bw = base.wagonsDemandes == null || base.wagonsDemandes === '' ? null : +base.wagonsDemandes;
      if (bw === w && (base.voiePrevue || '') === voie) return;
      pc.variantes = pc.variantes || [];
      var va = pc.variantes.filter(function (x) { return (x.jours || []).length === 1 && x.jours[0] === jour; })[0];
      if (!va) { va = { jours: [jour] }; pc.variantes.push(va); }
      va.wagonsDemandes = w; va.voiePrevue = voie; n++;
    });
    return { planning: p, modifiees: n };
  }

  return {
    JOURS: JOURS, JOURS_COURTS: JOURS_COURTS, TYPES_MAIL: TYPES_MAIL, DEROULE: DEROULE, ENTETE_STATS: ENTETE_STATS,
    p2: p2, lireDate: lireDate, iso: iso, cleDate: cleDate, ajouterJours: ajouterJours, jourSemaine: jourSemaine,
    libelleJour: libelleJour, libelleDateCourte: libelleDateCourte, hm: hm, hhmm: hhmm, normHeure: normHeure, combiner: combiner,
    heureProche: heureProche, minutesEntre: minutesEntre, fmtEcart: fmtEcart, minutesDuJour: minutesDuJour,
    copie: copie, esc: esc, norm: norm, estNumeroTrain: estNumeroTrain, groupeDe: groupeDe, familleDe: familleDe,
    normaliserVoie: normaliserVoie, voieConnue: voieConnue, efDeLaBase: efDeLaBase, deduireEF: deduireEF, deduireZone: deduireZone, deduireTraction: deduireTraction,
    estMouvementInterne: estMouvementInterne, versObligatoire: versObligatoire, verifierChamp: verifierChamp,
    appliquerVariantes: appliquerVariantes, numerosDe: numerosDe, instancier: instancier, genererCirculations: genererCirculations, nouvelleJournee: nouvelleJournee,
    mouvementsActifs: mouvementsActifs, trouverCirculation: trouverCirculation, etatCirculation: etatCirculation, statutCirculation: statutCirculation,
    libelleStatut: libelleStatut, derniereVoie: derniereVoie, prochainNumeroLigne: prochainNumeroLigne, verifierMouvement: verifierMouvement,
    rotations: rotations, projeterDiffusion: projeterDiffusion, statutDiffuse: statutDiffuse, etatAffichage: etatAffichage, couleurGroupe: couleurGroupe,
    typeMail: typeMail, modeMail: modeMail, construireMail: construireMail, mailsEnAttente: mailsEnAttente, STATUTS_MAIL_OK: STATUTS_MAIL_OK,
    statistiques: statistiques, csv: csv, exporterMouvements: exporterMouvements, exporterCirculations: exporterCirculations, ligneStatistiques: ligneStatistiques,
    variantesEnTexte: variantesEnTexte, texteEnVariantes: texteEnVariantes, memoriserHabitudes: memoriserHabitudes
  };
});
