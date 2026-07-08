import type { Attendance, MemberStanding } from "../types";
import { formatDate } from "../lib";

interface Props {
  members: MemberStanding[];
  attendance: Attendance[];
  meId: string | null;
  friday: string;
  busy: boolean;
  onSet: (memberId: string, coming: boolean) => void;
}

export function AttendanceList({
  members,
  attendance,
  meId,
  friday,
  busy,
  onSet,
}: Props) {
  if (members.length === 0) return null;

  // member_id -> true (ve) / false (no ve) / undefined (encara no ha dit res).
  const byId = new Map<string, boolean>();
  for (const a of attendance) byId.set(a.member_id, a.coming);

  const rows = [...members].sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
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
        {pending > 0 && <> · {pending} sense dir</>}
      </p>

      <ul className="space-y-2">
        {rows.map((m) => {
          const state = byId.get(m.id); // true | false | undefined
          const mine = m.id === meId;
          return (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-2xl bg-navy-900/[0.04] px-4 py-2.5"
            >
              <span className="flex-1 min-w-0 truncate text-ink">
                {m.name}
                {mine && <span className="text-mustard text-xs ml-2">(tu)</span>}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => onSet(m.id, true)}
                  disabled={busy}
                  aria-pressed={state === true}
                  className={`tap rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-50 ${
                    state === true
                      ? "bg-mustard text-navy-900"
                      : "bg-navy-900/[0.06] text-ink/50 hover:text-ink"
                  }`}
                >
                  Vinc
                </button>
                <button
                  onClick={() => onSet(m.id, false)}
                  disabled={busy}
                  aria-pressed={state === false}
                  className={`tap rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-50 ${
                    state === false
                      ? "bg-coral text-white"
                      : "bg-navy-900/[0.06] text-ink/50 hover:text-ink"
                  }`}
                >
                  No
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
