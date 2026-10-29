/**
 * Suivi des circulations - serveur Google Apps Script (version GitHub Pages).
 *
 * Remplace le service local du poste de saisie : il garde les journées, le planning et les paramètres
 * dans un dossier Google Drive, tient un registre (Google Sheets : journal, mails, statistiques)
 * et transmet aux écrans les seules données autorisées à l'affichage.
 *
 * Installation : voir README.md (section « Créer le serveur Google »).
 *   1. Remplacer la valeur de CLE ci-dessous par un mot de passe de votre choix.
 *   2. Déployer > Nouveau déploiement > Application Web, exécuter en tant que « Moi »,
 *      accès « Tout le monde ». Copier l'URL qui se termine par /exec.
 *
 * Sécurité : toutes les opérations exigent la CLE, sauf la lecture du fichier diffusé aux écrans
 * (horaires, voies, wagons, flash info), qui ne contient aucune donnée interne.
 */

const CLE = 'CHANGER-CE-MOT-DE-PASSE';
const VERSION = '2.2.0';
const FUSEAU = 'Europe/Paris';
const NOM_DOSSIER = 'Suivi des circulations - données';

// ------------------------------------------------------------------- entrées HTTP
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'diffusion') return json_(lireDiffusion_());
  if (action === 'sante') return json_({ service: 'ok', version: VERSION, maintenant: maintenant_() });
  return ContentService.createTextOutput('Suivi des circulations : serveur en service (version ' + VERSION + ').');
}

function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ status: 400, data: { erreur: 'requête illisible' } }); }
  if (CLE === 'CHANGER-CE-MOT-DE-PASSE') return json_({ status: 403, data: { erreur: 'Choisissez une clé dans Code.gs (constante CLE) puis redéployez.' } });
  if (req.cle !== CLE) return json_({ status: 403, data: { erreur: 'clé refusée' } });
  try {
    return json_(router_(String(req.methode || 'GET').toUpperCase(), String(req.chemin || ''), req.corps == null ? '' : String(req.corps)));
  } catch (err) {
    return json_({ status: 500, data: { erreur: String(err && err.message || err) } });
  }
}

function router_(m, c, corps) {
  let r;
  if (m === 'GET' && c === '/api/sante') return ok_(sante_());
  if (m === 'GET' && c === '/api/config') return ok_({ parametres: lireJson_('parametres.json', {}), planning: lireJson_('planning.json', { schema: 1, groupes: [], circulations: [] }), service: { version: VERSION, mode: 'google' } });
  if (m === 'PUT' && (c === '/api/parametres' || c === '/api/planning')) return ecrireConfig_(c === '/api/parametres' ? 'parametres.json' : 'planning.json', corps);
  if (m === 'GET' && c === '/api/journees') return ok_({ dates: listeJournees_() });
  if ((r = /^\/api\/journee\/(\d{4}-\d{2}-\d{2})$/.exec(c))) {
    if (m === 'GET') return lireJournee_(r[1]);
    if (m === 'PUT') return avecVerrou_(() => ecrireJournee_(r[1], corps));
  }
  if (m === 'POST' && c === '/api/diffusion') return avecVerrou_(() => publierSiAJour_(corps));
  if (m === 'POST' && c === '/api/battement') return ok_({ battement: battre_() });
  if (m === 'POST' && c === '/api/mail') return avecVerrou_(() => mail_(JSON.parse(corps)));
  if (m === 'POST' && c === '/api/archives') return avecVerrou_(() => archives_(JSON.parse(corps)));
  if (m === 'POST' && c === '/api/suivi-trains') return suiviTrains_(JSON.parse(corps || '{}').date);
  return { status: 404, data: { erreur: 'route inconnue : ' + m + ' ' + c } };
}

// ------------------------------------------------------------------ Suivi trains
/**
 * Lignes du jour du classeur de l'application « Suivi trains » (Paramètres › suiviTrains.classeur) :
 * onglet Navettes (Date | Type | Code | Libellé | Heure théorique | Heure réelle…) et onglet Journal
 * (Date | Train | Étape | Heure théorique | Heure réelle…). Lecture seule, gardée 8 s en cache
 * (moins que les 10 s entre deux lectures de la saisie : un seul poste lit toujours des données fraîches).
 * Le classeur doit appartenir au compte qui a déployé ce serveur (ou lui être partagé).
 */
