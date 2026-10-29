/*
 * Tests du serveur Google Apps Script (apps-script/Code.gs) sur le simulateur des services Google.
 * Lancement : node tests/test-apps-script.js
 */
'use strict';
var assert = require('assert');
var simulateur = require('./simulateur-apps-script.js');

var reussis = 0, echecs = 0;
function test(nom, fn) {
  try { fn(); reussis++; console.log('  ok   ' + nom); }
  catch (e) { echecs++; console.log('  ÉCHEC ' + nom + '\n        ' + (e && e.stack || e)); }
}
function corpsJournee(base, etat, diffusion) {
  return JSON.stringify({ baseVersion: base, evenement: { type: 'test', resume: 'essai' } }) + '\n' + JSON.stringify(etat) + '\n' + (diffusion ? JSON.stringify(diffusion) : '');
}

console.log('Sécurité');
test('clé d\'origine non changée : tout est refusé avec un message clair', function () {
  var g = simulateur.charger(null);
  var r = g.appel('GET', '/api/sante', null, 'CHANGER-CE-MOT-DE-PASSE');
  assert.strictEqual(r.status, 403); assert.ok(/Choisissez une clé/.test(r.data.erreur));
});
test('mauvaise clé refusée, requête illisible refusée', function () {
  var g = simulateur.charger('secret-essai');
  assert.strictEqual(g.appel('GET', '/api/sante', null, 'autre').status, 403);
  assert.strictEqual(JSON.parse(g.doPost('pas du json').getContent()).status, 400);
});
test('lecture publique limitée à la diffusion et à l\'état du service', function () {
  var g = simulateur.charger('secret-essai');
  assert.ok(/en service/.test(g.doGet({}).getContent()));
  assert.strictEqual(JSON.parse(g.doGet({ action: 'sante' }).getContent()).service, 'ok');
  assert.deepStrictEqual(JSON.parse(g.doGet({ action: 'diffusion' }).getContent()).diffusion, null);
});

console.log('Configuration et journées');
var G = simulateur.charger('secret-essai');
test('serveur neuf : configuration vide, dossier Drive créé', function () {
  var r = G.appel('GET', '/api/config');
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.data.parametres, {});
  assert.strictEqual(r.data.planning.circulations.length, 0); assert.strictEqual(r.data.service.mode, 'google');
  assert.ok(G.etat.proprietes.DOSSIER_ID);
});
test('import des paramètres et du planning, copie .precedent', function () {
  assert.strictEqual(G.appel('PUT', '/api/parametres', JSON.stringify({ voies: ['vf1'], mails: { mode: 'simulation' } })).status, 200);
  assert.strictEqual(G.appel('PUT', '/api/planning', JSON.stringify({ schema: 1, groupes: [], circulations: [{ id: 'A' }] })).status, 200);
  assert.strictEqual(G.appel('PUT', '/api/parametres', JSON.stringify({ voies: ['vf1', 'vf2'], mails: { mode: 'simulation' } })).status, 200);
  var r = G.appel('GET', '/api/config');
  assert.deepStrictEqual(r.data.parametres.voies, ['vf1', 'vf2']); assert.strictEqual(r.data.planning.circulations.length, 1);
  var noms = Object.keys(G.etat.fichiers).map(function (k) { return G.etat.fichiers[k].nom; });
  assert.ok(noms.indexOf('parametres.json.precedent') >= 0);
  assert.strictEqual(G.appel('PUT', '/api/planning', '{ cassé').status, 400);
});
var etat = { date: '2026-10-22', version: 1, mouvements: [], circulations: [] };
var diffusion = { schema: 1, date: '2026-10-22', navettes: [], trains: [], flash: { texte: 'Essai é à ç' } };
test('journée versionnée : enregistrement, conflit, relecture, liste', function () {
  var r = G.appel('PUT', '/api/journee/2026-10-22', corpsJournee(0, etat, diffusion));
  assert.strictEqual(r.status, 200); assert.strictEqual(r.data.version, 1);
  r = G.appel('PUT', '/api/journee/2026-10-22', corpsJournee(0, etat, null));
  assert.strictEqual(r.status, 409); assert.strictEqual(r.data.version, 1);
  etat.version = 2; etat.mouvements.push({ n: 1, num: 'locom' });
  assert.strictEqual(G.appel('PUT', '/api/journee/2026-10-22', corpsJournee(1, etat, null)).data.version, 2);
  r = G.appel('GET', '/api/journee/2026-10-22');
  assert.strictEqual(r.data.version, 2); assert.strictEqual(r.data.journee.mouvements[0].num, 'locom');
  assert.strictEqual(G.appel('GET', '/api/journee/2026-10-23').status, 404);
  assert.deepStrictEqual(G.appel('GET', '/api/journees').data.dates, ['2026-10-22']);
  assert.strictEqual(G.appel('GET', '/api/inconnu').status, 404);
});
test('registre : chaque enregistrement tracé dans l\'onglet Journal', function () {
  var ss = G.etat.classeurs[G.etat.proprietes.REGISTRE_ID];
  assert.strictEqual(ss.feuilles.Journal.lignes.length, 3);
});

