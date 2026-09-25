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
