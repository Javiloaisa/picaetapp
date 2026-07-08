import { useState } from "react";
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
  onNotHere: () => void;
}

// Confirmació en dos passos per a no passar el torn sense voler d'un sol toc.
function ConfirmPass({
  question,
  busy,
  onConfirm,
  onCancel,
}: {
  question: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl bg-navy-900/[0.06] ring-1 ring-navy-900/10 p-4">
      <p className="text-ink text-sm font-semibold">{question}</p>
      <p className="text-ink/60 text-sm mt-1">Passarà el torn al següent.</p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="tap flex-1 font-display font-semibold text-navy-900 bg-coral hover:bg-coral-soft disabled:opacity-50 rounded-2xl px-4 py-2.5"
        >
          Sí, passa el torn
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="tap shrink-0 font-display font-semibold text-ink bg-navy-900/5 hover:bg-navy-900/10 disabled:opacity-50 rounded-2xl px-4 py-2.5"
        >
          Cancel·la
        </button>
      </div>
    </div>
  );
}

export function TurnCard({
  assigned,
  isMe,
  busy,
  reminding,
  onDecline,
  onRemind,
  onGoVacation,
  onNotHere,
}: Props) {
  const [confirming, setConfirming] = useState<null | "self" | "other">(null);

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
          {confirming === "self" ? (
            <ConfirmPass
              question="No pots esta setmana?"
              busy={busy}
              onConfirm={() => {
                onDecline();
                setConfirming(null);
              }}
              onCancel={() => setConfirming(null)}
            />
          ) : (
            <button
              onClick={() => setConfirming("self")}
              disabled={busy}
              className="tap w-full font-display font-semibold text-ink bg-navy-900/5 hover:bg-navy-900/10 disabled:opacity-50 rounded-2xl px-5 py-3 ring-1 ring-navy-900/10"
            >
              Esta setmana no puc 🙈
            </button>
          )}
          <button
            onClick={onGoVacation}
            className="tap w-full text-ink/60 hover:text-ink text-sm py-1"
          >
            🏖️ Me'n vaig uns dies (vacances)
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <button
            onClick={onRemind}
            disabled={reminding}
            className="tap inline-flex items-center gap-2 font-display font-semibold text-navy-900 bg-coral hover:bg-coral-soft disabled:opacity-60 rounded-2xl px-5 py-3"
          >
            {reminding ? "Avisant…" : `📣 Recordar-li-ho a ${assigned.name}`}
          </button>
          {confirming === "other" ? (
            <ConfirmPass
              question={`${assigned.name} no pot esta setmana?`}
              busy={busy}
              onConfirm={() => {
                onNotHere();
                setConfirming(null);
              }}
              onCancel={() => setConfirming(null)}
            />
          ) : (
            <button
              onClick={() => setConfirming("other")}
              disabled={busy}
              className="tap block w-full text-ink/50 hover:text-ink/80 text-sm py-1 disabled:opacity-50"
            >
              {assigned.name} no pot esta setmana? Passa el torn
            </button>
          )}
        </div>
      )}
    </div>
  );
}