console.log('Écrans');
test('diffusion publiée, lisible sans clé, battement croissant', function () {
  var r = JSON.parse(G.doGet({ action: 'diffusion' }).getContent());
  assert.strictEqual(r.diffusion.flash.texte, 'Essai é à ç');
  var b = r.meta.battement;
  G.appel('POST', '/api/battement', '');
  assert.strictEqual(JSON.parse(G.doGet({ action: 'diffusion' }).getContent()).meta.battement, b + 1);
});
test('cache vidé (6 h) : relecture depuis Drive', function () {
  G.viderCache();
  var r = JSON.parse(G.doGet({ action: 'diffusion' }).getContent());
  assert.strictEqual(r.diffusion.date, '2026-10-22');
});
test('publication seule (POST /api/diffusion) sans changer la journée', function () {
  var d2 = JSON.parse(JSON.stringify(diffusion)); d2.flash = null;
  assert.strictEqual(G.appel('POST', '/api/diffusion', JSON.stringify(d2)).status, 200);
  assert.strictEqual(JSON.parse(G.doGet({ action: 'diffusion' }).getContent()).diffusion.flash, null);
  assert.strictEqual(G.appel('POST', '/api/diffusion', 'pas du json').status, 500);
});
test('publication d\'une fenêtre restée sur une ancienne version : refusée, l\'affichage reste à jour', function () {
  var vieille = JSON.parse(JSON.stringify(diffusion)); vieille.version = 1; vieille.flash = { texte: 'ancienne' };
  var r = G.appel('POST', '/api/diffusion', JSON.stringify(vieille));
  assert.strictEqual(r.status, 409); assert.strictEqual(r.data.version, 2);
  assert.strictEqual(JSON.parse(G.doGet({ action: 'diffusion' }).getContent()).diffusion.flash, null);
  vieille.version = 2;
  assert.strictEqual(G.appel('POST', '/api/diffusion', JSON.stringify(vieille)).status, 200);
  assert.strictEqual(JSON.parse(G.doGet({ action: 'diffusion' }).getContent()).diffusion.flash.texte, 'ancienne');
});

console.log('Mails');
var mail = { id: '2026-10-22_TDF-LF1_navetteDepart', mode: 'simulation', to: ['gare@exemple.test'], cc: ['copie@exemple.test'], bcc: [], sujet: 'Départ navette LF1 vers TDF à 7h27', html: '<p>Départ LF1</p><!--signature-->' };
test('simulation : rien n\'est envoyé, trace dans l\'onglet Mails, pas de doublon', function () {
  assert.strictEqual(G.appel('POST', '/api/mail', JSON.stringify(mail)).data.statut, 'simule');
  assert.strictEqual(G.appel('POST', '/api/mail', JSON.stringify(mail)).data.statut, 'deja');
  assert.strictEqual(G.etat.envois.length, 0);
  assert.strictEqual(G.etat.classeurs[G.etat.proprietes.REGISTRE_ID].feuilles.Mails.lignes.length, 2);
});
test('envoi automatique et brouillon Gmail', function () {
  var a = Object.assign({}, mail, { id: '2026-10-22_TN-LN1_navetteDepart', mode: 'auto' });
  assert.strictEqual(G.appel('POST', '/api/mail', JSON.stringify(a)).data.statut, 'envoye');
  assert.strictEqual(G.etat.envois[0].to, 'gare@exemple.test'); assert.ok(G.etat.envois[0].htmlBody.indexOf('signature') < 0);
  var b = Object.assign({}, mail, { id: '2026-10-22_ATL-LA1_navetteDepart', mode: 'brouillon' });
  assert.strictEqual(G.appel('POST', '/api/mail', JSON.stringify(b)).data.statut, 'brouillon');
  assert.strictEqual(G.etat.brouillons.length, 1);
});
test('mails invalides refusés', function () {
  assert.strictEqual(G.appel('POST', '/api/mail', JSON.stringify(Object.assign({}, mail, { id: '../x' }))).status, 400);
  assert.strictEqual(G.appel('POST', '/api/mail', JSON.stringify(Object.assign({}, mail, { id: 'y', mode: 'fusee' }))).status, 400);
  assert.strictEqual(G.appel('POST', '/api/mail', JSON.stringify(Object.assign({}, mail, { id: 'z', to: [] }))).status, 400);
});

