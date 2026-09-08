// ---------------------------------------------------------------------------
// FYLL INN DINE EGNE VERDIER HER (fra Firebase-konsollen).
// Se oppsettsguiden, steg "Koble appen til Firebase".
// Disse verdiene er IKKE hemmelige - de identifiserer bare Firebase-prosjektet
// ditt og er trygge å ha i denne filen.
// ---------------------------------------------------------------------------
// NB: bruker "self" (ikke "window") fordi denne filen lastes både av selve
// nettsiden OG av service-worker.js, som ikke har noe "window"-objekt.
self.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCbuiqZnVO57YLFogipLNGaCSvA3EAdriE",
  authDomain: "registrering-flerbrukshall.firebaseapp.com",
  projectId: "registrering-flerbrukshall",
  storageBucket: "registrering-flerbrukshall.firebasestorage.app",
  messagingSenderId: "848397348714",
  appId: "1:848397348714:web:1d002b5dbf954111127f13",
};

// VAPID-nøkkelen ("Web push-sertifikat") fra Firebase Console -> Prosjektinnstillinger
// -> Cloud Messaging -> Web Push-sertifikater.
self.FIREBASE_VAPID_KEY = "BGn0Wql6wG37leMZoTIflptd-Z630baVSPXGup6T9WmB6vb5NWWCukHCpeSki7TdGo5X6_zFDhSLvus2XLt5eqM";

// Navnet på hallen (vises øverst i appen).
self.HALL_NAVN = "Varegg Arena";

// ---------------------------------------------------------------------------
// PIN-kode (valgfritt): sett en 4-sifret kode her, så må vaktene taste den inn
// én gang på hver telefon før de kan registrere. La stå som "" for å slå av
// PIN-sjekken helt.
//
// NB: dette er en enkel sperre i appen (skjermlås), IKKE en ekte innlogging –
// Firestore-databasen er fortsatt åpen bak kulissene (se firestore.rules).
// Den holder tilfeldige som får tak i lenken ute, men er ikke vanntett mot
// noen som virkelig prøver.
// ---------------------------------------------------------------------------
self.APP_PIN = "0103";