function suiviTrains_(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return { status: 400, data: { erreur: 'date invalide' } };
  const id = idClasseur_((lireJson_('parametres.json', {}).suiviTrains || {}).classeur);
  if (!id) return { status: 400, data: { erreur: 'adresse du classeur Suivi trains absente ou invalide (Paramètres)' } };
  const cache = CacheService.getScriptCache(), cle = 'suivi:' + id + ':' + date, vu = cache.get(cle);
  if (vu) return ok_(JSON.parse(vu));
  let ss;
  try { ss = SpreadsheetApp.openById(id); }
  catch (e) { return { status: 502, data: { erreur: 'classeur Suivi trains inaccessible : vérifiez l\'adresse et que ce compte Google peut l\'ouvrir' } }; }
  const out = { date: date, lu: maintenant_(), navettes: [], journal: [] };
  lignesDuJour_(ss.getSheetByName('Navettes'), date).forEach(r => out.navettes.push({ type: r[1], code: r[2], theo: r[4], reel: r[5] }));
  lignesDuJour_(ss.getSheetByName('Journal'), date).forEach(r => out.journal.push({ train: r[1], etape: r[2], theo: r[3], reel: r[4] }));
  cache.put(cle, JSON.stringify(out), 8);
  return ok_(out);
}
/** Identifiant d'un classeur à partir de son adresse (…/spreadsheets/d/<id>/edit) ou de l'identifiant seul. */
function idClasseur_(adresse) {
  const s = String(adresse || '').trim(), m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(s);
  return m ? m[1] : (/^[A-Za-z0-9_-]{20,}$/.test(s) ? s : '');
}
/** Lignes dont la date (texte 2026-10-25 ou date affichée 25/10/2026) est celle demandée, en texte affiché. */
function lignesDuJour_(feuille, date) {
  if (!feuille) return [];
  return feuille.getDataRange().getDisplayValues().slice(1).filter(r => {
    const d = String(r[0] || '').trim(), fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d);
    return (fr ? fr[3] + '-' + ('0' + fr[2]).slice(-2) + '-' + ('0' + fr[1]).slice(-2) : d.slice(0, 10)) === date;
  }).map(r => r.map(v => String(v == null ? '' : v).trim()));
}

// --------------------------------------------------------------------- outils
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function ok_(data) { return { status: 200, data: data }; }
function maintenant_() { return Utilities.formatDate(new Date(), FUSEAU, "yyyy-MM-dd'T'HH:mm:ss"); }
function proprietes_() { return PropertiesService.getScriptProperties(); }
function avecVerrou_(fn) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try { return fn(); } finally { verrou.releaseLock(); }
}

// ------------------------------------------------------------ dossier et fichiers
function dossier_(sousDossier) {
  const p = proprietes_();
  let id = p.getProperty('DOSSIER_ID'), racine = null;
  if (id) { try { racine = DriveApp.getFolderById(id); } catch (e) { racine = null; } }
  if (!racine) { racine = DriveApp.createFolder(NOM_DOSSIER); p.setProperty('DOSSIER_ID', racine.getId()); }
  if (!sousDossier) return racine;
  let d = racine;
  sousDossier.split('/').forEach(nom => {
    const it = d.getFoldersByName(nom);
    d = it.hasNext() ? it.next() : d.createFolder(nom);
  });
  return d;
}
function fichier_(dossier, nom) {
  const it = dossier.getFilesByName(nom);
  return it.hasNext() ? it.next() : null;
}
function lireTexte_(nom, sousDossier) {
  const f = fichier_(dossier_(sousDossier), nom);
  return f ? f.getBlob().getDataAsString('UTF-8') : null;
}
function ecrireTexte_(nom, texte, sousDossier, type) {
  const d = dossier_(sousDossier), f = fichier_(d, nom);
  if (f) f.setContent(texte);
  else d.createFile(nom, texte, type || 'application/json');
}
function lireJson_(nom, defaut, sousDossier) {
  const t = lireTexte_(nom, sousDossier);
  if (!t) return defaut;
  return JSON.parse(t);
}

// ------------------------------------------------------------------- registre
function registre_() {
  const p = proprietes_();
  let id = p.getProperty('REGISTRE_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Suivi des circulations - registre');
    DriveApp.getFileById(ss.getId()).moveTo(dossier_());
    p.setProperty('REGISTRE_ID', ss.getId());
  }
  return ss;
}
function feuille_(nom, entete) {
  const ss = registre_();
  let f = ss.getSheetByName(nom);
  if (!f) {
    f = ss.insertSheet(nom);
    f.appendRow(entete);
    f.setFrozenRows(1);
  }
  return f;
}

