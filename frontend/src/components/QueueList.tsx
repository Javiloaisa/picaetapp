import type { MemberStanding } from "../types";

interface Props {
  queue: MemberStanding[];
  declined: string[];
  meId: string | null;
}

export function QueueList({ queue, declined, meId }: Props) {
  // El primer és l'assignat (ja es mostra a dalt): ensenyem del 2n en avant.
  const rest = queue.slice(1);
  if (rest.length === 0) return null;

  return (
    <section>
      <h3 className="font-display font-semibold text-ink/80 mb-3">
        I després van…
      </h3>
      <ol className="space-y-2">
        {rest.map((m, i) => {
          const hasDeclined = declined.includes(m.id);
          return (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-2xl bg-navy-900/[0.04] px-4 py-3"
            >
              <span className="font-display font-bold text-ink/40 w-6 text-center">
                {i + 2}
              </span>
              <span className="flex-1 text-ink">
                {m.name}
                {m.id === meId && (
                  <span className="text-mustard text-xs ml-2">(tu)</span>
                )}
              </span>
              {hasDeclined ? (
                <span className="text-xs text-coral/80">esta setmana no</span>
              ) : (
                <span className="text-xs text-ink/40">{m.count} enguany</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
