// Klinika vaqt zonasi bilan ishlash yordamchilari

function offsetMs(utcMs: number, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(utcMs))
      .map(({ type, value }) => [type, value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// "2027-01-05T09:00" (klinika mahalliy vaqti) -> UTC ISO
export function clinicLocalToUtcIso(local: string, timeZone: string) {
  const [d, t] = local.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  return new Date(guess - offsetMs(guess, timeZone)).toISOString();
}
