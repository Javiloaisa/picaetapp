import { useState } from "react";
import type { HistoryEntry } from "../types";
import { formatDate } from "../lib";

interface Props {
  history: HistoryEntry[];
  busy: boolean;
  // done=false: "no la va fer" (no compta i queda pendent per a la pròxima).
  onSetDone: (turnId: string, done: boolean) => void;
}

export function History({ history, busy, onSetDone }: Props) {
  // Confirmació en dos passos, com en declinar el torn.
  const [confirming, setConfirming] = useState<string | null>(null);

  if (history.length === 0) return null;

  return (
    <section>
      <h3 className="font-display font-semibold text-ink/80 mb-3">
        Últimes picaetes
      </h3>
      <ul className="space-y-1.5">
        {history.map((h) => (
          <li
            key={h.id}
            className="text-sm rounded-xl px-4 py-2.5 bg-navy-900/[0.03]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={h.done ? "text-ink/90" : "text-ink/40 line-through"}>
                🫒 {h.name}
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="text-ink/40">{formatDate(h.date)}</span>
                {h.done ? (
                  confirming !== h.id && (
                    <button
                      onClick={() => setConfirming(h.id)}
                      disabled={busy}
                      className="tap text-xs text-ink/40 hover:text-coral disabled:opacity-40"
                    >
                      No la va fer
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => onSetDone(h.id, true)}
                    disabled={busy}
                    className="tap text-xs text-mustard hover:text-mustard-soft disabled:opacity-40"
                  >
                    Sí que la va fer
                  </button>
                )}
              </span>
            </div>
            {!h.done && (
              <p className="text-ink/40 text-xs mt-0.5">
                No la va fer: es queda pendent per a la pròxima
              </p>
            )}
            {confirming === h.id && (
              <div className="flex items-center justify-end gap-3 mt-2 text-xs">
                <span className="text-ink/60">
                  {h.name} no la va portar? Li tornarà a tocar.
                </span>
                <button
                  onClick={() => setConfirming(null)}
                  className="tap text-ink/50 hover:text-ink"
                >
                  Cancel·la
                </button>
                <button
                  onClick={() => {
                    setConfirming(null);
                    onSetDone(h.id, false);
                  }}
                  disabled={busy}
                  className="tap font-semibold text-coral disabled:opacity-40"
                >
                  Sí, no la va fer
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
