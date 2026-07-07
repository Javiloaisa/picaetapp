import type { MemberStanding } from "../types";
import { formatDate } from "../lib";

interface Props {
  members: MemberStanding[];
  meId: string | null;
}

export function FairnessBars({ members, meId }: Props) {
  if (members.length === 0) return null;
  const max = Math.max(1, ...members.map((m) => m.count));
  const todayIso = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local

  return (
    <section>
      <h3 className="font-display font-semibold text-ink/80 mb-3">
        Repartiment de l'any
      </h3>
      <div className="space-y-3">
        {members.map((m) => {
          const pct = (m.count / max) * 100;
          const isMe = m.id === meId;
          const away = !!m.away_until && m.away_until >= todayIso;
          return (
            <div key={m.id}>
              <div className="flex justify-between text-sm mb-1">
                <span className={isMe ? "text-mustard font-semibold" : "text-ink/80"}>
                  {m.name}
                  {isMe && <span className="text-xs ml-2 opacity-70">(tu)</span>}
                  {away && (
                    <span className="text-xs ml-2 text-ink/40">
                      🏖️ fins al {formatDate(m.away_until)}
                    </span>
                  )}
                </span>
                <span className="text-ink/50 tabular-nums">{m.count}</span>
              </div>
              <div className="h-2.5 rounded-full bg-navy-900/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-mustard to-coral transition-[width] duration-500 ${
                    away ? "opacity-40" : ""
                  }`}
                  style={{ width: `${Math.max(pct, m.count > 0 ? 8 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
