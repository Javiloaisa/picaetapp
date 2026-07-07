import { useState } from "react";
import { api } from "../api";
import type { MemberStanding } from "../types";

interface Props {
  members: MemberStanding[];
  meId: string | null;
  onChanged: () => void; // recargar estado tras añadir/quitar
}

export function MembersManager({ members, meId, onChanged }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.addMember(trimmed);
      setName("");
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, memberName: string) {
    if (!confirm(`Vols llevar ${memberName} de l'equip?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeMember(id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPin(id: string, memberName: string) {
    if (
      !confirm(
        `Vols reiniciar el PIN de ${memberName}? Haurà de crear-ne un nou en entrar.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await api.resetPin(id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-2xl bg-navy-900/[0.04] px-4 py-3"
          >
            <span className="text-ink">
              {m.name}
              {m.id === meId && (
                <span className="text-mustard text-xs ml-2">(tú)</span>
              )}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => resetPin(m.id, m.name)}
                disabled={busy}
                className="tap text-ink/40 hover:text-mustard text-sm disabled:opacity-40"
              >
                reiniciar PIN
              </button>
              <button
                onClick={() => remove(m.id, m.name)}
                disabled={busy}
                className="tap text-ink/40 hover:text-coral text-sm disabled:opacity-40"
              >
                llevar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
