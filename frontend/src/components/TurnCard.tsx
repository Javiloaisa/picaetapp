import type { MemberStanding } from "../types";
import { relativeDays } from "../lib";

interface Props {
  assigned: MemberStanding | null;
  isMe: boolean;
  busy: boolean;
  reminding: boolean;
  onDecline: () => void;
  onRemind: () => void;
  onGoVacation: () => void;
}

export function TurnCard({
  assigned,
  isMe,
  busy,
  reminding,
  onDecline,
  onRemind,
  onGoVacation,
}: Props) {
  if (!assigned) {
    return (
      <div className="rounded-3xl bg-navy-900/[0.04] ring-1 ring-navy-900/10 p-6 text-center">
        <p className="text-ink/70">
          No hi ha ningú a qui li toque ara mateix. Igual estan tots de vacances. 🏖️
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-gradient-to-br from-mustard/20 to-coral/10 p-6 shadow-lg shadow-mustard/10 ring-1 ring-mustard/30">
      <p className="text-mustard font-display font-semibold tracking-wide uppercase text-xs">
        Este divendres li toca a
      </p>
      <h2 className="font-display text-4xl font-bold text-ink mt-1 leading-none">
        {assigned.name}
      </h2>

      <div className="flex gap-4 mt-4 text-sm text-ink/60">
        <span>
          <span className="text-ink font-semibold">{assigned.count}</span>{" "}
          {assigned.count === 1 ? "picaeta" : "picaetes"} enguany
        </span>
        <span aria-hidden>·</span>
        <span>última: {relativeDays(assigned.last_turn)}</span>
      </div>

      {isMe ? (
        <div className="mt-6 space-y-3">
          <p className="text-ink/70 text-sm">
            Esta setmana la portes tu. No cal marcar res: en passar el divendres
            es dona per feta. 🫒
          </p>
          <button
            onClick={onDecline}
            disabled={busy}
            className="tap w-full font-display font-semibold text-ink bg-navy-900/5 hover:bg-navy-900/10 disabled:opacity-50 rounded-2xl px-5 py-3 ring-1 ring-navy-900/10"
          >
            Esta setmana no puc 🙈
          </button>
          <button
            onClick={onGoVacation}
            className="tap w-full text-ink/60 hover:text-ink text-sm py-1"
          >
            🏖️ Me'n vaig uns dies (vacances)
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <button
            onClick={onRemind}
            disabled={reminding}
            className="tap inline-flex items-center gap-2 font-display font-semibold text-navy-900 bg-coral hover:bg-coral-soft disabled:opacity-60 rounded-2xl px-5 py-3"
          >
            {reminding ? "Avisant…" : `📣 Recordar-li-ho a ${assigned.name}`}
          </button>
        </div>
      )}
    </div>
  );
}
