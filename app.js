/* global firebase, HALL_SCHEDULE, hoursForDay, isScheduledSlot, osloDateParts, XLSX */

document.getElementById("hallTittel").textContent = window.HALL_NAVN || "Hallregistrering";
document.getElementById("hallNavn2").textContent = window.HALL_NAVN || "hallen";
document.getElementById("pinHallNavn").textContent = window.HALL_NAVN || "Hallregistrering";

// ---------------------------------------------------------------------------
// Taktil respons (vibrasjon) ved trykk – som når man skriver SMS.
// Merk: dette fungerer kun på enheter/nettlesere som støtter Vibration API
// (bl.a. Android/Chrome). iPhone/Safari støtter ikke denne funksjonen i det
// hele tatt (Apple har ikke lagt den til), så der vil ingenting merkes –
// appen fungerer likevel helt normalt.
function taktilRespons() {
  try {
    if (navigator.vibrate) navigator.vibrate(15);
  } catch (e) { /* ignore */ }
}

document.addEventListener(
  "click",
  (e) => {
    const el = e.target.closest("button, .switch, input[type='checkbox']");
    if (el) taktilRespons();
  },
  true
);

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
// Sørger for at appen oppdaterer seg selv automatisk hos alle brukere når det
// legges ut en ny versjon på GitHub – uten at noen må slette appen eller
// nettleserdata manuelt.
let harLastetPaNyEtterOppdatering = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (harLastetPaNyEtterOppdatering) return;
    harLastetPaNyEtterOppdatering = true;
    window.location.reload();
  });
}

async function setupServiceWorkerAndMessaging() {
  if (!("serviceWorker" in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register("service-worker.js");
    // Sjekk med en gang om det finnes en nyere versjon, og fortsett å sjekke
    // jevnlig mens appen er åpen (nyttig når en vakt har appen åpen lenge).
    swRegistration.update();
    setInterval(() => {
      if (swRegistration) swRegistration.update();
    }, 5 * 60 * 1000);
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
      const forrigeToken = localStorage.getItem("fcm_token");
      if (forrigeToken && forrigeToken !== token) {
        // Firebase har byttet ut push-nøkkelen for denne telefonen (skjer
        // innimellom, f.eks. etter en app-oppdatering). Slett den gamle
        // nøkkelen først, ellers mottar denne telefonen varsler to ganger –
        // én gang per nøkkel.
        try { await db.collection("device_tokens").doc(forrigeToken).delete(); } catch (e) { /* ignore */ }
      }
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
    const varAlleredeAktiv = btn.classList.contains("active");
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "historikk") lastHistorikk();
    if (btn.dataset.view === "hjem" && !varAlleredeAktiv) {
      // Hver gang man navigerer inn på registreringssiden skal aktivitetene
      // være tomme igjen – de skal velges på nytt hver gang.
      valgteAktiviteter = new Set();
      renderAktiviteter();
    }
  });
});

// ---------------------------------------------------------------------------
// Registreringsvisning
// ---------------------------------------------------------------------------
const PRESETS = [0, 5, 10, 15, 20, 25, 30, 40, 50];
const AKTIVITETER = [
  "Basketball",
  "Håndball",
  "Fotball",
  "Badminton",
  "Fleridrett/friidrett",
  "Volleyball",
  "Innebandy",
  "Åpen Hall",
  "Bordtennis",
  "Frilek/uorganisert aktivitet",
];
let valgteAktiviteter = new Set();
let sisteAktivSlotId = null;
let aktivSlot = null; // { dateStr, hour }
let sisteRegistrering = null; // for angre-knapp
let harRegistrertGjeldendeSlot = false;

