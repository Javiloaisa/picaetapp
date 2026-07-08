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
