/* Récapitulatif de la journée en PDF (bouton « PDF du jour » de la saisie).
 * Même présentation que le récap du Suivi trains : bandeau, chiffres clés, puis les navettes par groupe, les trains de
 * ligne, la régularité et le journal des mouvements saisis. jsPDF est chargé à la demande (cdnjs), rien à installer. */
(function (racine) {
  'use strict';
  var JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  function charger() {
    if (racine.jspdf && racine.jspdf.jsPDF) return Promise.resolve(racine.jspdf.jsPDF);
    return new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = JSPDF; s.async = true;
      s.onload = function () { racine.jspdf && racine.jspdf.jsPDF ? ok(racine.jspdf.jsPDF) : ko(new Error('jsPDF absent')); };
      s.onerror = function () { ko(new Error('jsPDF non chargé (connexion ?)')); };
      document.head.appendChild(s);
    });
  }
  // polices standard de jsPDF (WinAnsi) : on remplace ce qu'elles ne savent pas écrire
  function sur(s) { return String(s == null ? '' : s).replace(/[→⏵▶]/g, '>').replace(/[←◀]/g, '<').replace(/[≤]/g, '<=').replace(/[≥]/g, '>=').replace(/[−–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF€’…Œœ]/g, ''); }

  /** Construit le document. o = { journee, planning, params, SC, travaux } */
  function construire(jsPDF, o) {
    var SC = o.SC, j = o.journee, planning = o.planning || {}, params = o.params || {};
    var doc = new jsPDF({ unit: 'mm', format: 'a4' }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var M = 12, CW = W - 2 * M, BAS = H - 14, y = M, PT = 0.3528;
    var C = { ink: '#0f2a5f', text: '#1f2937', muted: '#5b6577', border: '#d7dce6', band: '#eef4ff', head: '#f6f8fc', green: '#15803d', red: '#dc2626', amber: '#d97706', purple: '#7c3aed' };
    var rgb = function (h) { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]; };
    var font = function (t, st) { doc.setFont('helvetica', st || 'normal'); doc.setFontSize(t); };
    var txt = function (s, x, yy, op) {
      op = op || {}; font(op.size || 9, op.style); doc.setTextColor.apply(doc, rgb(op.color || C.text));
      var str = sur(s); if (op.maxW && doc.getTextWidth(str) > op.maxW) { while (str.length > 1 && doc.getTextWidth(str + '…') > op.maxW) str = str.slice(0, -1); str += '…'; }
      doc.text(str, x, yy, op.align && op.align !== 'left' ? { align: op.align } : undefined);
    };
    var boite = function (x, yy, w, h, fond, trait) { doc.setLineWidth(0.3); if (fond) doc.setFillColor.apply(doc, rgb(fond)); if (trait) doc.setDrawColor.apply(doc, rgb(trait)); doc.roundedRect(x, yy, w, h, 1.8, 1.8, fond && trait ? 'FD' : fond ? 'F' : 'S'); };
    var titreJour = SC.libelleJour(j.date) + ' ' + j.date.slice(0, 4);
    var bandeau = function (suite) {
      boite(M, 8, CW, 8, C.band, C.border);
      txt('RECAP DU JOUR - SUIVI DES CIRCULATIONS' + (suite ? ' (suite)' : ''), M + 4, 13.4, { size: 8.5, style: 'bold', color: '#1d4ed8' });
      txt(suite ? titreJour : 'Généré le ' + new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), M + CW - 4, 13.4, { size: 8, color: C.muted, align: 'right' });
    };
    var page = function () { doc.addPage(); bandeau(true); y = 21; };
    var place = function (h) { if (y + h > BAS) page(); };
    var section = function (t, sous, coul) {
      place(18); boite(M, y, CW, 8, C.head, C.border); doc.setFillColor.apply(doc, rgb(coul || '#1d4ed8')); doc.rect(M + 0.2, y + 1.3, 1.6, 5.4, 'F');
      txt(String(t).toUpperCase(), M + 5, y + 5.4, { size: 9.5, style: 'bold', color: C.ink }); if (sous) txt(sous, M + CW - 4, y + 5.3, { size: 7.5, color: C.muted, align: 'right' });
      y += 10;
    };
    // tableau : cols = [[titre, part de largeur, alignement]]
    var tableau = function (cols, lignes, coulLigne) {
      var xs = [], acc = M; cols.forEach(function (c) { xs.push(acc); acc += c[1] * CW; });
      var ligne = function (vals, op) {
        op = op || {}; place(6.2); if (op.fond) { doc.setFillColor.apply(doc, rgb(op.fond)); doc.rect(M, y, CW, 6, 'F'); }
        vals.forEach(function (v, k) {
          var c = cols[k], al = c[2] || (k === 0 ? 'left' : 'center'), x = al === 'left' ? xs[k] + 1.6 : al === 'right' ? xs[k] + c[1] * CW - 1.6 : xs[k] + c[1] * CW / 2;
          txt(v && v.t != null ? v.t : v, x, y + 4.1, { size: 7.6, style: op.gras || (v && v.gras) ? 'bold' : 'normal', color: (v && v.c) || (op.couleur) || C.text, align: al, maxW: c[1] * CW - 2.5 });
        });
        y += 6.2;
      };
      ligne(cols.map(function (c) { return c[0]; }), { fond: C.band, gras: true, couleur: C.ink });
      lignes.forEach(function (l, i) { ligne(l, { fond: i % 2 ? '#f8fafc' : null }); });
      y += 3;
    };
    var hm = function (v) { return v ? SC.hm(v) : '--:--'; };
    var ecart = function (theo, reel) {
      if (!theo || !reel) return { t: '-', c: C.muted };
      var d = SC.minutesEntre(reel, theo);
      return { t: (d > 0 ? '+' : '') + d + ' min', c: d > 15 ? C.red : d > 5 ? C.amber : C.green, gras: d > 5, d: d };
    };

    // ---- données
    var circs = (j.circulations || []).filter(function (c) { return c.etat !== 'supprime' || true; });
    var mvts = SC.mouvementsActifs(j).slice().sort(function (a, b) { return a.annonce < b.annonce ? -1 : a.annonce > b.annonce ? 1 : a.n - b.n; });
    var groupes = (planning.groupes || []);
    var parGroupe = {}; circs.forEach(function (c) { (parGroupe[c.groupe] = parGroupe[c.groupe] || []).push(c); });
    var ecarts = [];
    circs.forEach(function (c) { if (c.etat === 'supprime') return; var d = SC.etatCirculation(c, j), e = ecart(c.theo, d.reel); if (e.d != null) ecarts.push(e.d); });
    var faites = circs.filter(function (c) { return c.etat !== 'supprime' && SC.etatCirculation(c, j).reel; }).length, supp = circs.filter(function (c) { return c.etat === 'supprime'; }).length;
    var wagonsMvt = mvts.reduce(function (n, m) { return n + (parseInt(m.compo, 10) || 0); }, 0);
    var aLh = ecarts.filter(function (d) { return d <= 5; }).length;

    // ---- en-tête
    bandeau(false); y = 26;
    txt('Récap du jour - ' + titreJour, M, y, { size: 17, style: 'bold', color: C.ink });
    txt('LHTE', M + CW, y - 4, { size: 13, style: 'bold', color: C.ink, align: 'right' }); txt('Le Havre Terminal Exploitation', M + CW, y + 0.5, { size: 7.5, color: C.muted, align: 'right' });
    y += 6;
    var tuiles = [['CIRCULATIONS', String(circs.length), C.ink], ['REALISEES', String(faites), C.green], ['SUPPRIMEES', String(supp), supp ? C.red : C.muted],
      ["A L'HEURE <= 5 MIN", ecarts.length ? Math.round(100 * aLh / ecarts.length) + ' %' : '-', ecarts.length ? (aLh / ecarts.length >= 0.9 ? C.green : aLh / ecarts.length >= 0.75 ? C.amber : C.red) : C.muted],
      ['RETARDS > 15 MIN', String(ecarts.filter(function (d) { return d > 15; }).length), C.red], ['MOUVEMENTS', String(mvts.length), C.ink], ['WAGONS DEPLACES', String(wagonsMvt), C.ink]];
    var g = 2.4, tw = (CW - g * (tuiles.length - 1)) / tuiles.length;
    tuiles.forEach(function (t, i) {
      var x = M + i * (tw + g); boite(x, y, tw, 15, '#ffffff', C.border); doc.setFillColor.apply(doc, rgb(t[2])); doc.rect(x + 0.2, y + 3, 1.1, 9, 'F');
      txt(t[0], x + tw / 2, y + 5, { size: 5.6, style: 'bold', color: C.muted, align: 'center', maxW: tw - 3 }); txt(t[1], x + tw / 2, y + 11.6, { size: 12, style: 'bold', color: t[2], align: 'center' });
    });
    y += 21;
    if (j.flash && j.flash.actif && j.flash.texte) { place(9); boite(M, y, CW, 7.5, '#fff7ed', '#fdba74'); txt('Flash info : ' + j.flash.texte, M + 3, y + 5, { size: 8.5, color: '#9a3412', maxW: CW - 6 }); y += 10; }

    // ---- circulations par groupe (navettes puis trains de ligne)
    var ordre = groupes.filter(function (gr) { return parGroupe[gr.id]; }).sort(function (a, b) { return (a.famille === 'navette' ? 0 : 1) - (b.famille === 'navette' ? 0 : 1); });
    Object.keys(parGroupe).forEach(function (id) { if (!ordre.some(function (gr) { return gr.id === id; })) ordre.push({ id: id, libelle: id, famille: 'ligne' }); });
    ordre.forEach(function (gr) {
      var l = parGroupe[gr.id].slice().sort(function (a, b) { return String(a.theo) < String(b.theo) ? -1 : 1; });
      var coul = SC.couleurGroupe(gr, params.visuel || {}), nav = gr.famille === 'navette';
      section((nav ? 'Navettes ' : 'Trains de ligne - ') + (gr.libelle || gr.id), l.length + ' circulation' + (l.length > 1 ? 's' : ''), coul);
      tableau([['Code', 0.1], ['N°', 0.1], ['Sens', 0.08], ['Théorique', 0.1], ['Réel', 0.1], ['Écart', 0.1], ['Voie', 0.09], ['Wagons', 0.08], ['État', 0.25, 'left']],
        l.map(function (c) {
          var d = SC.etatCirculation(c, j), st = SC.statutCirculation(c, d, SC.iso(new Date()), (params.exploitation || {}).seuilRetardMinutes);
          var et = c.etat === 'supprime' ? { t: 'SUPPRIME', c: C.red, gras: true } : d.reel ? { t: SC.libelleStatut('fait', c.sens) + (c.cale ? ' (calé)' : ''), c: C.green } : { t: SC.libelleStatut(st, c.sens) || 'Prévu', c: st === 'retard' ? C.red : C.muted };
          return [{ t: c.code, gras: true }, d.num || c.numero || c.sillon || '', c.sens === 'D' ? 'Départ' : 'Arrivée', hm(c.theo), { t: hm(d.reel), c: d.reel ? C.text : C.muted }, c.etat === 'supprime' ? '-' : ecart(c.theo, d.reel), (d.voie || c.voiePrevue || '').toUpperCase(), d.wagons != null ? String(d.wagons) : (c.wagonsDemandes != null ? String(c.wagonsDemandes) : ''), et];
        }));
    });

    // ---- journal des mouvements
    section('Journal des mouvements', mvts.length + ' ligne' + (mvts.length > 1 ? 's' : '') + ' saisie' + (mvts.length > 1 ? 's' : ''), '#334155');
    if (!mvts.length) { txt('Aucun mouvement saisi.', M + 2, y + 3, { size: 9, style: 'italic', color: C.muted }); y += 8; }
    else tableau([['#', 0.05], ['Annonce', 0.08], ['N°', 0.11, 'left'], ['EF', 0.08], ['Voie', 0.08], ['Wagons', 0.1], ['Situation', 0.09], ['Vers', 0.08], ['Côté', 0.08], ['Réel', 0.07], ['Circulation', 0.18, 'left']],
      mvts.map(function (m) {
        var c = m.lien ? (j.circulations || []).filter(function (x) { return x.id === m.lien; })[0] : null;
        return [String(m.n), hm(m.annonce), { t: m.num, gras: true }, m.ef || '', String(m.voie || '').toUpperCase(), m.compo === 'hlp' ? 'hlp' : (m.compo ? m.compo + ' ' + (m.cv && m.cv !== '/' ? m.cv : '') : ''),
          m.sit || '', String(m.vers || '').toUpperCase(), m.cote === 'P' ? 'Paris' : m.cote === 'H' ? 'Le Havre' : '', hm(m.reel), c ? c.code + (m.comm ? ' - ' + m.comm : '') : (m.comm || '')];
      }));

    // ---- pied de page
    var n = doc.getNumberOfPages();
    for (var p = 1; p <= n; p++) {
      doc.setPage(p); doc.setDrawColor.apply(doc, rgb(C.border)); doc.line(M, H - 10, M + CW, H - 10);
      txt('LHTE - Suivi des circulations', M, H - 6, { size: 7.5, color: C.muted });
      txt('Récap du ' + SC.libelleDateCourte(j.date) + ' - page ' + p + ' / ' + n, M + CW, H - 6, { size: 7.5, color: C.muted, align: 'right' });
    }
    return doc;
  }
  racine.RecapPdf = {
    generer: function (o) { return charger().then(function (jsPDF) { var d = construire(jsPDF, o); d.save('recap-circulations-' + o.journee.date + '.pdf'); return d; }); },
    /** Document sans l'enregistrer : { doc, base64, nom } (PDF de fin de service envoyé au serveur). */
    produire: function (o) { return charger().then(function (jsPDF) { var d = construire(jsPDF, o); return { doc: d, nom: 'recap-circulations-' + o.journee.date + '.pdf', base64: d.output('datauristring') }; }); },
    construire: construire, charger: charger
  };
})(typeof window !== 'undefined' ? window : this);
