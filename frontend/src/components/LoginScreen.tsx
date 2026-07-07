import { useEffect, useState } from "react";
import { api } from "../api";
import type { Member } from "../types";

interface Props {
  onAuthed: () => void;
}

export function LoginScreen({ onAuthed }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Member | null>(null);

  useEffect(() => {
    api
      .listMembers()
      .then(setMembers)
      .catch((e) => setError(e.message));
  }, []);

  if (picked) {
    return (
      <PinStep
        member={picked}
        onBack={() => setPicked(null)}
        onAuthed={onAuthed}
      />
    );
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 py-10 max-w-md mx-auto">
      <div className="text-5xl mb-3">🫒</div>
      <h1 className="font-display text-3xl font-bold text-ink leading-tight">
        La Picaeta del Divendres
      </h1>
      <p className="text-ink/60 mt-2 mb-8">
        Qui eres? Tria el teu nom i entra amb el teu PIN.
      </p>

      {error && (
        <p className="text-coral bg-coral/10 rounded-xl px-4 py-3 mb-4">
          {error}
        </p>
      )}

      {members === null && !error && (
        <p className="text-ink/40">Carregant la colla…</p>
      )}

      {members && members.length === 0 && (
        <p className="text-ink/60">
          Encara no hi ha ningú en l'equip. Cal sembrar la llista a la base de
          dades (mira el README). 🌱
        </p>
      )}

      <div className="grid gap-3">
        {members?.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setError(null);
              setPicked(m);
            }}
            className="tap flex items-center justify-between font-display text-lg font-semibold text-navy-900 bg-mustard hover:bg-mustard-soft rounded-2xl px-5 py-4 text-left shadow-lg shadow-black/20"
          >
            <span>{m.name}</span>
            {!m.has_pin && (
              <span className="text-xs font-body font-medium bg-navy-900/15 rounded-full px-2 py-0.5">
                nou
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function PinStep({
  member,
  onBack,
  onAuthed,
}: {
  member: Member;
  onBack: () => void;
  onAuthed: () => void;
}) {
  const isNew = !member.has_pin; // compte sense reclamar: crea PIN
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^\d{4,6}$/.test(pin)) {
      setError("El PIN ha de tindre entre 4 i 6 xifres.");
      return;
    }
    if (isNew && pin !== confirm) {
      setError("Els dos PIN no coincidixen.");
      return;
    }

    setBusy(true);
    try {
      if (isNew) await api.setPin(member.id, pin);
      else await api.login(member.id, pin);
      onAuthed();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 py-10 max-w-md mx-auto">
      <button
        onClick={onBack}
        className="tap text-ink/60 hover:text-ink text-sm mb-8 self-start"
      >
        ← No soc {member.name}
      </button>

      <h1 className="font-display text-2xl font-bold text-ink">
        Hola, {member.name} 👋
      </h1>
      <p className="text-ink/60 mt-2 mb-8">
        {isNew
          ? "És la teua primera vegada: crea un PIN de 4-6 xifres per al teu compte."
          : "Introduïx el teu PIN per a entrar."}
      </p>

      {error && (
        <p className="text-coral bg-coral/10 rounded-xl px-4 py-3 mb-4">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="grid gap-4">
        <input
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="off"
          placeholder="PIN"
          className="text-center tracking-[0.5em] font-display text-2xl rounded-2xl bg-navy-900/[0.06] px-4 py-4 text-ink placeholder:text-ink/30 placeholder:tracking-normal outline-none focus:ring-2 focus:ring-mustard/60"
        />
        {isNew && (
          <input
            value={confirm}
            onChange={(e) =>
              setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            autoComplete="off"
            placeholder="Repetix el PIN"
            className="text-center tracking-[0.5em] font-display text-2xl rounded-2xl bg-navy-900/[0.06] px-4 py-4 text-ink placeholder:text-ink/30 placeholder:tracking-normal outline-none focus:ring-2 focus:ring-mustard/60"
          />
        )}
        <button
          type="submit"
          disabled={busy}
          className="tap font-display text-lg font-bold text-navy-900 bg-mustard hover:bg-mustard-soft disabled:opacity-50 rounded-2xl px-5 py-4"
        >
          {busy ? "…" : isNew ? "Crear PIN i entrar" : "Entrar"}
        </button>
      </form>

      {!isNew && (
        <p className="text-ink/30 text-xs text-center mt-6">
          Has oblidat el PIN? Demana a qualsevol de l'equip que te'l reinicie des
          de ⚙️.
        </p>
      )}
    </div>
  );
}
