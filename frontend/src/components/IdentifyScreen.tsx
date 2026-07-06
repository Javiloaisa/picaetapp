import { useEffect, useState } from "react";
import { api } from "../api";
import type { Member } from "../types";

interface Props {
  onPick: (id: string) => void;
}

export function IdentifyScreen({ onPick }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listMembers()
      .then(setMembers)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 py-10 max-w-md mx-auto">
      <div className="text-5xl mb-3">🫒</div>
      <h1 className="font-display text-3xl font-bold text-cream leading-tight">
        La Picadita del Viernes
      </h1>
      <p className="text-cream/60 mt-2 mb-8">
        ¿Quién eres? Solo es para saber quién pulsa qué. Nada de contraseñas.
      </p>

      {error && (
        <p className="text-coral bg-coral/10 rounded-xl px-4 py-3 mb-4">
          {error}
        </p>
      )}

      {members === null && !error && (
        <p className="text-cream/40">Cargando la peña…</p>
      )}

      {members && members.length === 0 && (
        <p className="text-cream/60">
          Todavía no hay nadie apuntado. Entra igual y añade al equipo desde
          ajustes. 👇
        </p>
      )}

      <div className="grid gap-3">
        {members?.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m.id)}
            className="tap font-display text-lg font-semibold text-navy-900 bg-mustard hover:bg-mustard-soft rounded-2xl px-5 py-4 text-left shadow-lg shadow-black/20"
          >
            {m.name}
          </button>
        ))}
      </div>

      {members && members.length === 0 && (
        <button
          onClick={() => onPick("")}
          className="tap mt-4 text-cream/70 underline underline-offset-4"
        >
          Entrar sin identificarme por ahora
        </button>
      )}
    </div>
  );
}