// ------------------------------------------------------------------ configuration
function ecrireConfig_(nom, corps) {
  try { JSON.parse(corps); } catch (e) { return { status: 400, data: { erreur: 'JSON invalide : ' + e.message } }; }
  const ancien = lireTexte_(nom);
  if (ancien) ecrireTexte_(nom + '.precedent', ancien);
  ecrireTexte_(nom, corps);
  return ok_({ ok: true });
}

// ----------------------------------------------------------------------- journées
function versionJournee_(date) { return Number(proprietes_().getProperty('version:' + date) || 0); }
function listeJournees_() {
  const it = dossier_('journees').getFiles(), dates = [];
  while (it.hasNext()) { const n = it.next().getName(); if (/^\d{4}-\d{2}-\d{2}\.json$/.test(n)) dates.push(n.slice(0, 10)); }
  return dates.sort();
}
function lireJournee_(date) {
  const t = lireTexte_(date + '.json', 'journees');
  if (!t) return { status: 404, data: { erreur: 'journée absente' } };
  return ok_({ version: versionJournee_(date), journee: JSON.parse(t) });
}
function ecrireJournee_(date, corps) {
  const i1 = corps.indexOf('\n');
  if (i1 < 0) return { status: 400, data: { erreur: 'format attendu : meta, etat, diffusion' } };
  let i2 = corps.indexOf('\n', i1 + 1);
  if (i2 < 0) i2 = corps.length;
  const meta = JSON.parse(corps.slice(0, i1));
  const etat = corps.slice(i1 + 1, i2).trim();
  const diffusion = i2 < corps.length ? corps.slice(i2 + 1).trim() : '';
  if (etat.charAt(0) !== '{') return { status: 400, data: { erreur: 'état invalide' } };
  const courante = versionJournee_(date);
  if (Number(meta.baseVersion) !== courante) return { status: 409, data: { erreur: 'conflit', version: courante } };
  const nouvelle = courante + 1;
  ecrireTexte_(date + '.json', etat, 'journees');
  proprietes_().setProperty('version:' + date, String(nouvelle));
  try {
    const evt = meta.evenement || {};
    feuille_('Journal', ['Horodatage', 'Journée', 'Version', 'Type', 'Résumé']).appendRow([maintenant_(), date, nouvelle, evt.type || '', evt.resume || (evt.liste ? evt.liste.length + ' modifications' : '')]);
  } catch (e) { /* le registre est facultatif */ }
  if (diffusion.charAt(0) === '{') publierDiffusion_(diffusion);
  return ok_({ version: nouvelle, diffusion: etatDiffusion_() });
}

// ---------------------------------------------------------------------- diffusion
function publierDiffusion_(texte) {
  if (String(texte).charAt(0) !== '{') throw new Error('diffusion invalide');
  const cache = CacheService.getScriptCache();
  const meta = { battement: Number(cache.get('battement') || 0) + 1, ecritA: maintenant_() };
  cache.putAll({ diffusion: texte, battement: String(meta.battement), ecritA: meta.ecritA }, 21600);
  ecrireTexte_('diffusion.json', texte);
  proprietes_().setProperty('DIFFUSION_A', meta.ecritA);
}
/**
 * Publication seule (toutes les minutes depuis la saisie) : refusée si elle vient d'une fenêtre restée sur une version
 * plus ancienne de la journée. Sinon cette fenêtre remettrait aux écrans (et au Suivi trains) une navette « pas partie ».
 */
function publierSiAJour_(corps) {
  const d = JSON.parse(corps);
  const courante = d && /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? versionJournee_(d.date) : 0;
  if (d && d.version != null && Number(d.version) < courante) return { status: 409, data: { erreur: 'journée modifiée depuis une autre fenêtre', version: courante } };
  publierDiffusion_(corps);
  return ok_({ diffusion: etatDiffusion_() });
}
function battre_() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('battement') || 0) + 1;
  cache.putAll({ battement: String(n), ecritA: maintenant_() }, 21600);
  if (!cache.get('diffusion')) { const t = lireTexte_('diffusion.json'); if (t) cache.put('diffusion', t, 21600); }
  return n;
}
function lireDiffusion_() {
  const cache = CacheService.getScriptCache();
  let texte = cache.get('diffusion');
  if (!texte) { texte = lireTexte_('diffusion.json'); if (texte) cache.put('diffusion', texte, 21600); }
  return {
    diffusion: texte ? JSON.parse(texte) : null,
    meta: { battement: Number(cache.get('battement') || 0), ecritA: cache.get('ecritA') || proprietes_().getProperty('DIFFUSION_A') || '' }
  };
}
function etatDiffusion_() {
  return [{ dossier: 'Écrans (serveur Google)', ok: true, a: proprietes_().getProperty('DIFFUSION_A') || '', erreur: null }];
}
function sante_() {
  const params = lireJson_('parametres.json', {});
  return {
    service: 'ok', version: VERSION, mode: 'google', maintenant: maintenant_(),
    battement: Number(CacheService.getScriptCache().get('battement') || 0),
    diffusion: etatDiffusion_(), sauvegarde: { ok: true, a: '', erreur: null },
    mails: { mode: (params.mails && params.mails.mode) || 'simulation', signature: false }
  };
}

