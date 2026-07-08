import type { Attendance, MemberStanding } from "../types";
import { formatDate } from "../lib";

interface Props {
  members: MemberStanding[];
  attendance: Attendance[];
  meId: string | null;
  friday: string;
  busy: boolean;
  onSetMine: (coming: boolean) => void; // cada u només respon per si mateix
}

export function AttendanceList({
  members,
  attendance,
  meId,
  friday,
  busy,
  onSetMine,
}: Props) {
  if (members.length === 0) return null;

  // member_id -> true (ve) / false (no ve) / undefined (encara no ha dit res).
  const byId = new Map<string, boolean>();
  for (const a of attendance) byId.set(a.member_id, a.coming);

  // Jo primer (per a respondre de seguida), la resta per ordre alfabètic.
  const rows = [...members].sort((a, b) => {
    if (a.id === meId) return -1;
    if (b.id === meId) return 1;
    return a.name.localeCompare(b.name, "es");
  });
  const yes = attendance.filter((a) => a.coming).length;
  const no = attendance.filter((a) => !a.coming).length;
  const pending = members.length - yes - no;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-display font-semibold text-ink/80">
          Qui ve este divendres?
        </h3>
        <span className="text-ink/40 text-xs">{formatDate(friday)}</span>
      </div>

      <p className="text-ink/50 text-sm mb-3">
        <span className="text-ink font-semibold">{yes}</span> venen ·{" "}
        <span className="text-ink font-semibold">{no}</span> no
        {pending > 0 && <> · {pending} sense contestar</>}
      </p>

      <ul className="space-y-2">
        {rows.map((m) => {
          const state = byId.get(m.id); // true | false | undefined
          const mine = m.id === meId;
          return (
            <li
              key={m.id}
              className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 ${
                mine
                  ? "bg-mustard/10 ring-1 ring-mustard/25"
                  : "bg-navy-900/[0.04]"
              }`}
            >
              <span className="flex-1 min-w-0 truncate text-ink">
                {m.name}
                {mine && <span className="text-mustard text-xs ml-2">(tu)</span>}
              </span>

              {mine ? (
                // Només tu pots canviar la teua resposta.
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onSetMine(true)}
                    disabled={busy}
                    aria-pressed={state === true}
                    className={`tap rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-50 ${
                      state === true
                        ? "bg-mustard text-navy-900"
                        : "bg-navy-900/[0.06] text-ink/50 hover:text-ink"
                    }`}
                  >
                    Vaig
                  </button>
                  <button
                    onClick={() => onSetMine(false)}
                    disabled={busy}
                    aria-pressed={state === false}
                    className={`tap rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-50 ${
                      state === false
                        ? "bg-coral text-white"
                        : "bg-navy-900/[0.06] text-ink/50 hover:text-ink"
                    }`}
                  >
                    No vaig
                  </button>
                </div>
              ) : (
                // La resta, només lectura.
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    state === true
                      ? "text-mustard"
                      : state === false
                      ? "text-coral"
                      : "text-ink/30 font-normal"
                  }`}
                >
                  {state === true ? "✓ ve" : state === false ? "no ve" : "—"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
