// Utilitats xicotetes de format de dates (en valencià). La identitat ja no viu
// ací: la sessió la porta la cookie HttpOnly (veure api.ts / auth.py).

const MONTHS = [
  "gen", "febr", "març", "abr", "maig", "juny",
  "jul", "ag", "set", "oct", "nov", "des",
];

export function formatDate(iso: string | null): string {
  if (!iso) return "mai";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Vacances "sense data de tornada" (standby): es guarda com a away_until
// molt llunyà. Es mostra com a "en standby" en compte de la data.
export function awayLabel(iso: string | null, lastTurn?: string | null): string {
  if (iso && iso >= "2999-01-01") {
    return lastTurn !== undefined
      ? `⏸️ en standby · última: ${formatDate(lastTurn)}`
      : "⏸️ en standby";
  }
  return `🏖️ fins al ${formatDate(iso)}`;
}

export function relativeDays(iso: string | null): string {
  if (!iso) return "encara no ha comprat";
  const then = new Date(iso + "T00:00:00");
  const now = new Date();
  const days = Math.round(
    (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 0) return "hui";
  if (days === 1) return "fa 1 dia";
  if (days < 7) return `fa ${days} dies`;
  const weeks = Math.round(days / 7);
  if (weeks === 1) return "fa 1 setmana";
  if (weeks < 5) return `fa ${weeks} setmanes`;
  const months = Math.round(days / 30);
  return months === 1 ? "fa 1 mes" : `fa ${months} mesos`;
}

// Enllaç de WhatsApp amb el text ja escrit. Amb mòbil obri directament el xat
// d'eixa persona; sense, WhatsApp et deixa triar a qui enviar-ho.
export function waLink(phone: string | null, text: string): string {
  return `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;
}

const NUDGES = [
  (n: string) => `Ei ${n}! Qui no s'apunta, no menja 🫒`,
  (n: string) => `${n}, les olives no s'apunten soles 🫒 Vens divendres o què?`,
  (n: string) => `${n}! L'última croqueta és per a qui s'apunta 🥟`,
  (n: string) => `Ei ${n}, sense apuntar-te no hi ha picaeta. Avisat quedes 😏`,
  (n: string) => `${n}, encara no has dit si vens divendres… i la truita no espera 🍳`,
];

// Missatge (aleatori) per a qui encara no ha dit si ve a la picaeta.
export function nudgeText(name: string): string {
  const pick = NUDGES[Math.floor(Math.random() * NUDGES.length)];
  return `${pick(name)}\nApunta't ací 👉 ${window.location.origin}`;
}
