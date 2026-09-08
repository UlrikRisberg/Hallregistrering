// Kjøres hver time av GitHub Actions (.github/workflows/hourly-reminder.yml).
// Sjekker om klokka (i Oslo-tid) er et av de planlagte registreringstidspunktene,
// og sender i så fall en push-varsling til alle registrerte telefoner.

const admin = require("firebase-admin");
const { isScheduledSlot, osloDateParts } = require("./schedule.js");

function main() {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccountPath) {
    console.error("Mangler GOOGLE_APPLICATION_CREDENTIALS – se GitHub-secreten FIREBASE_SERVICE_ACCOUNT.");
    process.exit(1);
  }
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return run();
}

async function run() {
  const { dateStr, hour, day } = osloDateParts();
  console.log(`Sjekker tidspunkt: ${dateStr} (ukedag ${day}) kl. ${hour}:00 (Europe/Oslo)`);

  const tvungetTest = process.env.TVING_VARSEL === "true";

  if (!isScheduledSlot(day, hour) && !tvungetTest) {
    console.log("Ikke et planlagt registreringstidspunkt akkurat nå. Avslutter uten å sende noe.");
    return;
  }

  const db = admin.firestore();
  const tokensSnap = await db.collection("device_tokens").get();
  const tokens = tokensSnap.docs.map((d) => d.id);

  if (!tokens.length) {
    console.log("Ingen registrerte enheter (device_tokens er tom) – ingen varsel sendt.");
    return;
  }

  const klokke = String(hour).padStart(2, "0") + ":00";
  const message = {
    tokens,
    notification: {
      title: "Tid for registrering",
      body: `Hvor mange trener i hallen kl. ${klokke}?`,
    },
    data: {
      date: dateStr,
      hour: String(hour),
    },
    webpush: {
      fcmOptions: { link: "./index.html" },
    },
  };

  const resp = await admin.messaging().sendEachForMulticast(message);
  console.log(`Sendt: ${resp.successCount} ok, ${resp.failureCount} feilet.`);

  // Rydd bort tokens som ikke lenger er gyldige (avinstallert app, utløpt osv.)
  const opprydding = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        opprydding.push(db.collection("device_tokens").doc(tokens[i]).delete());
      } else {
        console.warn(`Feil for token ${tokens[i]}: ${code}`);
      }
    }
  });
  if (opprydding.length) {
    await Promise.all(opprydding);
    console.log(`Ryddet bort ${opprydding.length} ugyldige token(er).`);
  }
}

main().catch((err) => {
  console.error("Uventet feil:", err);
  process.exit(1);
});
