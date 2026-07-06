// Utilidades pequeñas de formato de fechas. La identidad ya no vive aquí:
// la sesión la lleva la cookie HttpOnly (ver api.ts / auth.py).

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function formatDate(iso: string | null): string {
  if (!iso) return "nunca";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function relativeDays(iso: string | null): string {
  if (!iso) return "aún no ha comprado";
  const then = new Date(iso + "T00:00:00");
  const now = new Date();
  const days = Math.round(
    (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 0) return "hoy";
  if (days === 1) return "hace 1 día";
  if (days < 7) return `hace ${days} días`;
  const weeks = Math.round(days / 7);
  if (weeks === 1) return "hace 1 semana";
  if (weeks < 5) return `hace ${weeks} semanas`;
  const months = Math.round(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}
