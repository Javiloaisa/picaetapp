import { useState } from "react";
import { api } from "../api";
import type { MemberStanding } from "../types";
import { formatDate } from "../lib";

interface Props {
  members: MemberStanding[];
  meId: string | null;
  onChanged: () => void; // recargar estado tras añadir/quitar
}

export function MembersManager({ members, meId, onChanged }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Miembro cuyo editor de vacaciones está abierto, y la fecha elegida.
  const [awayFor, setAwayFor] = useState<string | null>(null);
  const [awayDate, setAwayDate] = useState("");

  const todayIso = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await run(async () => {
      await api.addMember(trimmed);
      setName("");
    });
  }

  function remove(id: string, memberName: string) {
    if (!confirm(`Vols llevar ${memberName} de l'equip?`)) return;
    run(() => api.removeMember(id));
  }

  function resetPin(id: string, memberName: string) {
    if (
      !confirm(
        `Vols reiniciar el PIN de ${memberName}? Haurà de crear-ne un nou en entrar.`
      )
    )
      return;
    run(() => api.resetPin(id));
  }

  async function setAway(id: string, until: string | null) {
    await run(() => api.setAway(until, id));
    setAwayFor(null);
    setAwayDate("");
  }

  return (
    <section>
      <h3 className="font-display font-semibold text-ink/80 mb-3">L'equip</h3>

      <form onSubmit={add} className="flex gap-2 mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Afegir algú…"
          maxLength={60}
          className="flex-1 rounded-2xl bg-navy-900/[0.06] px-4 py-3 text-ink placeholder:text-ink/30 outline-none focus:ring-2 focus:ring-mustard/60"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="tap font-display font-bold text-navy-900 bg-mustard hover:bg-mustard-soft disabled:opacity-40 rounded-2xl px-5"
        >
          +
        </button>
      </form>

      {error && <p className="text-coral text-sm mb-3">{error}</p>}

      <ul className="space-y-2">
        {members.map((m) => {
          const away = !!m.away_until && m.away_until >= todayIso;
          const editing = awayFor === m.id;
          return (
            <li
              key={m.id}
              className="rounded-2xl bg-navy-900/[0.04] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="text-ink">{m.name}</span>
                  {m.id === meId && (
                    <span className="text-mustard text-xs ml-2">(tú)</span>
                  )}
                  {away && (
                    <span className="block text-ink/40 text-xs mt-0.5">
                      🏖️ fora fins al {formatDate(m.away_until)}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3 shrink-0 text-sm">
                  {away ? (
                    <button
                      onClick={() => setAway(m.id, null)}
                      disabled={busy}
                      className="tap text-mustard hover:text-mustard-soft disabled:opacity-40"
                    >
                      ja ha tornat
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setAwayFor(editing ? null : m.id);
                        setAwayDate("");
                      }}
                      disabled={busy}
                      className="tap text-ink/40 hover:text-mustard disabled:opacity-40"
                    >
                      🏖️
                    </button>
                  )}
                  <button
                    onClick={() => resetPin(m.id, m.name)}
                    disabled={busy}
                    className="tap text-ink/40 hover:text-mustard disabled:opacity-40"
                  >
                    PIN
                  </button>
                  <button
                    onClick={() => remove(m.id, m.name)}
                    disabled={busy}
                    className="tap text-ink/40 hover:text-coral disabled:opacity-40"
                  >
                    llevar
                  </button>
                </div>
              </div>

              {editing && !away && (
                <div className="flex gap-2 mt-3">
                  <input
                    type="date"
                    value={awayDate}
                    min={todayIso}
                    onChange={(e) => setAwayDate(e.target.value)}
                    className="flex-1 min-w-0 rounded-2xl bg-navy-900/[0.06] px-4 py-2 text-ink outline-none focus:ring-2 focus:ring-mustard/60"
                  />
                  <button
                    onClick={() => awayDate && setAway(m.id, awayDate)}
                    disabled={busy || !awayDate}
                    className="tap shrink-0 font-display font-semibold rounded-2xl px-4 py-2 text-navy-900 bg-mustard hover:bg-mustard-soft disabled:opacity-40"
                  >
                    De vacances 🏖️
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
