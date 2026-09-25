/* global firebase, HALL_SCHEDULE, hoursForDay, isScheduledSlot, osloDateParts, XLSX */

document.getElementById("hallTittel").textContent = window.HALL_NAVN || "Hallregistrering";
document.getElementById("hallNavn2").textContent = window.HALL_NAVN || "hallen";
document.getElementById("pinHallNavn").textContent = window.HALL_NAVN || "Hallregistrering";

// ---------------------------------------------------------------------------
// PIN-lås
// ---------------------------------------------------------------------------
const PIN_STORAGE_KEY = "hallreg_pin_ok";
const PIN_REQUIRED = !!(window.APP_PIN && String(window.APP_PIN).length > 0);

function erLastOpp() {
  if (!PIN_REQUIRED) return true;
  try { return localStorage.getItem(PIN_STORAGE_KEY) === "1"; } catch (e) { return false; }
}

function settLastOpp(verdi) {
  try {
    if (verdi) localStorage.setItem(PIN_STORAGE_KEY, "1");
    else localStorage.removeItem(PIN_STORAGE_KEY);
  } catch (e) { /* ignore */ }
}

function initPinGate() {
  const gate = document.getElementById("pinGate");
  const lockCard = document.getElementById("pinLockCard");

  if (!PIN_REQUIRED) {
    gate.style.display = "none";
    lockCard.style.display = "none";
    startApp();
    return;
  }

  lockCard.style.display = "block";

  if (erLastOpp()) {
    gate.style.display = "none";
    startApp();
    return;
  }

  gate.style.display = "flex";
  let inntastet = "";
  const dotsWrap = document.getElementById("pinDots");
  const dots = dotsWrap.querySelectorAll("span");
  const feilTekst = document.getElementById("pinError");
  const pinLengde = String(window.APP_PIN).length;

  function tegnDots() {
    dots.forEach((d, i) => d.classList.toggle("filled", i < inntastet.length));
  }

  function sjekk() {
    if (inntastet === String(window.APP_PIN)) {
      settLastOpp(true);
      gate.style.display = "none";
      startApp();
    } else {
      feilTekst.classList.add("show");
      dotsWrap.classList.add("shake");
      setTimeout(() => {
        dotsWrap.classList.remove("shake");
        inntastet = "";
        tegnDots();
      }, 350);
    }
  }

  document.getElementById("pinPad").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const k = btn.dataset.k;
    feilTekst.classList.remove("show");
    if (k === "clear") { inntastet = ""; tegnDots(); return; }
    if (k === "back") { inntastet = inntastet.slice(0, -1); tegnDots(); return; }
    if (inntastet.length >= pinLengde) return;
    inntastet += k;
    tegnDots();
    if (inntastet.length === pinLengde) setTimeout(sjekk, 120);
  });
}

document.getElementById("btnLasApp")?.addEventListener("click", () => {
  settLastOpp(false);
  location.reload();
});

const CONFIGURED = window.FIREBASE_CONFIG && !String(window.FIREBASE_CONFIG.apiKey).startsWith("FYLL_INN");

let db = null;
let messaging = null;
let swRegistration = null;

if (CONFIGURED) {
  firebase.initializeApp(window.FIREBASE_CONFIG);
  db = firebase.firestore();
} else {
  console.warn("Firebase er ikke konfigurert ennå – se firebase-config.js");
}

// ---------------------------------------------------------------------------
// Service worker + push-varsler
// ---------------------------------------------------------------------------
async function setupServiceWorkerAndMessaging() {
  if (!("serviceWorker" in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register("service-worker.js");
  } catch (e) {
    console.error("Kunne ikke registrere service worker", e);
    return;
  }
  if (!CONFIGURED) return;
  if (!("PushManager" in window) || !firebase.messaging.isSupported()) {
    setVarselStatus(false, "Denne nettleseren støtter ikke push-varsler.");
    return;
  }
  messaging = firebase.messaging();
  const perm = Notification.permission;
  if (perm === "granted") {
    await registerToken();
  } else {
    setVarselStatus(false, "Varsler er ikke slått på.");
  }
}

async function registerToken() {
  try {
    const token = await messaging.getToken({
      vapidKey: window.FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });
    if (token && db) {
      await db.collection("device_tokens").doc(token).set({
        token,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        userAgent: navigator.userAgent,
      });
      localStorage.setItem("fcm_token", token);
      setVarselStatus(true, "Varsler er på for denne enheten.");
      document.getElementById("statusDot").classList.add("online");
    }
  } catch (e) {
    console.error("Feil ved henting av push-token", e);
    setVarselStatus(false, "Fikk ikke aktivert varsler (se konsoll for detaljer).");
  }
}

async function removeToken() {
  const token = localStorage.getItem("fcm_token");
  if (token && db) {
    try { await db.collection("device_tokens").doc(token).delete(); } catch (e) { /* ignore */ }
  }
  localStorage.removeItem("fcm_token");
  setVarselStatus(false, "Varsler er slått av for denne enheten.");
  document.getElementById("statusDot").classList.remove("online");
}

function setVarselStatus(on, text) {
  document.getElementById("varselToggle").checked = on;
  document.getElementById("varselStatusTekst").textContent = text;
}

document.getElementById("varselToggle").addEventListener("change", async (e) => {
  if (e.target.checked) {
    if (!("Notification" in window)) { alert("Denne enheten støtter ikke varsler."); e.target.checked = false; return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      await registerToken();
    } else {
      e.target.checked = false;
      setVarselStatus(false, "Du må godkjenne varsler i telefonens innstillinger.");
    }
  } else {
    await removeToken();
  }
});

// ---------------------------------------------------------------------------
// Faner
// ---------------------------------------------------------------------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "historikk") lastHistorikk();
  });
});

