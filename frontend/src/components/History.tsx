import type { HistoryEntry } from "../types";
import { formatDate } from "../lib";

interface Props {
  history: HistoryEntry[];
}

export function History({ history }: Props) {
  if (history.length === 0) return null;

  return (
    <section>
      <h3 className="font-display font-semibold text-cream/80 mb-3">
        Últimas picaditas
      </h3>
      <ul className="space-y-1.5">
        {history.map((h) => (
          <li
            key={h.id}
            className="flex items-center justify-between text-sm rounded-xl px-4 py-2.5 bg-white/[0.03]"
          >
            <span className="text-cream/90">🫒 {h.name}</span>
            <span className="text-cream/40">{formatDate(h.date)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
