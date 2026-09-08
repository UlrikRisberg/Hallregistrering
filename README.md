# Hallregistrering

En gratis, installerbar app (PWA) for å registrere antall besøkende i
flerbrukshallen hver time.

Full oppsettsguide (steg for steg, på norsk) får du av Claude som eget
dokument sammen med denne koden. Kortversjon:

1. Last opp alle disse filene til et nytt GitHub-repo og skru på **GitHub Pages**.
2. Opprett et gratis **Firebase**-prosjekt (Firestore + Cloud Messaging).
3. Fyll inn nøklene dine i `firebase-config.js`.
4. Legg Firebase-tjenestekontoen inn som GitHub-secreten `FIREBASE_SERVICE_ACCOUNT`
   (brukes av `.github/workflows/hourly-reminder.yml` til å sende timevarsler).
5. Åpne GitHub Pages-lenken på telefonen og velg "Legg til på Hjem-skjerm".

Registreringstidspunkter (Europe/Oslo-tid) er definert i `schedule.js`
(og speilet i `scripts/schedule.js` for varslingsjobben):

- Mandag–fredag: 16, 17, 18, 19, 20, 21, 22
- Lørdag: 8–18
- Søndag: 9–22
