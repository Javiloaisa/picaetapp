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
import { AttendanceList } from "./components/AttendanceList";
import { QueueList } from "./components/QueueList";
import { FairnessBars } from "./components/FairnessBars";
import { History } from "./components/History";
import { MembersManager } from "./components/MembersManager";
import { formatDate } from "./lib";

const POLL_MS = 6000;

type Session = { id: string; name: string; away_until: string | null } | null;
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
  const [awayDate, setAwayDate] = useState("");
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

  // Enlace desde la notificación "🏖️ De vacances": abre los ajustes.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("vacation") === "1") {
      setShowSettings(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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

  async function setAway(until: string | null) {
    await act(() => api.setAway(until));
    setMe((m) => (m ? { ...m, away_until: until } : m));
    setAwayDate("");
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
      <div className="min-h-dvh flex items-center justify-center text-ink/40">
        Carregant…
      </div>
    );
  }

  if (!me) {
    return <LoginScreen onAuthed={checkSession} />;
  }

  const meId = me.id;
  const meStanding = state?.members.find((m) => m.id === meId);
  const todayIso = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  const awayUntil = meStanding?.away_until ?? me.away_until ?? null;
  const onVacation = !!awayUntil && awayUntil >= todayIso;
  const isAssigned = !!state?.assigned && state.assigned.id === meId;

  return (
    <div className="min-h-dvh max-w-md mx-auto px-5 pt-6 pb-16">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-bold text-ink leading-none">
            Picaeta <span className="text-mustard">del Divendres</span>
          </h1>
          <p className="text-ink/50 text-sm mt-1">Vas com a {me.name}</p>
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="tap rounded-full bg-navy-900/[0.06] hover:bg-navy-900/10 w-11 h-11 flex items-center justify-center text-xl"
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
        <div className="bg-mustard/15 text-ink rounded-2xl px-4 py-3 mb-4 text-sm flex items-center justify-between gap-3">
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
          {/* Vacances: amb data de tornada, tornes sol (no cal recordar-ho). */}
          <section className="rounded-2xl bg-navy-900/[0.04] p-4">
            <p className="font-display font-semibold text-ink">Vacances</p>
            {onVacation ? (
              <>
                <p className="text-ink/50 text-sm mt-1">
                  Estàs fora fins al <b>{formatDate(awayUntil)}</b>. No t'assignaran
                  cap picaeta; tornaràs sol eixe dia.
                </p>
                <button
                  onClick={() => setAway(null)}
                  disabled={busy}
                  className="tap mt-3 font-display font-semibold rounded-2xl px-4 py-2 text-navy-900 bg-mustard hover:bg-mustard-soft disabled:opacity-50"
                >
                  Ja he tornat
                </button>
              </>
            ) : (
              <>
                <p className="text-ink/50 text-sm mt-1">
                  Te'n vas uns dies? Posa la data de tornada i no t'assignaran cap
                  picaeta. No cal recordar tornar.
                </p>
                <div className="flex gap-2 mt-3">
                  <input
                    type="date"
                    value={awayDate}
                    min={todayIso}
                    onChange={(e) => setAwayDate(e.target.value)}
                    className="flex-1 min-w-0 rounded-2xl bg-navy-900/[0.06] px-4 py-2 text-ink outline-none focus:ring-2 focus:ring-mustard/60"
                  />
                  <button
                    onClick={() => awayDate && setAway(awayDate)}
                    disabled={busy || !awayDate}
                    className="tap shrink-0 font-display font-semibold rounded-2xl px-4 py-2 text-navy-900 bg-mustard hover:bg-mustard-soft disabled:opacity-40"
                  >
                    Estic de vacances 🏖️
                  </button>
                </div>
              </>
            )}
          </section>

          {/* Notificacions */}
          <section className="rounded-2xl bg-navy-900/[0.04] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display font-semibold text-ink">
                  Notificacions
                </p>
                <p className="text-ink/50 text-sm">
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
                      ? "text-ink bg-navy-900/10 hover:bg-navy-900/15"
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
            className="tap w-full font-display font-semibold text-ink bg-navy-900/[0.06] hover:bg-navy-900/10 rounded-2xl px-5 py-3 ring-1 ring-navy-900/10"
          >
            Tancar sessió
          </button>
          <p className="text-ink/30 text-xs text-center">
            La sessió viu en una cookie d'este dispositiu. El PIN es guarda
            xifrat, mai en clar.
          </p>
        </div>
      ) : (
        <main className="space-y-8">
          {!state ? (
            <p className="text-ink/40">Carregant…</p>
          ) : (
            <>
              {onVacation && (
                <p className="text-ink/60 text-sm bg-navy-900/[0.04] rounded-2xl px-4 py-3">
                  🏖️ Estàs de vacances: no t'assignaran cap picaeta. Torna-hi des
                  de ⚙️ quan tornes.
                </p>
              )}
              <TurnCard
                assigned={state.assigned}
                isMe={isAssigned}
                busy={busy}
                reminding={reminding}
                onDecline={() => act(() => api.decline())}
                onRemind={remind}
                onGoVacation={() => setShowSettings(true)}
                onNotHere={() =>
                  state.assigned &&
                  act(() => api.decline(state.assigned!.id))
                }
              />
              <AttendanceList
                members={state.members}
                attendance={state.attendance}
                meId={meId}
                friday={state.friday}
                busy={busy}
                onSetMine={(coming) => act(() => api.setAttendance(coming))}
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

      <footer className="text-center text-ink/25 text-xs mt-12">
        Fet amb fam 🫒
      </footer>
    </div>
  );
}
