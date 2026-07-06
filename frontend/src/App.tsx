import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { AppState } from "./types";
import {
  clearStoredMemberId,
  getStoredMemberId,
  setStoredMemberId,
} from "./lib";
import { IdentifyScreen } from "./components/IdentifyScreen";
import { TurnCard } from "./components/TurnCard";
import { QueueList } from "./components/QueueList";
import { FairnessBars } from "./components/FairnessBars";
import { History } from "./components/History";
import { MembersManager } from "./components/MembersManager";

const POLL_MS = 6000;

export default function App() {
  const [meId, setMeId] = useState<string | null>(getStoredMemberId());
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getState();
      setState(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Polling ligero para que todos vean el mismo estado casi en tiempo real.
  useEffect(() => {
    refresh();
    function tick() {
      timer.current = window.setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();
        tick();
      }, POLL_MS);
    }
    tick();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  function pickIdentity(id: string) {
    if (id) setStoredMemberId(id);
    setMeId(id || "anon");
    refresh();
  }

  function changeUser() {
    clearStoredMemberId();
    setMeId(null);
    setShowSettings(false);
  }

  async function act(fn: () => Promise<AppState>) {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
    } catch (e) {
      setError((e as Error).message);
      await refresh(); // resincroniza si el turno cambió bajo nuestros pies
    } finally {
      setBusy(false);
    }
  }

  if (!meId) {
    return <IdentifyScreen onPick={pickIdentity} />;
  }

  const me = state?.members.find((m) => m.id === meId) ?? null;
  const isAssigned = !!state?.assigned && state.assigned.id === meId;

  return (
    <div className="min-h-dvh max-w-md mx-auto px-5 pt-6 pb-16">
      {/* Cabecera */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-bold text-cream leading-none">
            Picadita <span className="text-mustard">del Viernes</span>
          </h1>
          <p className="text-cream/50 text-sm mt-1">
            {me ? `Vas como ${me.name}` : "No identificado"}
          </p>
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="tap rounded-full bg-white/[0.06] hover:bg-white/10 w-11 h-11 flex items-center justify-center text-xl"
          aria-label="Ajustes"
        >
          {showSettings ? "✕" : "⚙️"}
        </button>
      </header>

      {error && (
        <p className="text-coral bg-coral/10 rounded-2xl px-4 py-3 mb-4 text-sm">
          {error}
        </p>
      )}

      {showSettings ? (
        <div className="space-y-6">
          <MembersManager
            members={state?.members ?? []}
            meId={meId}
            onChanged={refresh}
          />
          <button
            onClick={changeUser}
            className="tap w-full font-display font-semibold text-cream bg-white/[0.06] hover:bg-white/10 rounded-2xl px-5 py-3 ring-1 ring-white/10"
          >
            Cambiar de usuario
          </button>
          <p className="text-cream/30 text-xs text-center">
            La identidad se guarda solo en este dispositivo. Sin contraseñas.
          </p>
        </div>
      ) : (
        <main className="space-y-8">
          {!state ? (
            <p className="text-cream/40">Cargando…</p>
          ) : (
            <>
              <TurnCard
                assigned={state.assigned}
                isMe={isAssigned}
                busy={busy}
                onComplete={() => act(() => api.complete(meId))}
                onDecline={() => act(() => api.decline(meId))}
              />
              <QueueList
                queue={state.queue}
                declined={state.declined_this_round}
                meId={meId}
              />
              <FairnessBars members={state.members} meId={meId} />
              <History history={state.history} />
            </>
          )}
        </main>
      )}

      <footer className="text-center text-cream/20 text-xs mt-12">
        Hecho con hambre · Comboi Labs
      </footer>
    </div>
  );
}