console.log('Archives');
test('fichiers CSV avec BOM dans Drive › archives › année, statistiques sans doublon', function () {
  var a = { date: '2026-10-22', fichiers: [{ nom: '2026-10-22_mouvements.csv', contenu: 'n;numero\r\n1;locom\r\n' }], statistiques: { entete: 'date;mouvements', ligne: '2026-10-22;1' } };
  var r = G.appel('POST', '/api/archives', JSON.stringify(a));
  assert.strictEqual(r.status, 200); assert.ok(/archives\/2026/.test(r.data.dossier));
  a.statistiques.ligne = '2026-10-22;2';
  G.appel('POST', '/api/archives', JSON.stringify(a));
  var stats = G.etat.classeurs[G.etat.proprietes.REGISTRE_ID].feuilles.Statistiques.lignes;
  assert.strictEqual(stats.length, 2); assert.strictEqual(stats[1][1], '2');
  var csv = Object.keys(G.etat.fichiers).map(function (k) { return G.etat.fichiers[k]; }).filter(function (f) { return f.nom === '2026-10-22_mouvements.csv'; })[0];
  assert.strictEqual(csv.contenu.charCodeAt(0), 0xFEFF);
  assert.strictEqual(G.appel('POST', '/api/archives', JSON.stringify({ date: '2026-10-22', fichiers: [{ nom: '../x.csv', contenu: '' }] })).status, 400);
});

console.log('Suivi trains');
test('lecture des onglets Navettes et Journal du jour, adresse vérifiée', function () {
  var g = simulateur.charger('secret-essai');
  g.appel('PUT', '/api/parametres', JSON.stringify({ voies: ['vf1'] }));
  assert.strictEqual(g.appel('POST', '/api/suivi-trains', JSON.stringify({ date: '2026-10-25' })).status, 400);
  var id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', ss = g.creerClasseur('Suivi trains', id);
  var nav = ss.insertSheet('Navettes');
  nav.appendRow(['Date', 'Type', 'Code', 'Libellé', 'Heure théorique', 'Heure réelle', 'Écart (min)', 'Mis à jour le']);
  nav.appendRow(['2026-10-25', 'Navette', 'FL1', 'FL1 (départ)', '', '14:05', '', '']);
  nav.appendRow(['2026-10-25', 'Quickboard', 'LF2', 'LF2', '15:30', '15:34', 4, '']);
  nav.appendRow(['2026-10-24', 'Navette', 'FL1', 'FL1 (départ)', '', '09:00', '', '']);
  var jr = ss.insertSheet('Journal');
  jr.appendRow(['Date', 'Train', 'Étape', 'Heure théorique', 'Heure réelle']);
  jr.appendRow(['2026-10-25', '50238', 'Mise en tête', '16:56', '16:58:12']);
  g.appel('PUT', '/api/parametres', JSON.stringify({ voies: ['vf1'], suiviTrains: { classeur: 'https://docs.google.com/spreadsheets/d/' + id + '/edit#gid=0' } }));
  var r = g.appel('POST', '/api/suivi-trains', JSON.stringify({ date: '2026-10-25' }));
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.navettes.map(function (x) { return x.code + ' ' + x.reel; }), ['FL1 14:05', 'LF2 15:34']);
  assert.deepStrictEqual(r.data.journal, [{ train: '50238', etape: 'Mise en tête', theo: '16:56', reel: '16:58:12' }]);
  g.appel('PUT', '/api/parametres', JSON.stringify({ voies: ['vf1'], suiviTrains: { classeur: 'https://docs.google.com/spreadsheets/d/inconnu0123456789abcdef/edit' } }));
  assert.strictEqual(g.appel('POST', '/api/suivi-trains', JSON.stringify({ date: '2026-10-25' })).status, 502);
  assert.strictEqual(g.appel('POST', '/api/suivi-trains', JSON.stringify({ date: 'hier' })).status, 400);
});

console.log('\n' + reussis + ' tests réussis, ' + echecs + ' en échec.');
process.exit(echecs ? 1 : 0);
