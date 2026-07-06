import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { AppState } from "./types";
import {
  disablePush,
  enablePush,
  isPushEnabled,
  pushSupported,
} from "./push";
import { LoginScreen } from "./components/LoginScreen";
import { TurnCard } from "./components/TurnCard";
import { QueueList } from "./components/QueueList";
import { FairnessBars } from "./components/FairnessBars";
import { History } from "./components/History";
import { MembersManager } from "./components/MembersManager";

const POLL_MS = 6000;

type Session = { id: string; name: string; on_vacation: boolean } | null;
type PushState = "on" | "off" | "unsupported" | "unknown";
type Notice = { text: string; wa?: string } | null;

export default function App() {
  const [me, setMe] = useState<Session>(null);
  const [checking, setChecking] = useState(true);
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pushState, setPushState] = useState<PushState>("unknown");
  const timer = useRef<number | null>(null);

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

  useEffect(() => {
    if (!me) return;
    refresh();
    if (pushSupported()) {
      isPushEnabled().then((on) => setPushState(on ? "on" : "off"));
    } else {
      setPushState("unsupported");
    }
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

  // Aviso efímero (se borra solo a los 5s).
  function flash(n: Notice) {
    setNotice(n);
    if (n) window.setTimeout(() => setNotice(null), 6000);
  }

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
        setMe(null);
        return;
      }
      setError(err.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    if (!state?.assigned) return;
    const target = state.assigned;
    setReminding(true);
    try {
      const res = await api.remind(target.id);
      if (res.sent > 0) {
        flash({ text: `Avisat! A ${target.name} li ha saltat la notificació. 📳` });
      } else {
        flash({
          text: `${target.name} encara no té les notificacions activades.`,
          wa: `https://wa.me/?text=${encodeURIComponent(
            `Ei ${target.name}! Que este divendres portes tu la picaeta 🫒`
          )}`,
        });
      }
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) setMe(null);
      else setError(err.message);
    } finally {
      setReminding(false);
    }
  }

  async function toggleVacation(on: boolean) {
    await act(() => api.setVacation(on));
    setMe((m) => (m ? { ...m, on_vacation: on } : m));
  }

  async function toggleNotifications() {
    if (pushState === "on") {
      await disablePush();
      setPushState("off");
      flash({ text: "Notificacions desactivades." });
      return;
    }
    const res = await enablePush();
    if (res === "ok") {
      setPushState("on");
      flash({ text: "Notificacions activades! 🔔" });
    } else if (res === "denied") {
      flash({
        text: "Has bloquejat les notificacions al navegador. Actíva-les des dels ajustos del mòbil.",
      });
    } else {
      flash({
        text: "Este navegador no admet notificacions. Al iPhone, primer afig l'app a la pantalla d'inici.",
      });
    }
  }

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-cream/40">
        Carregant…
      </div>
    );
  }

  if (!me) {
    return <LoginScreen onAuthed={checkSession} />;
  }

  const meId = me.id;
  const meStanding = state?.members.find((m) => m.id === meId);
  const onVacation = meStanding?.on_vacation ?? me.on_vacation;
  const isAssigned = !!state?.assigned && state.assigned.id === meId;

  return (
    <div className="min-h-dvh max-w-md mx-auto px-5 pt-6 pb-16">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-bold text-cream leading-none">
            Picaeta <span className="text-mustard">del Divendres</span>
          </h1>
          <p className="text-cream/50 text-sm mt-1">Vas com a {me.name}</p>
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="tap rounded-full bg-white/[0.06] hover:bg-white/10 w-11 h-11 flex items-center justify-center text-xl"
          aria-label="Ajustos"
        >
          {showSettings ? "✕" : "⚙️"}
        </button>
      </header>

      {error && (
        <p className="text-coral bg-coral/10 rounded-2xl px-4 py-3 mb-4 text-sm">
          {error}
        </p>
      )}
      {notice && (
        <div className="bg-mustard/15 text-cream rounded-2xl px-4 py-3 mb-4 text-sm flex items-center justify-between gap-3">
          <span>{notice.text}</span>
          {notice.wa && (
            <a
              href={notice.wa}
              target="_blank"
              rel="noreferrer"
              className="tap shrink-0 font-semibold text-navy-900 bg-mustard rounded-full px-3 py-1"
            >
              WhatsApp
            </a>
          )}
        </div>
      )}

      {showSettings ? (
        <div className="space-y-6">
          {/* Vacances */}
          <section className="rounded-2xl bg-white/[0.04] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display font-semibold text-cream">Vacances</p>
                <p className="text-cream/50 text-sm">
                  {onVacation
                    ? "No et toca cap picaeta fins que tornes."
                    : "Actíva-ho i no t'assignaran cap picaeta."}
                </p>
              </div>
              <button
                onClick={() => toggleVacation(!onVacation)}
                disabled={busy}
                className={`tap shrink-0 font-display font-semibold rounded-2xl px-4 py-2 disabled:opacity-50 ${
                  onVacation
                    ? "text-navy-900 bg-mustard hover:bg-mustard-soft"
                    : "text-cream bg-white/10 hover:bg-white/15"
                }`}
              >
                {onVacation ? "He tornat" : "Estic de vacances 🏖️"}
              </button>
            </div>
          </section>

          {/* Notificacions */}
          <section className="rounded-2xl bg-white/[0.04] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display font-semibold text-cream">
                  Notificacions
                </p>
                <p className="text-cream/50 text-sm">
                  {pushState === "on"
                    ? "Rebràs un avís al mòbil quan et recorden que et toca."
                    : pushState === "unsupported"
                    ? "Al iPhone: afig l'app a la pantalla d'inici primer."
                    : "Activa-les per a que t'avisen quan et toque."}
                </p>
              </div>
              {pushState !== "unsupported" && (
                <button
                  onClick={toggleNotifications}
                  className={`tap shrink-0 font-display font-semibold rounded-2xl px-4 py-2 ${
                    pushState === "on"
                      ? "text-cream bg-white/10 hover:bg-white/15"
                      : "text-navy-900 bg-mustard hover:bg-mustard-soft"
                  }`}
                >
                  {pushState === "on" ? "Desactivar" : "Activar 🔔"}
                </button>
              )}
            </div>
          </section>

          <MembersManager
            members={state?.members ?? []}
            meId={meId}
            onChanged={refresh}
          />
          <button
            onClick={logout}
            className="tap w-full font-display font-semibold text-cream bg-white/[0.06] hover:bg-white/10 rounded-2xl px-5 py-3 ring-1 ring-white/10"
          >
            Tancar sessió
          </button>
          <p className="text-cream/30 text-xs text-center">
            La sessió viu en una cookie d'este dispositiu. El PIN es guarda
            xifrat, mai en clar.
          </p>
        </div>
      ) : (
        <main className="space-y-8">
          {!state ? (
            <p className="text-cream/40">Carregant…</p>
          ) : (
            <>
              {onVacation && (
                <p className="text-cream/60 text-sm bg-white/[0.04] rounded-2xl px-4 py-3">
                  🏖️ Estàs de vacances: no t'assignaran cap picaeta. Torna-hi des
                  de ⚙️ quan tornes.
                </p>
              )}
              <TurnCard
                assigned={state.assigned}
                isMe={isAssigned}
                busy={busy}
                reminding={reminding}
                onComplete={() => act(() => api.complete())}
                onDecline={() => act(() => api.decline())}
                onRemind={remind}
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
        Fet amb fam · Comboi Labs
      </footer>
    </div>
  );
}
