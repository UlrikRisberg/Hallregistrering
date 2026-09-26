const admin = require("firebase-admin");
const path = require("path");
const { osloDateParts } = require("./schedule.js");

// ---------------------------------------------------------------------------
// Nullstiller vaktstatus (grønt ikon -> rødt ikon) ved de faste vaktskiftene:
//   - lørdag kl. 13:30 (Europe/Oslo)
//   - søndag kl. 15:30 (Europe/Oslo)
//
// Dette kommer I TILLEGG til den vanlige midnatts-nullstillingen som allerede
// gjøres av reset-vakt.js. Denne workflowen (se
// .github/workflows/vaktskifte-reset.yml) kjører hvert 30. minutt, hele
// døgnet, hele uken – og dette skriptet sjekker selv om klokka i Oslo faktisk
// er ett av vaktskifte-tidspunktene før det gjør noe. Utenom akkurat de to
// tidspunktene er dette skriptet en "no-op" (gjør ingenting).
//
// Vi sjekker "minute >= 25" i stedet for "minute === 30" for å tåle at
// GitHub sin klokke noen ganger kjører jobben noen minutter forsinket.
// ---------------------------------------------------------------------------

function main() {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccountPath) {
    console.error("Mangler GOOGLE_APPLICATION_CREDENTIALS – se GitHub-secreten FIREBASE_SERVICE_ACCOUNT.");
    process.exit(1);
  }
  const serviceAccount = require(path.resolve(serviceAccountPath));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return run();
}

async function run() {
  const { dateStr, hour, minute, day } = osloDateParts();
  console.log(
    `Sjekker vaktskifte: ${dateStr}, ukedag=${day} (0=søndag ... 6=lørdag), kl. ${hour}:${String(minute).padStart(2, "0")} (Europe/Oslo)`
  );

  const tvunget = process.env.TVING_RESET === "true";
  const erLordagVaktskifte = day === 6 && hour === 13 && minute >= 25;
  const erSondagVaktskifte = day === 0 && hour === 15 && minute >= 25;

  if (!tvunget && !erLordagVaktskifte && !erSondagVaktskifte) {
    console.log("Ikke et vaktskifte-tidspunkt akkurat nå. Avslutter uten å nullstille noe.");
    return;
  }

  const db = admin.firestore();
  const ref = db.collection("vakt_status").doc("gjeldende");
  const snap = await ref.get();
  if (!snap.exists || snap.data().bekreftet !== true) {
    console.log("Vaktstatus var allerede 'ikke på vakt' – ingenting å nullstille.");
    return;
  }
  await ref.set(
    { bekreftet: false, dato: dateStr, tid: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  console.log("Vaktstatus nullstilt til 'ikke på vakt' (rødt ikon) på grunn av vaktskifte.");
}

main().catch((err) => {
  console.error("Uventet feil:", err);
  process.exit(1);
});
