# Suivi des circulations

Application web de saisie et d'affichage des circulations d'un terminal ferroviaire. Elle remplace deux classeurs Excel :

- **SAISIE** (`saisie.html`) : poste opérateur. Journal des mouvements, circulations du jour, préparation du lendemain, flash info, mails aux EF, clôture.
- **ÉCRANS** (`visuel.html`) : affichage plein écran des TV, en lecture seule.

Les pages sont publiées par **GitHub Pages**. Les données (journées, planning, paramètres) sont gardées dans le **Google Drive** de l'utilisateur par un petit script **Google Apps Script** (`apps-script/Code.gs`), qui transmet aux écrans les seules informations autorisées à l'affichage.

> Outil d'information d'exploitation : il ne remplace ni les procédures réglementaires de circulation, ni les installations de sécurité.

Aucune donnée de l'entreprise n'est dans ce dépôt : le planning, les voies, la base N° → EF et les destinataires des mails sont importés une fois depuis l'écran Connexion (fichier `donnees-initiales.json`, conservé hors du dépôt).

---

## Installation (une seule fois)

### 1. Publier les pages (GitHub Pages)

1. Sur GitHub, dépôt `suivi-circulations` › **Settings** › **Pages**.
2. **Source** : *Deploy from a branch*, branche **main**, dossier **/ (root)**, puis **Save**.
3. Une minute plus tard, le site répond à `https://lechatiti76-stack.github.io/suivi-circulations/`.

### 2. Créer le serveur Google (Apps Script)

1. Aller sur <https://script.google.com> › **Nouveau projet**. Le nommer « Suivi des circulations ».
2. Remplacer le contenu de `Code.gs` par celui de [`apps-script/Code.gs`](apps-script/Code.gs).
3. Ligne `const CLE = 'CHANGER-CE-MOT-DE-PASSE';` : mettre un mot de passe de votre choix (lettres et chiffres). Il sera demandé une fois sur le poste de saisie.
4. **Paramètres du projet** (roue dentée) › fuseau horaire **(GMT+01:00) Paris**.
5. **Déployer** › **Nouveau déploiement** › type **Application Web** :
   - *Exécuter en tant que* : **Moi** ;
   - *Qui a accès* : **Tout le monde**.
6. **Déployer**, autoriser l'accès demandé (Drive, Sheets, mails), puis copier l'**URL de l'application Web** (elle se termine par `/exec`).

Au premier appel, le script crée dans votre Drive le dossier **« Suivi des circulations - données »** (journées, planning, archives) et le classeur **« Suivi des circulations - registre »** (onglets Journal, Mails, Statistiques).

### 3. Connecter la saisie

1. Ouvrir `https://lechatiti76-stack.github.io/suivi-circulations/saisie.html`.
2. La fenêtre **Connexion** s'ouvre : coller l'URL `/exec`, la clé, puis **Tester la connexion**.
3. **Données initiales** : choisir `donnees-initiales.json` puis **Importer**. La page se recharge avec le planning du jour.
4. Recopier le **lien des écrans** affiché dans cette même fenêtre.

### 4. Les deux raccourcis

| Poste | Fichier | Réglage |
|---|---|---|
| Poste de saisie | [`raccourcis/Saisie.bat`](raccourcis/Saisie.bat) | aucun |
| PC des TV | [`raccourcis/Ecrans.bat`](raccourcis/Ecrans.bat) | remplacer `COLLER-ICI-L-ADRESSE-EXEC` par l'URL `/exec` |

Copier chaque fichier sur le bureau du poste concerné. `Ecrans.bat` ouvre la page en plein écran (Alt+F4 pour quitter). Pour un démarrage automatique, placer aussi le raccourci dans le dossier ouvert par Windows+R › `shell:startup`.

---

## Utilisation

- **N° train** : la liste propose les numéros du jour et ceux de la base, avec leur seule EF. L'EF se remplit d'après la base N° → EF (Paramètres). Une EF corrigée à la main peut y être ajoutée d'un clic.
- **Entrée** passe au champ suivant (voie, wagons, chargés/vides, situation, vers, commentaire) jusqu'à **Valider** ; un champ obligatoire vide bloque le passage. **Ctrl+Entrée** enregistre directement. La voie de destination est obligatoire pour les locomotives et manœuvres (réglable).
- **Tableau de droite** : heure, HLR, wagons et voie de chaque navette ou train se modifient sur place et s'affichent sur les écrans. **Garder pour tous les lundis** (selon le jour) les reprend automatiquement les semaines suivantes. L'onglet **Demain** prépare le lendemain.
- **Trains de ligne** : **FA ✅** le train est arrivé, **Déjà là** il est déjà présent, **Parti** départ. **Navettes** : **Parti** au départ ; à l'arrivée, **Partie** quand la navette quitte son terminal (les écrans suivent alors ses points de passage et son heure d'arrivée estimée), puis **Arrivée**. **F2** : arrivé ou parti maintenant pour le numéro tapé.
- **Suivi trains** (Paramètres) : avec l'adresse du classeur Google de l'application Suivi trains, la saisie le lit toutes les 15 secondes (délai complet : moins d'une minute). Navette validée (FL1…) → en route sur les écrans ; arrivée, tableau des départs (LF1…), arrivées fret et « Départ pour la ligne » → heure réelle ; étapes d'un train (mise en tête…) → déroulé du départ et état sur les écrans. Une correction faite dans la saisie reste tant que le Suivi trains n'envoie pas une nouvelle heure. Le classeur doit être dans le même compte Google que ce serveur (ou lui être partagé). Les durées de trajet et points de passage se règlent dans Paramètres.
- **Dans l'autre sens**, le Suivi trains relit toutes les 20 secondes ce que reçoivent les écrans (adresse `/exec` à mettre dans ses Réglages, sans clé) : une navette marquée **Partie**, **Parti** ou **Arrivée** dans la saisie, ou une arrivée fret, y apparaît automatiquement.
- **Mails** : livrés en mode **Simulation** (rien ne part, chaque mail est noté dans l'onglet Mails du registre). En mode Brouillon ou Automatique, ils partent du compte Google qui a déployé le script.
- **Clôturer** : archives CSV dans Drive › archives › année, ligne ajoutée à l'onglet Statistiques du registre.

## Modifier l'application

- **Pages** (`*.html`, `*.js`, `*.css`) : modifier sur GitHub et valider ; le site est à jour une minute plus tard. Recharger les pages avec Ctrl+F5.
- **Serveur** (`Code.gs`) : après modification dans Apps Script, **Déployer** › **Gérer les déploiements** › crayon › **Version : nouvelle version** › **Déployer**. L'URL `/exec` ne change pas.
- **Tests** : `node tests/test-apps-script.js` teste le serveur sur un simulateur des services Google. `node tests/serveur-simule.js` lance une démonstration locale complète (pages + serveur simulé).

## Limites

- Les deux postes ont besoin d'Internet (github.io et script.google.com).
- Un seul poste de saisie à la fois.
- Données dans le compte Google qui a déployé le script : pour une utilisation définitive, prévoir un compte de l'entreprise.
- Délai saisie → écrans : environ 5 à 10 secondes. Si le poste de saisie s'arrête, les écrans affichent « Liaison interrompue » au bout de 2 minutes et gardent les dernières données.
