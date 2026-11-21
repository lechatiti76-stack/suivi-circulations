/* Suivi des circulations - STATISTIQUES DE LA JOURNÉE (bouton « Statistiques » de la saisie).
 * Tableau de bord : chiffres clés, ponctualité par groupe, activité heure par heure, locomotives et manœuvres,
 * voies et entreprises, retards et suppressions. Tout est calculé à partir de la journée affichée ; rien n'est
 * enregistré ici (la ligne de statistiques.csv reste écrite à la clôture, comme avant).
 * Point d'entrée : StatsSaisie.rendre(element, { journee, planning, params, SC }). */
(function (racine) {
  'use strict';
  var BANDES = [ // écart au départ / à l'arrivée par rapport à l'heure prévue
    { cle: 'ok', lib: "À l'heure (≤ 5 min)", coul: '#16a34a' },
    { cle: 'leger', lib: '6 à 15 min', coul: '#f59e0b' },
    { cle: 'retard', lib: '> 15 min', coul: '#dc2626' }
  ];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pct(a, b) { return b ? Math.round(100 * a / b) : null; }
  function fmtMin(m) { if (m == null || isNaN(m)) return '—'; var s = m > 0 ? '+' : m < 0 ? '−' : ''; return s + Math.abs(m) + ' min'; }

  function calculer(o) {
    var SC = o.SC, j = o.journee, planning = o.planning, params = o.params || {};
    var coupure = SC.minutesDuJour((params.exploitation && params.exploitation.coupurePoste) || '13:30') || 810;
    var mv = SC.mouvementsActifs(j), base = SC.statistiques(j, planning, params);
    var heures = []; for (var h = 0; h < 24; h++) heures.push({ trains: 0, internes: 0, autres: 0 });
    var voies = {}, efs = {}, wagons = 0, charges = 0, vides = 0;
    mv.forEach(function (m) {
      var n = SC.norm(m.num), min = SC.minutesDuJour(SC.hm(m.reel || m.annonce)), interne = /^(locom|loco|locosup|locosupp|nrs)/.test(n);
      if (min != null) heures[Math.floor(min / 60)][SC.estNumeroTrain(n) ? 'trains' : interne ? 'internes' : 'autres']++;
      if (m.voie) voies[String(m.voie).toUpperCase()] = (voies[String(m.voie).toUpperCase()] || 0) + 1;
      var w = /^\d+$/.test(String(m.compo || '')) ? +m.compo : 0;
      if (w && !interne) {
        wagons += w; if (/vide/i.test(m.cv || '')) vides += w; else charges += w;
        var ef = String(m.ef || 'Sans EF').toUpperCase(); efs[ef] = efs[ef] || { mouvements: 0, wagons: 0 }; efs[ef].mouvements++; efs[ef].wagons += w;
      }
    });
    var groupes = {}, arriveesTrains = [], retards = [], supprimees = [], realisees = 0, prevues = 0, ecarts = [], bandes = { ok: 0, leger: 0, retard: 0 };
    (j.circulations || []).forEach(function (c) {
      if (c.etat === 'nonprevu') return;
      prevues++;
      var g = SC.groupeDe(planning, c.groupe) || { id: c.groupe, libelle: c.groupe, famille: 'ligne' };
      var k = g.famille === 'navette' ? g.id : 'LIGNE', G = groupes[k] || (groupes[k] = { lib: g.famille === 'navette' ? g.libelle : 'Trains de ligne', coul: g.famille === 'navette' ? SC.couleurGroupe(g, params.visuel) : '#8E5CF7', prevues: 0, realisees: 0, supprimees: 0, ecarts: [], bandes: { ok: 0, leger: 0, retard: 0 } });
      G.prevues++;
      var d = SC.etatCirculation(c, j);
      if (c.etat === 'supprime') { G.supprimees++; supprimees.push({ c: c, g: g }); return; }
      if (!d.reel) return;
      realisees++; G.realisees++;
      // arrivée d'un train de ligne : on note seulement son heure (pas de retard, il ne dépend pas du terminal)
      if (g.famille !== 'navette' && c.sens === 'A') { arriveesTrains.push({ c: c, g: g, reel: d.reel, voie: d.voie, wagons: d.wagons }); return; }
      if (!c.theo) return;
      var e = SC.minutesEntre(d.reel, c.theo), b = e <= 5 ? 'ok' : e <= 15 ? 'leger' : 'retard';
      ecarts.push(e); G.ecarts.push(e); bandes[b]++; G.bandes[b]++;
      if (e > 5) retards.push({ c: c, g: g, e: e, reel: d.reel, voie: d.voie });
    });
    var moy = function (l) { return l.length ? Math.round(l.reduce(function (a, b) { return a + b; }, 0) / l.length) : null; };
    var med = function (l) { if (!l.length) return null; var s = l.slice().sort(function (a, b) { return a - b; }), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
    Object.keys(groupes).forEach(function (k) { var G = groupes[k]; G.moy = moy(G.ecarts); G.ponct = pct(G.bandes.ok, G.ecarts.length); });
    retards.sort(function (a, b) { return b.e - a.e; });
    return {
      base: base, coupure: coupure, heures: heures, mouvements: mv.length, wagons: wagons, charges: charges, vides: vides,
      voies: Object.keys(voies).map(function (v) { return [v, voies[v]]; }).sort(function (a, b) { return b[1] - a[1]; }),
      efs: Object.keys(efs).map(function (e) { return [e, efs[e]]; }).sort(function (a, b) { return b[1].wagons - a[1].wagons; }),
      arriveesTrains: arriveesTrains.sort(function (a, b) { return a.reel < b.reel ? -1 : 1; }), groupes: groupes, prevues: prevues, realisees: realisees, supprimees: supprimees, retards: retards,
      mesurees: ecarts.length, bandes: bandes, moy: moy(ecarts), med: med(ecarts), max: ecarts.length ? Math.max.apply(null, ecarts) : null,
      ponct: pct(bandes.ok, ecarts.length)
    };
  }

  function tuile(lib, val, sous, ton) {
    return '<div class="stx-tuile' + (ton ? ' ' + ton : '') + '"><span class="stx-lib">' + lib + '</span><b>' + val + '</b>' + (sous ? '<small>' + sous + '</small>' : '') + '</div>';
  }
  function barreEmpilee(b, total) {
    if (!total) return '<div class="stx-empile nulle"><span style="width:100%"></span></div>';
    return '<div class="stx-empile">' + BANDES.map(function (x) { var n = b[x.cle]; return n ? '<span style="width:' + (100 * n / total).toFixed(2) + '%;background:' + x.coul + '" title="' + esc(x.lib) + ' : ' + n + '"></span>' : ''; }).join('') + '</div>';
  }
  function barresH(liste, max, coul, fmt) {
    if (!liste.length) return '<p class="stx-vide">Rien à afficher pour l\'instant.</p>';
    return '<div class="stx-barres">' + liste.map(function (r) {
      return '<div class="stx-bl"><span class="stx-bn">' + esc(r[0]) + '</span><span class="stx-bt"><i style="width:' + Math.max(3, 100 * r[1] / (max || 1)).toFixed(1) + '%;background:' + (r[2] || coul) + '"></i></span><b>' + (fmt ? fmt(r) : r[1]) + '</b></div>';
    }).join('') + '</div>';
  }

  function rendre(el, o) {
    var S = calculer(o), SC = o.SC, j = o.journee, b = S.base;
    var maintenant = new Date(), jourMeme = SC.cleDate(maintenant) === j.date;
    var tonPonct = S.ponct == null ? '' : S.ponct >= 90 ? 'bon' : S.ponct >= 75 ? 'moyen' : 'mauvais';
    // ----- chiffres clés
    var kpi = '<div class="stx-kpi">' +
      tuile('Mouvements saisis', S.mouvements, b.trainsNumerotes + ' trains · ' + b.manoeuvresNrs + ' NRS · ' + b.hlp + ' HLP') +
      tuile('Circulations réalisées', S.realisees + '<span>/' + S.prevues + '</span>', (pct(S.realisees, S.prevues) == null ? '—' : pct(S.realisees, S.prevues) + ' %') + ' du programme') +
      tuile('Ponctualité', S.ponct == null ? '—' : S.ponct + ' %', S.mesurees ? S.bandes.ok + ' sur ' + S.mesurees + ' à ≤ 5 min' : 'aucune heure réelle', tonPonct) +
      tuile('Écart moyen', fmtMin(S.moy), 'médiane ' + fmtMin(S.med) + ' · max ' + fmtMin(S.max), S.moy != null && S.moy > 15 ? 'mauvais' : '') +
      tuile('Wagons traités', S.wagons, S.charges + ' chargés · ' + S.vides + ' vides') +
      tuile('Supprimées', S.supprimees.length, S.supprimees.length ? S.supprimees.map(function (x) { return x.c.code; }).slice(0, 4).join(', ') : 'aucune', S.supprimees.length ? 'mauvais' : '') +
      '</div>';
    // ----- ponctualité par groupe
    var ks = Object.keys(S.groupes).sort(function (a, c) { return a === 'LIGNE' ? 1 : c === 'LIGNE' ? -1 : a.localeCompare(c); });
    var ponct = '<section class="stx-carte large"><h5>Ponctualité par groupe</h5>' +
      '<div class="stx-legende">' + BANDES.map(function (x) { return '<span><i style="background:' + x.coul + '"></i>' + x.lib + '</span>'; }).join('') + '</div>' +
      '<table class="stx-table"><thead><tr><th>Groupe</th><th>Réalisées</th><th style="width:38%">Répartition des écarts</th><th>Ponctualité</th><th>Écart moyen</th></tr></thead><tbody>' +
      ks.map(function (k) {
        var G = S.groupes[k];
        return '<tr><td><span class="stx-pastille" style="background:' + esc(G.coul) + '"></span><b>' + esc(G.lib) + '</b></td><td class="mono">' + G.realisees + '/' + G.prevues + (G.supprimees ? ' <small class="stx-rouge">' + G.supprimees + ' suppr.</small>' : '') + '</td>' +
          '<td>' + barreEmpilee(G.bandes, G.ecarts.length) + '</td><td class="mono"><b class="' + (G.ponct == null ? '' : G.ponct >= 90 ? 'stx-vert' : G.ponct >= 75 ? 'stx-orange' : 'stx-rouge') + '">' + (G.ponct == null ? '—' : G.ponct + ' %') + '</b></td><td class="mono">' + fmtMin(G.moy) + '</td></tr>';
      }).join('') + '<tr class="stx-total"><td><b>Journée</b></td><td class="mono">' + S.realisees + '/' + S.prevues + '</td><td>' + barreEmpilee(S.bandes, S.mesurees) + '</td><td class="mono"><b>' + (S.ponct == null ? '—' : S.ponct + ' %') + '</b></td><td class="mono">' + fmtMin(S.moy) + '</td></tr></tbody></table></section>';
    // ----- activité heure par heure
    var debut = 23, fin = 0; S.heures.forEach(function (x, h) { if (x.trains + x.internes + x.autres) { debut = Math.min(debut, h); fin = Math.max(fin, h); } });
    if (debut > fin) { debut = 6; fin = 20; } debut = Math.max(0, Math.min(debut, 5)); fin = Math.max(fin, 21);
    var maxH = Math.max.apply(null, S.heures.map(function (x) { return x.trains + x.internes + x.autres; }).concat([1]));
    var hc = Math.floor(S.coupure / 60), pointe = S.heures.reduce(function (m, x, h) { var t = x.trains + x.internes + x.autres; return t > m.n ? { h: h, n: t } : m; }, { h: null, n: 0 });
    var act = '<section class="stx-carte large"><h5>Activité heure par heure <small>' + (pointe.n ? 'pointe à ' + pointe.h + ' h (' + pointe.n + ' mouvements)' : '') + '</small></h5>' +
      '<div class="stx-legende"><span><i style="background:#1d4ed8"></i>Trains numérotés</span><span><i style="background:#0d9488"></i>Locomotives et NRS</span><span><i style="background:#94a3b8"></i>Autres</span><span><i class="stx-trait"></i>Coupure ' + esc((o.params.exploitation || {}).coupurePoste || '13:30') + '</span></div>' +
      '<div class="stx-histo">' + S.heures.slice(debut, fin + 1).map(function (x, i) {
        var h = debut + i, t = x.trains + x.internes + x.autres, H = function (n) { return (100 * n / maxH).toFixed(1) + '%'; };
        var actuelle = jourMeme && h === maintenant.getHours();
        return '<div class="stx-col' + (h === hc ? ' coupure' : '') + (actuelle ? ' maintenant' : '') + '" title="' + h + ' h : ' + t + ' mouvement(s) — ' + x.trains + ' trains, ' + x.internes + ' locomotives/NRS, ' + x.autres + ' autres">' +
          '<span class="stx-n">' + (t || '') + '</span><div class="stx-pile"><i style="height:' + H(x.autres) + ';background:#94a3b8"></i><i style="height:' + H(x.internes) + ';background:#0d9488"></i><i style="height:' + H(x.trains) + ';background:#1d4ed8"></i></div><span class="stx-h">' + h + '</span></div>';
      }).join('') + '</div></section>';
    // ----- locomotives
    var lc = [['LHTE (locom)', b.locom], ['Locosup', b.locosup], ['NRS', b.nrs]];
    var maxL = Math.max.apply(null, lc.map(function (x) { return Math.max(x[1].matin.hlp + x[1].matin.charge, x[1].apresMidi.hlp + x[1].apresMidi.charge); }).concat([1]));
    var loco = '<section class="stx-carte"><h5>Locomotives et manœuvres</h5><div class="stx-legende"><span><i style="background:#0d9488"></i>En charge</span><span><i style="background:#99f6e4"></i>HLP</span></div>' +
      lc.map(function (x) {
        var p = function (lib, q) { var t = q.hlp + q.charge; return '<div class="stx-bl"><span class="stx-bn">' + lib + '</span><span class="stx-bt"><i style="width:' + (100 * q.charge / maxL).toFixed(1) + '%;background:#0d9488"></i><i style="width:' + (100 * q.hlp / maxL).toFixed(1) + '%;background:#99f6e4"></i></span><b>' + t + '</b></div>'; };
        var tot = x[1].matin.hlp + x[1].matin.charge + x[1].apresMidi.hlp + x[1].apresMidi.charge;
        return '<div class="stx-loco"><div class="stx-loco-t"><b>' + x[0] + '</b><span>' + tot + ' mouvement' + (tot > 1 ? 's' : '') + '</span></div><div class="stx-barres">' + p('Matin', x[1].matin) + p('Après-midi', x[1].apresMidi) + '</div></div>';
      }).join('') + '</section>';
    // ----- voies et EF
    var vs = S.voies.slice(0, 8), voies = '<section class="stx-carte"><h5>Voies les plus utilisées</h5>' + barresH(vs, vs.length ? vs[0][1] : 1, '#1d4ed8') + '</section>';
    var ef = S.efs.slice(0, 8), efs = '<section class="stx-carte"><h5>Wagons par entreprise</h5>' + barresH(ef.map(function (e) { return [e[0], e[1].wagons, SC.couleurGroupe({ id: e[0] }, (o.params || {}).visuel)]; }), ef.length ? ef[0][1].wagons : 1, '#7c3aed',
      function (r) { return r[1] + ' <small>wg</small>'; }) + '</section>';
    // ----- retards et suppressions
    // arrivées des trains de ligne : l'heure seulement (leur retard n'entre pas dans les statistiques)
    var arr = '<section class="stx-carte large"><h5>Arrivées des trains de ligne <small>' + S.arriveesTrains.length + ' arrivée' + (S.arriveesTrains.length > 1 ? 's' : '') + ' · heure d\'arrivée seulement, sans calcul de retard</small></h5>' +
      (S.arriveesTrains.length ? '<div class="stx-arrivees">' + S.arriveesTrains.map(function (a) {
        return '<div class="stx-arr"><b class="mono">' + SC.hm(a.reel) + '</b><span><b>' + esc(a.c.numero || a.c.sillon || a.c.code) + '</b> ' + esc(SC.nomTrain(a.c.code, o.params)) + '</span><small>' + esc(a.g.libelle || '') + (a.voie ? ' · voie ' + esc(String(a.voie).toUpperCase()) : '') + (a.wagons != null ? ' · ' + a.wagons + ' wg' : '') + '</small></div>';
      }).join('') + '</div>' : '<p class="stx-vide">Aucune arrivée de train de ligne pour l\'instant.</p>') + '</section>';
    var lr = S.retards.slice(0, 12), ret = '<section class="stx-carte large"><h5>Retards de plus de 5 min et suppressions <small>' + (S.retards.length + S.supprimees.length ? S.retards.length + ' retard' + (S.retards.length > 1 ? 's' : '') + ' · ' + S.supprimees.length + ' suppression' + (S.supprimees.length > 1 ? 's' : '') : '') + '</small></h5>' +
      (lr.length || S.supprimees.length ? '<table class="stx-table"><thead><tr><th>Circulation</th><th>Sens</th><th>Prévu</th><th>Réel</th><th>Écart</th><th>Voie</th></tr></thead><tbody>' +
        lr.map(function (r) {
          return '<tr><td><span class="stx-pastille" style="background:' + esc(r.g.famille === 'navette' ? SC.couleurGroupe(r.g, (o.params || {}).visuel) : '#8E5CF7') + '"></span><b>' + esc(r.c.code) + '</b> <small>' + esc(r.c.numero || r.c.sillon || '') + '</small></td><td>' + (r.c.sens === 'D' ? 'Départ' : 'Arrivée') + '</td>' +
            '<td class="mono">' + SC.hm(r.c.theo) + '</td><td class="mono">' + SC.hm(r.reel) + '</td><td><span class="stx-ecart ' + (r.e > 15 ? 'rouge' : 'orange') + '">' + fmtMin(r.e) + '</span></td><td class="mono">' + esc(r.voie || '') + '</td></tr>';
        }).join('') + S.supprimees.map(function (x) { return '<tr class="stx-suppr"><td><b>' + esc(x.c.code) + '</b></td><td>' + (x.c.sens === 'D' ? 'Départ' : 'Arrivée') + '</td><td class="mono">' + SC.hm(x.c.theo) + '</td><td colspan="3"><span class="stx-ecart gris">Supprimée</span></td></tr>'; }).join('') +
        '</tbody></table>' : '<p class="stx-vide stx-ok">✓ Aucun retard de plus de 5 minutes ni aucune suppression.</p>') + '</section>';
    el.innerHTML = '<div class="stx">' +
      '<div class="stx-tete"><div><b>' + esc(SC.libelleJour(j.date)) + '</b><span>' + (jourMeme ? 'Journée en cours · chiffres à ' + SC.p2(maintenant.getHours()) + ':' + SC.p2(maintenant.getMinutes()) : 'Journée terminée') + '</span></div></div>' +
      kpi + '<div class="stx-grille">' + ponct + arr + act + loco + voies + efs + ret + '</div></div>';
  }
  racine.StatsSaisie = { rendre: rendre, calculer: calculer };
})(typeof window !== 'undefined' ? window : globalThis);
