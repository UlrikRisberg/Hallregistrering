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
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
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
    { bekreftet: false, dato: dateStr, tid: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  console.log("Vaktstatus nullstilt til 'ikke på vakt' (rødt ikon) for alle enheter.");
}

main().catch((err) => {
  console.error("Uventet feil:", err);
  process.exit(1);
});