// ---------------------------------------------------------------------------
// Rødt tall-ikon (badge) på selve app-ikonet når det er en registrering som
// venter og ingen har fylt den ut ennå. Fungerer på iPhone (Safari 16.4+,
// installert som app) og de fleste Android-nettlesere. Der det ikke støttes,
// skjer det bare ingenting – appen fungerer likevel helt normalt.
// ---------------------------------------------------------------------------
function oppdaterAppIkonBadge() {
  try {
    if (aktivSlot && !harRegistrertGjeldendeSlot) {
      if ("setAppBadge" in navigator) navigator.setAppBadge(1);
    } else {
      if ("clearAppBadge" in navigator) navigator.clearAppBadge();
    }
  } catch (e) { /* ignore */ }
}

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
    const slotId = `${dateStr}_${String(hour).padStart(2, "0")}`;
    if (slotId !== sisteAktivSlotId) {
      valgteAktiviteter = new Set();
      sisteAktivSlotId = slotId;
      harRegistrertGjeldendeSlot = false;
    }
    banner.classList.remove("idle");
    big.textContent = `Registrer for kl. ${String(hour).padStart(2, "0")}:00`;
    sub.textContent = "Trykk på riktig antall under";
    card.style.display = "block";
    renderPresets();
    renderAktiviteter();
    sjekkEksisterendeRegistrering();
    oppdaterAppIkonBadge();
  } else {
    aktivSlot = null;
    harRegistrertGjeldendeSlot = false;
    oppdaterAppIkonBadge();
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

function renderAktiviteter() {
  const grid = document.getElementById("aktivitetGrid");
  grid.innerHTML = "";
  AKTIVITETER.forEach((navn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "aktivitet-chip" + (valgteAktiviteter.has(navn) ? " valgt" : "");
    b.textContent = navn;
    b.addEventListener("click", () => {
      if (valgteAktiviteter.has(navn)) valgteAktiviteter.delete(navn);
      else valgteAktiviteter.add(navn);
      b.classList.toggle("valgt");
    });
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
    harRegistrertGjeldendeSlot = doc.exists;
    if (doc.exists) {
      const data = doc.data();
      sub.textContent = `Allerede registrert: ${data.count} personer. Trykk på nytt tall for å rette opp.`;
      // Merk: aktivitetene fylles bevisst IKKE ut på nytt her – de skal alltid
      // være tomme til man selv trykker på dem.
    }
    oppdaterAppIkonBadge();
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
        activities: Array.from(valgteAktiviteter),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    sisteRegistrering = { ref, forrigeVerdi, id };
    visSnackbar(`Registrert: ${antall} kl. ${String(aktivSlot.hour).padStart(2, "0")}:00`);
    sjekkEksisterendeRegistrering();
  } catch (e) {
    console.error(e);
    alert("Klarte ikke å lagre registreringen. Sjekk internettforbindelsen og prøv igjen.");
  }
}

let snackbarTimer = null;
function visSnackbar(tekst) {
  const bar = document.getElementById("snackbar");
  document.getElementById("snackbarText").textContent = tekst;
  bar.classList.add("show");
  clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => bar.classList.remove("show"), 6000);
}

document.getElementById("snackbarUndo").addEventListener("click", async () => {
  if (!sisteRegistrering) return;
  const { ref, forrigeVerdi } = sisteRegistrering;
  try {
    if (forrigeVerdi === null) {
      await ref.delete();
    } else {
      await ref.set({ count: forrigeVerdi, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    document.getElementById("snackbar").classList.remove("show");
    sjekkEksisterendeRegistrering();
  } catch (e) { console.error(e); }
});

// ---------------------------------------------------------------------------
// Vaktbekreftelse (delt mellom ALLE enheter via Firestore – én felles status)
// ---------------------------------------------------------------------------
// Én enkelt, delt "dokument" i Firestore holder styr på om noen er bekreftet
// på vakt akkurat nå. Alle telefoner lytter på denne (sanntid), slik at når
// én person trykker, blir ikonet grønt/rødt med én gang hos alle andre også.
let vaktGjeldende = { bekreftet: false, dato: null, tid: null };
let vaktLytterStartet = false;

function vaktBekreftetIDag() {
  const { dateStr } = osloDateParts();
  return !!vaktGjeldende.bekreftet && vaktGjeldende.dato === dateStr;
}

function renderVaktStatus() {
  const bekreftet = vaktBekreftetIDag();
  const knapp = document.getElementById("btnVaktBekreft");
  const knappTekst = document.getElementById("vaktKnappTekst");
  const tekst = document.getElementById("vaktStatusTekst");
  const tabIkon = document.getElementById("vaktTabIkon");
  if (!knapp || !tekst) return;
  knapp.classList.toggle("bekreftet", bekreftet);
  if (knappTekst) knappTekst.textContent = bekreftet ? "VAKT REGISTRERT" : "IKKE PÅ VAKT";
  if (bekreftet) {
    tekst.textContent = vaktGjeldende.tid ? `Bekreftet kl. ${vaktGjeldende.tid}` : "Bekreftet for i dag";
  } else {
    tekst.textContent = "Ikke bekreftet ennå";
  }
  if (tabIkon) tabIkon.textContent = bekreftet ? "🟢" : "🔴";
}

function startVaktLytting() {
  if (!db || vaktLytterStartet) return;
  vaktLytterStartet = true;
  db.collection("vakt_status")
    .doc("gjeldende")
    .onSnapshot(
      (doc) => {
        const data = doc.exists ? doc.data() : {};
        vaktGjeldende = {
          bekreftet: !!data.bekreftet,
          dato: data.dato || null,
          tid: data.tid || null,
        };
        renderVaktStatus();
      },
      (e) => {
        console.error("Klarte ikke å lytte på felles vaktstatus", e);
      }
    );
}

document.getElementById("btnVaktBekreft")?.addEventListener("click", async () => {
  if (!db) {
    alert("Appen er ikke koblet til Firebase ennå. Se oppsettsguiden.");
    return;
  }
  const { dateStr } = osloDateParts();
  const ref = db.collection("vakt_status").doc("gjeldende");
  try {
    if (vaktBekreftetIDag()) {
      await ref.set(
        { bekreftet: false, dato: dateStr, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    } else {
      const naa = new Date();
      const tid = `${String(naa.getHours()).padStart(2, "0")}:${String(naa.getMinutes()).padStart(2, "0")}`;
      await ref.set(
        { bekreftet: true, dato: dateStr, tid, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    // Ikonet/knappen oppdateres automatisk for alle (inkl. denne enheten) via onSnapshot over.
  } catch (e) {
    console.error(e);
    alert("Klarte ikke å oppdatere vaktstatus. Sjekk internettforbindelsen og prøv igjen.");
  }
});

// ---------------------------------------------------------------------------
// Dra-for-å-oppdatere (pull-to-refresh)
// ---------------------------------------------------------------------------
// Fungerer uansett hvilken fane man står i. Henter fersk data fra Firestore:
// dagens registreringer/antall (Hjem), historikk-tabellen (hvis den fanen er
// åpen), og tegner vaktstatusen på nytt. Vaktstatusen i seg selv er allerede
// sanntidsoppdatert for alle via startVaktLytting()/onSnapshot – dette er en
// ekstra, tydelig måte å be om en fersk oppdatering av ALT på, for alle faner.
const PTR_TERSKEL = 70; // px man må dra ned før man slipper for å utløse oppdatering
let ptrStartY = null;
let ptrTrekker = false;
let ptrOppdaterer = false;

function ptrIndikator() {
  return document.getElementById("ptrIndikator");
}

function settPtrTrekk(avstand) {
  const el = ptrIndikator();
  if (!el) return;
  const synligAvstand = Math.min(avstand, PTR_TERSKEL * 1.6);
  el.style.transform = `translate(-50%, ${-60 + synligAvstand}px)`;
  el.classList.toggle("visible", avstand > 4);
  el.classList.toggle("klar", avstand >= PTR_TERSKEL);
}

async function kjorOppdatering() {
  if (ptrOppdaterer) return;
  ptrOppdaterer = true;
  const el = ptrIndikator();
  if (el) {
    el.classList.add("loading", "visible");
    el.style.transform = "translate(-50%, 18px)";
  }
  taktilRespons();
  try {
    renderDueBanner();
    if (db) await sjekkEksisterendeRegistrering();
    const aktivFane = document.querySelector(".tab-btn.active")?.dataset.view;
    if (aktivFane === "historikk") await lastHistorikk();
    renderVaktStatus();
  } catch (e) {
    console.error("Feil ved manuell oppdatering", e);
  } finally {
    setTimeout(() => {
      ptrOppdaterer = false;
      if (el) {
        el.classList.remove("loading", "visible", "klar");
        el.style.transform = "translate(-50%, -60px)";
      }
    }, 400);
  }
}

document.addEventListener(
  "touchstart",
  (e) => {
    if (ptrOppdaterer) return;
    if ((document.scrollingElement || document.documentElement).scrollTop > 0) {
      ptrStartY = null;
      ptrTrekker = false;
      return;
    }
    ptrStartY = e.touches[0].clientY;
    ptrTrekker = true;
  },
  { passive: true }
);

document.addEventListener(
  "touchmove",
  (e) => {
    if (!ptrTrekker || ptrStartY === null || ptrOppdaterer) return;
    const avstand = e.touches[0].clientY - ptrStartY;
    if (avstand > 0 && (document.scrollingElement || document.documentElement).scrollTop === 0) {
      settPtrTrekk(avstand * 0.5); // litt "motstand" for en mer naturlig følelse
    } else {
      settPtrTrekk(0);
    }
  },
  { passive: true }
);

document.addEventListener("touchend", () => {
  if (!ptrTrekker) return;
  ptrTrekker = false;
  const el = ptrIndikator();
  const klar = el && el.classList.contains("klar");
  ptrStartY = null;
  if (klar) {
    kjorOppdatering();
  } else if (el) {
    el.classList.remove("visible");
    el.style.transform = "translate(-50%, -60px)";
  }
});

// ---------------------------------------------------------------------------
// Historikk / filter / eksport
// ---------------------------------------------------------------------------
const filtTimeSelect = document.getElementById("filtTime");
for (let h = 0; h < 24; h++) {
  const opt = document.createElement("option");
  opt.value = h;
  opt.textContent = String(h).padStart(2, "0") + ":00";
  filtTimeSelect.appendChild(opt);
}

document.getElementById("filtHurtig").addEventListener("change", (e) => {
  document.getElementById("egendefinertRad").style.display = e.target.value === "egendefinert" ? "flex" : "none";
  lastHistorikk();
});
document.getElementById("filtFra").addEventListener("change", lastHistorikk);
document.getElementById("filtTil").addEventListener("change", lastHistorikk);
document.getElementById("filtTime").addEventListener("change", lastHistorikk);

function periodeTilDatoer(valg) {
  const { dateStr } = osloDateParts();
  const idag = new Date(dateStr + "T00:00:00");
  let fra = new Date(idag);
  let til = new Date(idag);
  if (valg === "idag") {
    // fra = til = idag
  } else if (valg === "uke") {
    const ukedag = (idag.getDay() + 6) % 7; // mandag = 0
    fra.setDate(idag.getDate() - ukedag);
  } else if (valg === "maned") {
    fra = new Date(idag.getFullYear(), idag.getMonth(), 1);
  } else if (valg === "ar") {
    fra = new Date(idag.getFullYear(), 0, 1);
  }
  const iso = (d) => {
    const aar = d.getFullYear();
    const maned = String(d.getMonth() + 1).padStart(2, "0");
    const dag = String(d.getDate()).padStart(2, "0");
    return `${aar}-${maned}-${dag}`;
  };
  return { fra: iso(fra), til: iso(til) };
}

let sisteHistorikkData = [];

async function lastHistorikk() {
  const wrap = document.getElementById("histTabellWrap");
  if (!db) {
    wrap.innerHTML = '<div class="empty-state">Appen er ikke koblet til Firebase ennå.</div>';
    return;
  }
  wrap.innerHTML = '<div class="empty-state">Laster …</div>';

  const valg = document.getElementById("filtHurtig").value;
  let fra, til;
  if (valg === "egendefinert") {
    fra = document.getElementById("filtFra").value;
    til = document.getElementById("filtTil").value;
    if (!fra || !til) { wrap.innerHTML = '<div class="empty-state">Velg fra- og til-dato.</div>'; return; }
  } else {
    ({ fra, til } = periodeTilDatoer(valg));
  }

  try {
    const snap = await db
      .collection("registrations")
      .where("date", ">=", fra)
      .where("date", "<=", til)
      .orderBy("date")
      .orderBy("hour")
      .get();

    let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const timeFilter = document.getElementById("filtTime").value;
    if (timeFilter !== "") rows = rows.filter((r) => r.hour === parseInt(timeFilter, 10));

    sisteHistorikkData = rows;
    document.getElementById("antallTreff").textContent = `${rows.length} registrering(er) i valgt periode. Sum: ${rows.reduce((s, r) => s + (r.count || 0), 0)} personer.`;

    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-state">Ingen registreringer i denne perioden.</div>';
      return;
    }

    wrap.innerHTML = `<div style="overflow-x:auto;"><table class="hist">
      <thead><tr><th>Dato</th><th>Ukedag</th><th>Kl.</th><th>Antall</th><th>Aktivitet(er)</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
            <td>${r.date}</td>
            <td>${r.weekday || ""}</td>
            <td>${String(r.hour).padStart(2, "0")}:00</td>
            <td>${r.count}</td>
            <td>${(r.activities || []).join(", ")}</td>
            <td><button class="rediger-btn" data-id="${r.id}" data-dato="${r.date}" data-time="${String(r.hour).padStart(2, "0")}:00" data-count="${r.count}" data-activities="${(r.activities || []).join(",")}">Rediger</button></td>
          </tr>`
        )
        .join("")}</tbody>
    </table></div>`;

    wrap.querySelectorAll(".rediger-btn").forEach((btn) => {
      btn.addEventListener("click", () => apneRedigering(btn));
    });
  } catch (e) {
    console.error(e);
    wrap.innerHTML = '<div class="empty-state">Klarte ikke å hente data. (Kan hende Firestore-indeksen må opprettes første gang – se feilmelding i nettleserkonsollen for en lenke som gjør det automatisk.)</div>';
  }
}

function apneRedigering(btn) {
  // Lukk en eventuell annen åpen redigeringsboks først.
  document.querySelectorAll(".rediger-rad").forEach((el) => el.remove());

  const id = btn.dataset.id;
  const dato = btn.dataset.dato;
  const tid = btn.dataset.time;
  const antallNaa = parseInt(btn.dataset.count, 10) || 0;
  const aktiviteterNaa = btn.dataset.activities ? btn.dataset.activities.split(",").filter(Boolean) : [];
  const valgt = new Set(aktiviteterNaa);

  const rad = document.createElement("tr");
  rad.className = "rediger-rad";
  const celle = document.createElement("td");
  celle.colSpan = 6;
  celle.innerHTML = `
    <div class="rediger-panel">
      <p class="muted" style="margin:0 0 8px;">Rediger ${dato} kl. ${tid}</p>
      <div class="aktivitet-grid" id="redigerAktivitetGrid"></div>
      <input type="number" inputmode="numeric" min="0" class="numpad-input" id="redigerAntall" value="${antallNaa}" />
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="action-btn secondary" id="redigerAvbryt" type="button">Avbryt</button>
        <button class="action-btn" id="redigerLagre" type="button">Lagre</button>
      </div>
    </div>
  `;
  rad.appendChild(celle);
  btn.closest("tr").after(rad);

  const grid = celle.querySelector("#redigerAktivitetGrid");
  AKTIVITETER.forEach((navn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "aktivitet-chip" + (valgt.has(navn) ? " valgt" : "");
    b.textContent = navn;
    b.addEventListener("click", () => {
      if (valgt.has(navn)) valgt.delete(navn);
      else valgt.add(navn);
      b.classList.toggle("valgt");
    });
    grid.appendChild(b);
  });

  celle.querySelector("#redigerAvbryt").addEventListener("click", () => rad.remove());

  celle.querySelector("#redigerLagre").addEventListener("click", async () => {
    const nyttAntallStr = celle.querySelector("#redigerAntall").value;
    const nyttAntall = parseInt(nyttAntallStr, 10);
    if (isNaN(nyttAntall) || nyttAntall < 0) {
      alert("Skriv inn et gyldig antall (0 eller mer).");
      return;
    }
    try {
      await db.collection("registrations").doc(id).set(
        {
          count: nyttAntall,
          activities: Array.from(valgt),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      lastHistorikk();
    } catch (e) {
      console.error(e);
      alert("Klarte ikke å oppdatere registreringen. Sjekk internettforbindelsen og prøv igjen.");
    }
  });
}

document.getElementById("btnEksporter").addEventListener("click", () => {
  if (!sisteHistorikkData.length) { alert("Ingen data å eksportere i valgt periode."); return; }
  const data = sisteHistorikkData.map((r) => ({
    Dato: r.date,
    Ukedag: r.weekday || "",
    Klokkeslett: String(r.hour).padStart(2, "0") + ":00",
    Antall: r.count,
    Aktiviteter: (r.activities || []).join(", "),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Registreringer");
  XLSX.writeFile(wb, `hallregistrering_${new Date().toISOString().slice(0, 10)}.xlsx`);
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function installasjonsstatus() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const el = document.getElementById("installStatus");
  el.textContent = standalone ? "Installert ✓" : "Ikke installert (åpnet i nettleser)";
  el.classList.toggle("ok", standalone);
}

function startApp() {
  renderDueBanner();
  renderVaktStatus();
  startVaktLytting();
  installasjonsstatus();
  setupServiceWorkerAndMessaging();
  setInterval(renderDueBanner, 60 * 1000);
  // Denne trengs fortsatt for å rulle ikonet tilbake til rødt automatisk ved
  // midnatt, selv om ingen trykker på knappen – selve deling mellom enheter
  // skjer i sanntid via startVaktLytting() over.
  setInterval(renderVaktStatus, 60 * 1000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "APNE_REGISTRERING") {
        document.querySelector('.tab-btn[data-view="hjem"]').click();
        renderDueBanner();
      }
    });
  }
}

initPinGate();
