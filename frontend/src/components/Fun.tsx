// Peces visuals menudes de les animacions gracioses (veure fx.ts i index.css).
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { reduceMotion } from "../fx";

// Nom que gira com una escurabutxaques fins a parar en `name`.
// Gira en entrar a l'app i, més curt, cada volta que canvia el nom.
export function SlotName({ name, pool }: { name: string; pool: string[] }) {
  const prev = useRef<string | null>(null);
  const [seq, setSeq] = useState<string[]>([name]);
  const reel = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (prev.current === name) return;
    const first = prev.current === null;
    prev.current = name;
    const others = pool.filter((n) => n !== name);
    if (reduceMotion() || others.length === 0) {
      setSeq([name]);
      return;
    }
    const spins = first ? 16 : 6;
    const s: string[] = [];
    for (let i = 0; i < spins; i++) {
      s.push(others[Math.floor(Math.random() * others.length)]);
    }
    s.push(name);
    setSeq(s);
  }, [name, pool]);

  useLayoutEffect(() => {
    const el = reel.current;
    if (!el || seq.length < 2) return;
    const h = (el.firstElementChild as HTMLElement).offsetHeight;
    const anim = el.animate(
      [
        { transform: "translateY(0)" },
        { transform: `translateY(${-h * (seq.length - 1)}px)` },
      ],
      {
        duration: seq.length > 8 ? 1800 : 900,
        easing: "cubic-bezier(.15,.6,.25,1)",
        fill: "forwards",
      }
    );
    // Es queda parada al final (fill) fins que React deixa només el nom bo;
    // llavors el cleanup cancel·la l'animació sense parpelleig.
    anim.onfinish = () => setSeq([seq[seq.length - 1]]);
    return () => anim.cancel();
  }, [seq]);

  return (
    <span className="block overflow-hidden h-[1.1em]">
      <span ref={reel} className="block">
        {seq.map((n, i) => (
          <span key={i} className="block h-[1.1em] leading-[1.1em] truncate">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

// "Carregant…" amb una oliva que va i ve.
export function OliveLoader({ text = "Preparant la picaeta" }: { text?: string }) {
  return (
    <div className="relative h-16 w-full max-w-xs mx-auto" role="status">
      <p className="text-center text-ink/50 text-sm">
        {text}
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block"
            style={{ animation: reduceMotion() ? undefined : `fx-dot 1.2s ${i * 0.2}s infinite` }}
          >
            .
          </span>
        ))}
      </p>
      <div className="absolute inset-x-0 bottom-2 h-0.5 rounded bg-navy-900/10" />
      <span
        aria-hidden
        className="absolute bottom-2.5 left-1/2 text-3xl leading-none"
        style={{
          animation: reduceMotion()
            ? undefined
            : "fx-roll-olive 2.2s cubic-bezier(.45,.05,.55,.95) infinite alternate",
        }}
      >
        🫒
      </span>
    </div>
  );
}

// Els divendres: garlanda de banderetes i títol que bota lletra a lletra.
export function FridayBanner() {
  const colors = ["#cf9518", "#db5640", "#6b7a2a"];
  const text = "Hui és divendres! 🎉";
  const still = reduceMotion();
  return (
    <div className="relative rounded-2xl bg-mustard/10 pt-7 pb-3 text-center overflow-hidden">
      <div aria-hidden className="absolute top-0 inset-x-0 flex justify-around">
        {Array.from({ length: 11 }, (_, i) => (
          <span
            key={i}
            className="block w-0 h-0 origin-top"
            style={{
              borderLeft: "11px solid transparent",
              borderRight: "11px solid transparent",
              borderTop: `18px solid ${colors[i % 3]}`,
              animation: still
                ? undefined
                : `fx-sway ${1.6 + (i % 3) * 0.3}s ease-in-out ${i * 0.1}s infinite`,
            }}
          />
        ))}
      </div>
      <p className="font-display text-2xl font-bold text-ink" aria-label={text}>
        {[...text].map((c, i) => (
          <span
            key={i}
            aria-hidden
            className="inline-block"
            style={{ animation: still ? undefined : `fx-hop .6s ease ${i * 0.05}s` }}
          >
            {c === " " ? " " : c}
          </span>
        ))}
      </p>
    </div>
  );
}

// Número que puja com un marcador quan canvia (no en la primera pintada).
export function RollingNumber({ value }: { value: number }) {
  const prev = useRef(value);
  const changed = prev.current !== value;
  useLayoutEffect(() => {
    prev.current = value;
  });
  return (
    <span key={value} className={changed ? "fx-roll" : ""}>
      {value}
    </span>
  );
}

// FLIP: quan una llista es reordena, cada fila llisca del lloc vell al nou.
// Les files han de portar `data-key`.
export function useFlip(ref: RefObject<HTMLElement | null>) {
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Posicions relatives a la llista, perquè fer scroll no compte com moure's.
    const origin = el.getBoundingClientRect().top;
    const now = new Map<string, number>();
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const key = child.dataset.key;
      if (!key) continue;
      const top = child.getBoundingClientRect().top - origin;
      now.set(key, top);
      const before = last.current.get(key);
      if (before !== undefined && Math.abs(before - top) > 1 && !reduceMotion()) {
        child.animate(
          [{ transform: `translateY(${before - top}px)` }, { transform: "none" }],
          { duration: 550, easing: "cubic-bezier(.3,1.25,.5,1)" }
        );
      }
    }
    last.current = now;
  });
}
