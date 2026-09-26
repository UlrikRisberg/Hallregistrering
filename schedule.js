// ---------------------------------------------------------------------------
// Vaktplan / registreringstidspunkter.
// Denne filen brukes både av selve appen (index.html) og er speilet i
// scripts/send-reminder.js som kjører på GitHub sin klokke.
// Hvis dere endrer åpningstidene til hallen, må dere endre BEGGE steder.
//
// day: 0=søndag, 1=mandag, 2=tirsdag, 3=onsdag, 4=torsdag, 5=fredag, 6=lørdag
// ---------------------------------------------------------------------------
const HALL_SCHEDULE = [
  { days: [1, 2, 3, 4, 5], hours: [16, 17, 18, 19, 20, 21, 22] }, // man-fre
  { days: [6], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] }, // lørdag
  { days: [0], hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] }, // søndag
];

// Gir listen av timer (0-23) som skal registreres for en gitt ukedag.
function hoursForDay(day) {
  const rule = HALL_SCHEDULE.find((r) => r.days.includes(day));
  return rule ? rule.hours : [];
}

// Er dette et gyldig registreringstidspunkt?
function isScheduledSlot(day, hour) {
  return hoursForDay(day).includes(hour);
}

// Finner "dagens dato" som en stabil nøkkel (YYYY-MM-DD) i Europe/Oslo-tid,
// uavhengig av hvilken tidssone serveren/telefonen faktisk står i.
function osloDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0;
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute: parseInt(parts.minute, 10),
    day: weekdayMap[parts.weekday],
  };
}

if (typeof module !== "undefined") {
  module.exports = { HALL_SCHEDULE, hoursForDay, isScheduledSlot, osloDateParts };
}
