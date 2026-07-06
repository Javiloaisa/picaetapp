import type { MemberStanding } from "../types";
import { relativeDays } from "../lib";

interface Props {
  assigned: MemberStanding | null;
  isMe: boolean;
  busy: boolean;
  onComplete: () => void;
  onDecline: () => void;
}

export function TurnCard({ assigned, isMe, busy, onComplete, onDecline }: Props) {
  if (!assigned) {
    return (
      <div className="rounded-3xl bg-navy-700 p-6 text-center">
        <p className="text-cream/70">
          No hay nadie a quien le toque todavía. Añade gente al equipo. 🥲
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-gradient-to-br from-navy-600 to-navy-700 p-6 shadow-xl shadow-black/30 ring-1 ring-white/5">
      <p className="text-mustard font-display font-semibold tracking-wide uppercase text-xs">
        Este viernes le toca a
      </p>
      <h2 className="font-display text-4xl font-bold text-cream mt-1 leading-none">
        {assigned.name}
      </h2>

      <div className="flex gap-4 mt-4 text-sm text-cream/60">
        <span>
          <span className="text-cream font-semibold">{assigned.count}</span>{" "}
          {assigned.count === 1 ? "picadita" : "picaditas"} este año
        </span>
        <span aria-hidden>·</span>
        <span>última: {relativeDays(assigned.last_turn)}</span>
      </div>

      {isMe ? (
        <div className="grid grid-cols-1 gap-3 mt-6">
          <button
            onClick={onComplete}
            disabled={busy}
            className="tap font-display text-lg font-bold text-navy-900 bg-mustard hover:bg-mustard-soft disabled:opacity-50 rounded-2xl px-5 py-4"
          >
            ✓ Ya compré
          </button>
          <button
            onClick={onDecline}
            disabled={busy}
            className="tap font-display font-semibold text-cream bg-white/5 hover:bg-white/10 disabled:opacity-50 rounded-2xl px-5 py-3 ring-1 ring-white/10"
          >
            Esta semana no puedo 🙈
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `¡Oye ${assigned.name}! Que este viernes te toca la picadita 🫒🍺`
            )}`}
            target="_blank"
            rel="noreferrer"
            className="tap inline-flex items-center gap-2 font-display font-semibold text-navy-900 bg-coral hover:bg-coral-soft rounded-2xl px-5 py-3"
          >
            📣 Recordárselo a {assigned.name}
          </a>
        </div>
      )}
    </div>
  );
}
