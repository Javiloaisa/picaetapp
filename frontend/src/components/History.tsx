import { useState } from "react";
import type { HistoryEntry } from "../types";
import { formatDate } from "../lib";

interface Props {
  history: HistoryEntry[];
  busy: boolean;
  // "No la va fer": eixe divendres no compta i queda pendent per a la pròxima.
  onNotDone: (turnId: string) => void;
}

export function History({ history, busy, onNotDone }: Props) {
  // Tocar una fila obri la confirmació (sense botons a la vista).
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
            className="text-sm rounded-xl bg-navy-900/[0.03]"
          >
            <button
              onClick={() => setConfirming(confirming === h.id ? null : h.id)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left"
            >
              <span className="text-ink/90">🫒 {h.name}</span>
              <span className="text-ink/40">{formatDate(h.date)}</span>
            </button>
            {confirming === h.id && (
              <div className="flex items-center justify-end gap-3 px-4 pb-2.5 text-xs">
                <span className="text-ink/60">
                  No la va fer? Li tornarà a tocar.
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
                    onNotDone(h.id);
                  }}
                  disabled={busy}
                  className="tap font-semibold text-coral disabled:opacity-40"
                >
                  No la va fer
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