// ---------------------------------------------------------------------------
// Registreringsvisning
// ---------------------------------------------------------------------------
const PRESETS = [0, 5, 10, 15, 20, 25, 30, 40, 50];
let aktivSlot = null; // { dateStr, hour }
let sisteRegistrering = null; // for angre-knapp

function ukedagNavn(day) {
  return ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"][day];
}

function renderDueBanner() {
  const { dateStr, hour, day } = osloDateParts();
  const banner = document.getElementById("dueBanner");
  const big = document.getElementById("dueBig");
  const sub = document.getElementById("dueSub");
  const card = document.getElementById("registerCard");

  if (isScheduledSlot(day, hour)) {
    aktivSlot = { dateStr, hour, day };
    banner.classList.remove("idle");
    big.textContent = `Registrer for kl. ${String(hour).padStart(2, "0")}:00`;
    sub.textContent = "Trykk på riktig antall under";
    card.style.display = "block";
    renderPresets();
    sjekkEksisterendeRegistrering();
  } else {
    aktivSlot = null;
    banner.classList.add("idle");
    const naaste = nesteRegistreringstidspunkt();
    big.textContent = "Ingen registrering nå";
    sub.textContent = naaste ? `Neste: ${naaste}` : "";
    card.style.display = "none";
  }
  renderDagensListe(day, hour);
}

function nesteRegistreringstidspunkt() {
  // Gå time for time fremover (i Oslo-tid) til vi treffer en gyldig registreringsslot.
  for (let i = 1; i <= 24 * 8; i++) {
    const t = new Date(Date.now() + i * 3600 * 1000);
    const { hour, day } = osloDateParts(t);
    if (isScheduledSlot(day, hour)) {
      return `${ukedagNavn(day).toLowerCase()} kl. ${String(hour).padStart(2, "0")}:00`;
    }
  }
  return null;
}

function renderDagensListe(day, currentHour) {
  const hours = hoursForDay(day);
  const el = document.getElementById("dagensListe");
  if (!hours.length) {
    el.textContent = "Ingen planlagte registreringer i dag.";
    return;
  }
  el.innerHTML = hours
    .map((h) => {
      const passert = h < currentHour;
      const naa = h === currentHour;
      const cls = naa ? "ok" : passert ? "" : "warn";
      const label = naa ? "nå" : passert ? "passert" : "kommer";
      return `<span class="badge ${naa ? "ok" : ""}" style="margin:2px 4px 2px 0;">${String(h).padStart(2, "0")}:00 · ${label}</span>`;
    })
    .join(" ");
}

function renderPresets() {
  const grid = document.getElementById("presetGrid");
  grid.innerHTML = "";
  PRESETS.forEach((n) => {
    const b = document.createElement("button");
    b.className = "preset-btn";
    b.textContent = n;
    b.addEventListener("click", () => registrer(n));
    grid.appendChild(b);
  });
}

document.getElementById("btnAnnet").addEventListener("click", () => {
  document.getElementById("numpadWrap").style.display = "block";
  document.getElementById("numpadInput").focus();
});

document.getElementById("btnRegistrerAnnet").addEventListener("click", () => {
  const v = parseInt(document.getElementById("numpadInput").value, 10);
  if (isNaN(v) || v < 0) { alert("Skriv inn et gyldig antall (0 eller mer)."); return; }
  registrer(v);
  document.getElementById("numpadInput").value = "";
  document.getElementById("numpadWrap").style.display = "none";
});

async function sjekkEksisterendeRegistrering() {
  if (!db || !aktivSlot) return;
  const id = `${aktivSlot.dateStr}_${String(aktivSlot.hour).padStart(2, "0")}`;
  try {
    const doc = await db.collection("registrations").doc(id).get();
    const sub = document.getElementById("dueSub");
    if (doc.exists) {
      sub.textContent = `Allerede registrert: ${doc.data().count} personer. Trykk på nytt tall for å rette opp.`;
    }
  } catch (e) { console.error(e); }
}

async function registrer(antall) {
  if (!aktivSlot) return;
  if (!db) { alert("Appen er ikke koblet til Firebase ennå. Se oppsettsguiden."); return; }
  const id = `${aktivSlot.dateStr}_${String(aktivSlot.hour).padStart(2, "0")}`;
  const ref = db.collection("registrations").doc(id);
  let forrigeVerdi = null;
  try {
    const eksisterende = await ref.get();
    if (eksisterende.exists) forrigeVerdi = eksisterende.data().count;
    await ref.set(
      {
        date: aktivSlot.dateStr,
        hour: aktivSlot.hour,
        weekday: ukedagNavn(aktivSlot.day),
        count: antall,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    sisteRegistrering = { ref, forrigeVerdi, id };
    visSnackbar(`Registrert: ${antall} kl.
