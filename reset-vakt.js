// Kjøres hver time av GitHub Actions (.github/workflows/hourly-reminder.yml),
// akkurat som send-reminder.js. Denne sjekker om klokka (i Oslo-tid) akkurat
// har passert midnatt, og nullstiller i så fall den felles vaktstatusen i
// Firestore (vakt_status/gjeldende) til "ikke på vakt" (rødt ikon) – uansett
// om noen har appen åpen eller ikke.
//
// Dette er et sikkerhetsnett i tillegg til appen: appen viser allerede rødt
// automatisk neste dag (den sjekker om den lagrede datoen er "i dag"), men
// det krever at appen er åpen/oppdatert på telefonen. Dette scriptet sørger
// for at selve databasen også nullstilles hver natt, slik at alle enheter
// får beskjed med én gang via den delte lyttingen i appen.

const admin = require("firebase-admin");
const path = require("path");
const { osloDateParts } = require("./schedule.js");

function main() {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccountPath) {
    console.error("Mangler GOOGLE_APPLICATION_CREDENTIALS – se GitHub-secreten FIREBASE_SERVICE_ACCOUNT.");
    process.exit(1);
  }
  const serviceAccount = require(path.resolve(serviceAccountPath));

  // Flere scripts i denne mappen kan kjøre etter hverandre i samme jobb –
  // ikke initialiser Firebase-appen på nytt hvis den allerede finnes.
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  return run();
}

async function run() {
  const { dateStr, hour } = osloDateParts();
  console.log(`Sjekker om det er midnatt: ${dateStr} kl. ${hour}:00 (Europe/Oslo)`);

  const tvunget = process.env.TVING_RESET === "true";

  if (hour !== 0 && !tvunget) {
    console.log("Ikke midnatt (time 00) i Oslo akkurat nå. Avslutter uten å nullstille noe.");
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
    {
      bekreftet: false,
      dato: dateStr,
      tid: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Vaktstatus nullstilt til 'ikke på vakt' (rødt ikon) for alle enheter.");
}

main().catch((err) => {
  console.error("Uventet feil:", err);
  process.exit(1);
});
