// Speiler ../schedule.js (samme regler), men skrevet som ren Node-modul
// siden GitHub Actions kjører dette uten nettleser.
//
// VIKTIG: Hvis dere endrer åpningstidene i ../schedule.js, må dere gjøre
// den samme endringen her.
const HALL_SCHEDULE = [
  { days: [1, 2, 3, 4, 5], hours: [16, 17, 18, 19, 20, 21, 22] }, // man-fre
  { days: [6], hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] }, // lørdag
  { days: [0], hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] }, // søndag
];

function hoursForDay(day) {
  const rule = HALL_SCHEDULE.find((r) => r.days.includes(day));
  return rule ? rule.hours : [];
}

function isScheduledSlot(day, hour) {
  return hoursForDay(day).includes(hour);
}

function osloDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
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
    day: weekdayMap[parts.weekday],
  };
}

module.exports = { HALL_SCHEDULE, hoursForDay, isScheduledSlot, osloDateParts };
