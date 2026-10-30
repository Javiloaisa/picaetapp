// Animacions gracioses que volen per damunt de la pantalla (olives, avió,
// patata...). Són efectes "d'un sol ús": creen elements fixos al <body> i
// els lleven en acabar, sense tocar l'estat de React.

export const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Torna a llançar una animació CSS encara que la classe ja hi fóra.
export function replay(el: Element | null, cls: string) {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

function spawn(text: string, x: number, y: number, size = 22): HTMLSpanElement {
  const s = document.createElement("span");
  s.textContent = text;
  s.setAttribute("aria-hidden", "true");
  Object.assign(s.style, {
    position: "fixed",
    left: `${x}px`,
    top: `${y}px`,
    fontSize: `${size}px`,
    pointerEvents: "none",
    zIndex: "60",
    willChange: "transform, opacity",
  });
  document.body.appendChild(s);
  return s;
}

function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
}

// "Vaig": el botó fa bot i ixen volant olives, croquetes i formatge.
export function oliveRain(el: HTMLElement) {
  replay(el, "fx-pop");
  if (reduceMotion()) return;
  const { x, y } = center(el);
  const items = ["🫒", "🫒", "🫒", "🥟", "🧀", "🍤", "🫒", "🥖"];
  for (let i = 0; i < 22; i++) {
    const p = spawn(items[i % items.length], x, y);
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const v = 90 + Math.random() * 110;
    const dx = Math.cos(ang) * v;
    const dy = Math.sin(ang) * v;
    p.animate(
      [
        { transform: "translate(-50%,-50%) scale(.4)", opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${Math.random() * 360}deg)`,
          opacity: 1,
          offset: 0.55,
        },
        {
          transform: `translate(calc(-50% + ${dx * 1.2}px), calc(-50% + ${dy + 140}px)) scale(.9) rotate(${Math.random() * 540}deg)`,
          opacity: 0,
        },
      ],
      { duration: 1100 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.4,1)" }
    ).onfinish = () => p.remove();
  }
}

// "No vaig": el botó tremola, cau una llagrimeta i l'oliva se'n va rodolant.
export function sadOlive(el: HTMLElement) {
  replay(el, "fx-shake");
  if (reduceMotion()) return;
  const { r } = center(el);
  const tear = spawn("💧", r.right - 6, r.top - 10, 16);
  tear.animate(
    [
      { transform: "translateY(-6px)", opacity: 0 },
      { opacity: 1, offset: 0.3 },
      { transform: "translateY(26px)", opacity: 0 },
    ],
    { duration: 900, delay: 150, easing: "ease-in", fill: "both" }
  ).onfinish = () => tear.remove();
  const olive = spawn("🫒", r.left + r.width / 2 - 12, r.top - 26, 24);
  olive.animate(
    [
      { transform: "translate(0,0) rotate(0)", opacity: 1 },
      { transform: "translate(170px, 14px) rotate(540deg)", opacity: 0 },
    ],
    { duration: 1300, delay: 450, easing: "cubic-bezier(.4,0,.6,1)", fill: "both" }
  ).onfinish = () => olive.remove();
}

// Megàfon: ones que ixen del botó.
export function rings(el: HTMLElement) {
  if (reduceMotion()) return;
  const { x, y } = center(el);
  for (let i = 0; i < 3; i++) {
    const ring = spawn("", x - 20, y - 20);
    Object.assign(ring.style, {
      width: "40px",
      height: "40px",
      borderRadius: "50%",
      border: "2px solid #cf9518",
    });
    ring.animate(
      [
        { transform: "scale(.6)", opacity: 0.8 },
        { transform: "scale(4)", opacity: 0 },
      ],
      { duration: 1000, delay: i * 200, easing: "ease-out", fill: "both" }
    ).onfinish = () => ring.remove();
  }
}

// Campaneta: un "ding!" que puja.
export function ding(el: HTMLElement) {
  if (reduceMotion()) return;
  const { r } = center(el);
  const d = spawn("ding!", r.right + 2, r.top - 4, 14);
  Object.assign(d.style, {
    fontFamily: "\"Space Grotesk\", system-ui, sans-serif",
    fontWeight: "700",
    color: "#cf9518",
  });
  d.animate(
    [
      { transform: "translateY(0) scale(.6)", opacity: 0 },
      { transform: "translateY(-14px) scale(1)", opacity: 1, offset: 0.3 },
      { transform: "translateY(-34px)", opacity: 0 },
    ],
    { duration: 1000, delay: 100, fill: "both" }
  ).onfinish = () => d.remove();
}

// Vacances: un avió creua la pantalla deixant estela.
export function plane() {
  if (reduceMotion()) return;
  const w = window.innerWidth;
  const y = window.innerHeight * 0.3;
  const p = spawn("✈️", -50, y, 34);
  p.animate(
    [
      { transform: "translate(0, 20px) rotate(-6deg)" },
      { transform: `translate(${w + 100}px, -30px) rotate(-6deg)` },
    ],
    { duration: 1700, easing: "ease-in-out" }
  ).onfinish = () => p.remove();
  const trail = spawn("", 0, y + 28);
  Object.assign(trail.style, {
    height: "2px",
    width: "0px",
    background:
      "repeating-linear-gradient(90deg, rgba(27,41,66,.45) 0 6px, transparent 6px 12px)",
    transformOrigin: "left center",
    transform: "rotate(-1.5deg)",
  });
  trail.animate(
    [
      { width: "0px", opacity: 0.6 },
      { width: `${w}px`, opacity: 0.6, offset: 0.8 },
      { width: `${w}px`, opacity: 0 },
    ],
    { duration: 2300, easing: "ease-in-out" }
  ).onfinish = () => trail.remove();
}

// Passar el torn: una patata calenta bota d'una banda a l'altra de la targeta.
export function hotPotato(el: HTMLElement) {
  replay(el, "fx-land");
  if (reduceMotion()) return;
  const r = el.getBoundingClientRect();
  const x0 = r.left + 20;
  const x1 = r.right - 50;
  const y = r.top + 10;
  const p = spawn("🥔", x0, y, 30);
  p.animate(
    [
      { transform: "translate(0,0) rotate(0)" },
      { transform: `translate(${(x1 - x0) / 2}px,-60px) rotate(200deg)`, offset: 0.5 },
      { transform: `translate(${x1 - x0}px,0) rotate(360deg)` },
    ],
    { duration: 750, easing: "ease-in-out" }
  ).onfinish = () => {
    p.remove();
    for (let k = 0; k < 3; k++) {
      const s = spawn("💨", x1 + k * 9 - 4, y - 6, 14);
      s.animate(
        [
          { transform: "translateY(0)", opacity: 0 },
          { opacity: 0.9, offset: 0.3 },
          { transform: "translateY(-24px)", opacity: 0 },
        ],
        { duration: 900, delay: k * 150, fill: "both" }
      ).onfinish = () => s.remove();
    }
  };
}

// Secret del peu de pàgina: una boca que es menja l'oliva.
export function chomp(el: HTMLElement) {
  const { x, y } = center(el);
  const m = spawn("😋", x - 22, y - 26, 44);
  m.animate(
    [
      { transform: "translateX(-90px) scale(.7)", opacity: 0 },
      { transform: "translateX(0) scale(1.1)", opacity: 1, offset: 0.4 },
      { transform: "scale(.9)", offset: 0.55 },
      { transform: "scale(1.1)", offset: 0.7 },
      { transform: "translateX(90px) scale(.8)", opacity: 0 },
    ],
    { duration: 1400, easing: "ease" }
  ).onfinish = () => m.remove();
}