// --------------------------------------------------------------------------- mails
function mail_(m) {
  const id = String(m.id || '');
  if (!/^[A-Za-z0-9_.-]{1,160}$/.test(id)) return { status: 400, data: { erreur: 'identifiant de mail invalide' } };
  if (['simulation', 'brouillon', 'auto'].indexOf(m.mode) < 0) return { status: 400, data: { erreur: 'mode inconnu : ' + m.mode } };
  const to = (m.to || []).filter(String);
  if (!to.length) return { status: 400, data: { erreur: 'aucun destinataire' } };
  const cle = 'mails:' + id.slice(0, 10), p = proprietes_();
  const deja = JSON.parse(p.getProperty(cle) || '[]');
  if (deja.indexOf(id) >= 0) return ok_({ statut: 'deja', id: id });
  const html = String(m.html || '').replace('<!--signature-->', '');
  let statut = 'simule';
  if (m.mode === 'auto') {
    MailApp.sendEmail({ to: to.join(','), cc: (m.cc || []).join(','), bcc: (m.bcc || []).join(','), subject: String(m.sujet || ''), htmlBody: html });
    statut = 'envoye';
  } else if (m.mode === 'brouillon') {
    GmailApp.createDraft(to.join(','), String(m.sujet || ''), '', { cc: (m.cc || []).join(','), bcc: (m.bcc || []).join(','), htmlBody: html });
    statut = 'brouillon';
  }
  deja.push(id);
  p.setProperty(cle, JSON.stringify(deja));
  try {
    feuille_('Mails', ['Horodatage', 'Identifiant', 'Statut', 'Objet', 'À', 'Cc', 'Cci']).appendRow([maintenant_(), id, statut, m.sujet || '', to.join('; '), (m.cc || []).join('; '), (m.bcc || []).join('; ')]);
  } catch (e) { /* le registre est facultatif */ }
  return ok_({ statut: statut, id: id, a: maintenant_() });
}

// ------------------------------------------------------------------------ archives
function archives_(a) {
  const date = String(a.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: 400, data: { erreur: 'date invalide' } };
  const sous = 'archives/' + date.slice(0, 4), ecrits = [];
  for (const f of (a.fichiers || [])) {
    const nom = String(f.nom || '');
    if (!/^[A-Za-z0-9_.-]{1,120}$/.test(nom)) return { status: 400, data: { erreur: 'nom de fichier invalide : ' + nom } };
    ecrireTexte_(nom, (/\.csv$/.test(nom) ? '﻿' : '') + String(f.contenu || ''), sous, /\.csv$/.test(nom) ? 'text/csv' : 'application/json');
    ecrits.push(nom);
  }
  const j = lireTexte_(date + '.json', 'journees');
  if (j) { ecrireTexte_(date + '_journee.json', j, sous); ecrits.push(date + '_journee.json'); }
  if (a.statistiques) {
    const entete = String(a.statistiques.entete).split(';'), ligne = String(a.statistiques.ligne).split(';');
    const f = feuille_('Statistiques', entete), valeurs = f.getDataRange().getValues();
    let rang = -1;
    for (let i = 1; i < valeurs.length; i++) {
      const v = valeurs[i][0], d = v instanceof Date ? Utilities.formatDate(v, FUSEAU, 'yyyy-MM-dd') : String(v);
      if (d === date) { rang = i + 1; break; }
    }
    if (rang > 0) f.getRange(rang, 1, 1, ligne.length).setValues([ligne]);
    else f.appendRow(ligne);
    ecrits.push('Statistiques (registre)');
  }
  return ok_({ dossier: 'Google Drive › ' + NOM_DOSSIER + ' › ' + sous, fichiers: ecrits });
}
