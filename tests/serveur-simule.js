/*
 * Serveur de démonstration : sert les pages comme GitHub Pages et imite le serveur Google
 * (apps-script/Code.gs exécuté sur le simulateur) à l'adresse /exec.
 * Lancement : node tests/serveur-simule.js [port] [clé]   (par défaut 18780, « demo »)
 * Puis ouvrir http://127.0.0.1:18780/saisie.html?google=1#url=http://127.0.0.1:18780/exec&cle=demo
 */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var simulateur = require('./simulateur-apps-script.js');

var PORT = +(process.argv[2] || 18780);
var CLE = process.argv[3] || 'demo';
var serveur = simulateur.charger(CLE);
var racine = path.join(__dirname, '..');
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

http.createServer(function (req, res) {
  var url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/exec') {
    var repondre = function (sortie) {
      res.writeHead(200, { 'Content-Type': (sortie.type || 'text/plain') + '; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(sortie.getContent());
    };
    if (req.method === 'GET') { var p = {}; url.searchParams.forEach(function (v, k) { p[k] = v; }); return repondre(serveur.doGet(p)); }
    if (req.method === 'POST') {
      var morceaux = [];
      req.on('data', function (m) { morceaux.push(m); });
      req.on('end', function () { setTimeout(function () { repondre(serveur.doPost(Buffer.concat(morceaux).toString('utf8'))); }, 150); });
      return;
    }
    res.writeHead(405); return res.end();
  }
  var nom = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!/^\/[a-z0-9-]+\.(html|js|css)$/.test(nom)) { res.writeHead(404); return res.end('introuvable'); }
  fs.readFile(path.join(racine, nom), function (err, contenu) {
    if (err) { res.writeHead(404); return res.end('introuvable'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(nom)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(contenu);
  });
}).listen(PORT, '127.0.0.1', function () {
  console.log('Démonstration : http://127.0.0.1:' + PORT + '/saisie.html?google=1#url=http://127.0.0.1:' + PORT + '/exec&cle=' + CLE);
  console.log('Écrans        : http://127.0.0.1:' + PORT + '/visuel.html?source=' + encodeURIComponent('http://127.0.0.1:' + PORT + '/exec'));
});
