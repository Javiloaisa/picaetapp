import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { AppState } from "./types";
import { LoginScreen } from "./components/LoginScreen";
import { TurnCard } from "./components/TurnCard";
import { QueueList } from "./components/QueueList";
import { FairnessBars } from "./components/FairnessBars";
import { History } from "./components/History";
import { MembersManager } from "./components/MembersManager";

const POLL_MS = 6000;

type Session = { id: string; name: string } | null;

export default function App() {
  const [me, setMe] = useState<Session>(null);
  const [checking, setChecking] = useState(true);
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const timer = useRef<number | null>(null);

  // ¿Hay sesión válida? La cookie decide, no el localStorage.
  const checkSession = useCallback(async () => {
    try {
      const { member } = await api.me();
      setMe(member);
    } catch {
      setMe(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getState();
      setState(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Polling ligero mientras haya sesión, para ver el mismo estado casi en vivo.
  useEffect(() => {
    if (!me) return;
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
  }, [me, refresh]);

  async function logout() {
    await api.logout().catch(() => {});
    setMe(null);
    setState(null);
    setShowSettings(false);
  }

  async function act(fn: () => Promise<AppState>) {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        // La sesión ha caducado: de vuelta al login.
        setMe(null);
        return;
      }
      setError(err.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-cream/40">
        Cargando…
      </div>
    );
  }

  if (!me) {
    return <LoginScreen onAuthed={checkSession} />;
  }

  const meId = me.id;
  const isAssigned = !!state?.assigned && state.assigned.id === meId;

  return (
    <div className="min-h-dvh max-w-md mx-auto px-5 pt-6 pb-16">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-bold text-cream leading-none">
            Picadita <span className="text-mustard">del Viernes</span>
          </h1>
          <p className="text-cream/50 text-sm mt-1">Vas como {me.name}</p>
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
            onClick={logout}
            className="tap w-full font-display font-semibold text-cream bg-white/[0.06] hover:bg-white/10 rounded-2xl px-5 py-3 ring-1 ring-white/10"
          >
            Cerrar sesión
          </button>
          <p className="text-cream/30 text-xs text-center">
            Tu sesión vive en una cookie de este dispositivo. El PIN se guarda
            cifrado, nunca en claro.
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
                onComplete={() => act(() => api.complete())}
                onDecline={() => act(() => api.decline())}
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
