/*
 * Simulateur minimal des services Google Apps Script utilisés par apps-script/Code.gs
 * (Drive, Sheets, Properties, Cache, Lock, Content, Mail, Gmail, Utilities), en mémoire.
 * Sert aux tests automatiques et au serveur de démonstration local (tests/serveur-simule.js).
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function iterateur(liste) { var i = 0; return { hasNext: function () { return i < liste.length; }, next: function () { return liste[i++]; } }; }
function p2(n) { return (n < 10 ? '0' : '') + n; }

function creerServices() {
  var compteur = 0, fichiers = {}, dossiers = {}, envois = [], brouillons = [], DateCtx = Date;
  function nouvelId() { return 'id' + (++compteur); }
  function Fichier(nom, contenu, type, parent) {
    this.id = nouvelId(); this.nom = nom; this.contenu = String(contenu); this.type = type; this.parent = parent; fichiers[this.id] = this;
  }
  Fichier.prototype.getId = function () { return this.id; };
  Fichier.prototype.getName = function () { return this.nom; };
  Fichier.prototype.setContent = function (t) { this.contenu = String(t); return this; };
  Fichier.prototype.getBlob = function () { var f = this; return { getDataAsString: function () { return f.contenu; } }; };
  Fichier.prototype.moveTo = function (d) { this.parent = d.id; return this; };
  function Dossier(nom, parent) { this.id = nouvelId(); this.nom = nom; this.parent = parent; dossiers[this.id] = this; }
  Dossier.prototype.getId = function () { return this.id; };
  Dossier.prototype.getName = function () { return this.nom; };
  Dossier.prototype.createFolder = function (nom) { return new Dossier(nom, this.id); };
  Dossier.prototype.getFoldersByName = function (nom) { var id = this.id; return iterateur(Object.keys(dossiers).map(function (k) { return dossiers[k]; }).filter(function (d) { return d.parent === id && d.nom === nom; })); };
  Dossier.prototype.getFilesByName = function (nom) { var id = this.id; return iterateur(Object.keys(fichiers).map(function (k) { return fichiers[k]; }).filter(function (f) { return f.parent === id && f.nom === nom; })); };
  Dossier.prototype.getFiles = function () { var id = this.id; return iterateur(Object.keys(fichiers).map(function (k) { return fichiers[k]; }).filter(function (f) { return f.parent === id; })); };
  Dossier.prototype.createFile = function (nom, contenu, type) { return new Fichier(nom, contenu, type, this.id); };

  var DriveApp = {
    createFolder: function (nom) { return new Dossier(nom, 'racine'); },
    getFolderById: function (id) { if (!dossiers[id]) throw new Error('dossier introuvable'); return dossiers[id]; },
    getFileById: function (id) { if (!fichiers[id]) throw new Error('fichier introuvable'); return fichiers[id]; }
  };

  var classeurs = {};
  function Feuille(nom) { this.nom = nom; this.lignes = []; }
  Feuille.prototype.appendRow = function (l) { this.lignes.push(l.map(function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new DateCtx(String(v) + 'T00:00:00') : v; })); return this; };
  Feuille.prototype.setFrozenRows = function () { return this; };
  Feuille.prototype.getDataRange = function () { var f = this; return { getValues: function () { return f.lignes.map(function (l) { return l.slice(); }); } }; };
  Feuille.prototype.getRange = function (r, c, nr, nc) { var f = this; return { setValues: function (v) { f.lignes[r - 1] = v[0].slice(); } }; };
  function Classeur(nom) { this.id = nouvelId(); this.nom = nom; this.feuilles = {}; classeurs[this.id] = this; fichiers[this.id] = new Fichier(nom, '', 'sheet', 'racine'); fichiers[this.id].id = this.id; }
  Classeur.prototype.getId = function () { return this.id; };
  Classeur.prototype.getSheetByName = function (n) { return this.feuilles[n] || null; };
  Classeur.prototype.insertSheet = function (n) { this.feuilles[n] = new Feuille(n); return this.feuilles[n]; };
  var SpreadsheetApp = {
    create: function (nom) { return new Classeur(nom); },
    openById: function (id) { if (!classeurs[id]) throw new Error('classeur introuvable'); return classeurs[id]; }
  };

  var proprietes = {}, cache = {};
  var services = {
    DriveApp: DriveApp, SpreadsheetApp: SpreadsheetApp,
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return Object.prototype.hasOwnProperty.call(proprietes, k) ? proprietes[k] : null; }, setProperty: function (k, v) { proprietes[k] = String(v); } }; } },
    CacheService: { getScriptCache: function () { return { get: function (k) { return Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null; }, put: function (k, v) { cache[k] = String(v); }, putAll: function (o) { Object.keys(o).forEach(function (k) { cache[k] = String(o[k]); }); } }; } },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: function (t) { return { contenu: t, type: 'text/plain', setMimeType: function (m) { this.type = m; return this; }, getContent: function () { return this.contenu; } }; }
    },
    MailApp: { sendEmail: function (o) { envois.push(o); } },
    GmailApp: { createDraft: function (to, sujet, corps, o) { brouillons.push({ to: to, sujet: sujet, options: o }); } },
    Utilities: {
      formatDate: function (d, fuseau, format) {
        var s = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
        return format === 'yyyy-MM-dd' ? s : s + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
      }
    },
    console: console
  };
  return {
    services: services,
    etat: { fichiers: fichiers, dossiers: dossiers, classeurs: classeurs, proprietes: proprietes, cache: cache, envois: envois, brouillons: brouillons },
    viderCache: function () { Object.keys(cache).forEach(function (k) { delete cache[k]; }); },
    definirDate: function (D) { DateCtx = D; }
  };
}

/** Charge Code.gs avec la clé indiquée (null = laisser la valeur d'origine). */
function charger(cle) {
  var code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  if (cle != null) code = code.replace("const CLE = 'CHANGER-CE-MOT-DE-PASSE';", 'const CLE = ' + JSON.stringify(cle) + ';');
  var s = creerServices();
  var contexte = vm.createContext(s.services);
  s.definirDate(vm.runInContext('Date', contexte));
  vm.runInContext(code + '\n;this.doGet = doGet; this.doPost = doPost;', contexte, { filename: 'Code.gs' });
  function appel(methode, chemin, corps, cleEnvoyee) {
    var r = contexte.doPost({ postData: { contents: JSON.stringify({ cle: cleEnvoyee === undefined ? cle : cleEnvoyee, methode: methode, chemin: chemin, corps: corps == null ? null : corps }) } });
    return JSON.parse(r.getContent());
  }
  return {
    doGet: function (params) { return contexte.doGet({ parameter: params || {} }); },
    doPost: function (contenu) { return contexte.doPost({ postData: { contents: contenu } }); },
    appel: appel,
    etat: s.etat,
    viderCache: s.viderCache
  };
}

module.exports = { charger: charger };
