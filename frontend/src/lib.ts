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
  (n: string) => `Ei ${n}, sense apuntar-te no hi ha picaeta. Queda dit 😏`,
  (n: string) => `${n}, encara no has dit si vens divendres… i la truita no espera 🍳`,
  (n: string) => `${n}, ja hi ha gent mirant-se el teu tros de truita 👀🍳`,
  (n: string) => `Alerta ${n}: les patates fregides no esperen ningú 🍟`,
  (n: string) => `${n}, apunta't o les teues olives acabaran en una altra panxa 🫒`,
  (n: string) => `${n}, el formatge ha preguntat per tu 🧀`,
  (n: string) => `${n}, sense resposta no hi ha ració. Són les normes 📜`,
  (n: string) => `Ei ${n}! Divendres hi ha picaeta i el teu nom encara no és a la llista 📝`,
  (n: string) => `${n}, si no t'apuntes, la teua croqueta ja té nou propietari 🥟`,
  (n: string) => `${n}, apuntar-se costa un clic. Quedar-se sense pernil, tota la setmana 🍖`,
  (n: string) => `${n}, la picaeta del divendres no es mira des de la finestra 🪟`,
  (n: string) => `Comunicat oficial per a ${n}: qui no s'apunta, mira com mengen els altres 🍽️`,
  (n: string) => `${n}, el Dr. Picaeta recepta: apuntar-se ja i tres olives cada huit hores 💊🫒`,
  (n: string) => `${n}, les braves ja tenen nom i el teu no hi és 🌶️`,
  (n: string) => `${n}, apunta't o divendres et toca vigilar la paperera 🗑️`,
  (n: string) => `${n}, no et faces l'interessant i apunta't a la picaeta 😎`,
  (n: string) => `Última hora: ${n} encara no s'ha apuntat i les olives estan preocupades 📰🫒`,
  (n: string) => `${n}, si no t'apuntes, divendres només t'arribarà l'olor 👃`,
  (n: string) => `${n}, la picaeta no es reserva per telepatia 🔮`,
  (n: string) => `${n}, tic-tac… les croquetes no es mengen soles (bé, sí, però sense tu) ⏰`,
  (n: string) => `${n}, la cervesa ja està freda i tu encara sense apuntar-te 🍺`,
  (n: string) => `${n}, apunta't abans que algú es menge la teua part i diga que no sabia res 🤷`,
  (n: string) => `${n}, les papes ja estan obertes i tu encara sense apuntar-te 🥔`,
  (n: string) => `${n}, hi ha un tros de coca amb el teu nom… de moment 🫓`,
  (n: string) => `${n}, sense resposta no hi ha coca. I sense coca, quin divendres és eixe? 🫓`,
  (n: string) => `${n}, la bossa de papes no dura per sempre 🥔⏳`,
  (n: string) => `${n}, si no t'apuntes, la teua coca de tomaca se l'emporta un altre 🍅🫓`,
  (n: string) => `${n}, les papes cruixen i tu callat. Vens o què? 🥔`,
  (n: string) => `Ei ${n}! Papes, coques i olives t'esperen. Només has de dir que sí 🫓🥔🫒`,
  (n: string) => `${n}, apunta't o divendres et toca mirar com desapareixen les coques 👀🫓`,
];

const GROUP_NUDGES = [
  "Qui no s'apunta, no menja 🫒",
  "Les olives no s'apunten soles 🫒",
  "L'última croqueta és per a qui s'apunta 🥟",
  "Sense apuntar-se no hi ha picaeta. Queda dit 😏",
  "La picaeta no es reserva per telepatia 🔮",
  "Última hora: les olives estan preocupades 📰🫒",
  "Les papes ja estan obertes i ací encara falta gent 🥔",
  "Qui no s'apunta, divendres només veu les molles de les coques 🫓",
  "Les coques no es reparteixen a qui no contesta. Queda dit 🫓",
  "Alerta: la bossa de papes té un límit i la paciència també 🥔⏳",
  "Comunicat oficial: sense apuntar-se no hi ha ni papes ni coques 📜",
  "Les coques ja estan al forn i la llista encara està coixa 🔥🫓",
  "Una picaeta sense resposta és com una coca sense tomaca 🍅🫓",
  "Les papes es poden fer sense vosaltres, però no és el mateix 🥔😢",
  "Divendres hi ha coques, papes i olives. Només falta que contesteu 🫓🥔🫒",
  "Les papes cruixen, les coques esperen i vosaltres sense apuntar-vos 🥔",
];

// "a, b i c"
function joinNames(names: string[]): string {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} i ${names[names.length - 1]}`;
}

// Recordatori graciós per a qui li toca preparar la picaeta.
const COOK_LINES = [
  (n: string) => `👨‍🍳 Este divendres cuina ${n}. Sense pressió, però tots confiem en tu`,
  (n: string) => `👨‍🍳 Xef de la setmana: ${n}. Les olives ja t'esperen 🫒`,
  (n: string) => `🛒 ${n}, recorda: este divendres la picaeta la portes tu. No val fer-se el despistat`,
  (n: string) => `🏆 Honor i responsabilitat: este divendres ${n} és qui porta la picaeta`,
  (n: string) => `📢 Atenció ${n}: este divendres et toca a tu! Ves fent la llista del súper 📝`,
  (n: string) => `🍳 ${n}, este divendres el davantal és teu. Que la truita t'acompanye`,
  (n: string) => `🚨 Avís per a ${n}: la picaeta d'este divendres depén de tu. Tota la pressió 😅`,
  (n: string) => `🥔 ${n}, este divendres les papes les portes tu. Que no siguen de les xicotetes!`,
  (n: string) => `🫓 ${n}, este divendres tots esperem les teues coques. Cap pressió… bé, un poc`,
  (n: string) => `🛒 ${n}, llista de la compra: papes, coques, olives i dignitat. Et toca a tu!`,
  (n: string) => `🫓 Este divendres ${n} és el mestre coquer oficial. Que no falten les de tomaca 🍅`,
];

// Tria a l'atzar sense repetir l'última eixida de la mateixa llista.
const lastPick = new Map<unknown[], number>();
function pick<T>(xs: T[]): T {
  let i;
  do i = Math.floor(Math.random() * xs.length);
  while (xs.length > 1 && i === lastPick.get(xs));
  lastPick.set(xs, i);
  return xs[i];
}

// Missatge per al grup amb qui encara no ha dit si ve a la picaeta i a qui li
// toca fer-la (per a recordar-li-ho de passada).
export function groupNudgeText(pending: string[], cook: string | null = null): string {
  const lines = [pick(GROUP_NUDGES), `Encara falten: ${joinNames(pending)}`];
  if (cook) lines.push(pick(COOK_LINES)(cook));
  lines.push(`Apunteu-vos ací 👉 ${window.location.origin}`);
  return lines.join("\n");
}

// Missatge (aleatori, mai el mateix dos voltes seguides) per a qui encara no
// ha dit si ve a la picaeta.
export function nudgeText(name: string): string {
  return `${pick(NUDGES)(name)}\nApunta't ací 👉 ${window.location.origin}`;
}
