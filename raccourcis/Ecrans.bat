@echo off
rem Suivi des circulations - ouvre la page des ECRANS en plein ecran (PC qui alimente les TV).
rem 1. Remplacer COLLER-ICI-L-ADRESSE-EXEC par l'adresse du serveur Google (Saisie > Connexion, elle se termine par /exec).
rem 2. Pour quitter le plein ecran : Alt+F4.
set "SERVEUR=COLLER-ICI-L-ADRESSE-EXEC"
start "" msedge --kiosk "https://lechatiti76-stack.github.io/suivi-circulations/visuel.html?source=%SERVEUR%" --edge-kiosk-type=fullscreen --no-first-run
