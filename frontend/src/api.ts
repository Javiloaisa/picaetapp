import type { AppState, Me, Member, RemindResult } from "./types";

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin", // envía/recibe la cookie de sesión
    ...options,
  });
  if (!res.ok) {
    let detail = "Algo ha salido mal.";
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* respuesta sin JSON */
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const api = {
  // --- sesión ---
  me: () => req<Me>("/api/auth/me"),

  setPin: (member_id: string, pin: string) =>
    req<{ id: string }>("/api/auth/set-pin", {
      method: "POST",
      body: JSON.stringify({ member_id, pin }),
    }),

  login: (member_id: string, pin: string) =>
    req<{ id: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ member_id, pin }),
    }),

  logout: () => req<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  resetPin: (member_id: string) =>
    req<{ ok: boolean }>("/api/auth/reset-pin", {
      method: "POST",
      body: JSON.stringify({ member_id }),
    }),

  // --- estado ---
  getState: () => req<AppState>("/api/state"),

  listMembers: () => req<Member[]>("/api/members"),

  addMember: (name: string) =>
    req<{ id: string; name: string }>("/api/members", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  removeMember: (id: string) =>
    req<AppState>(`/api/members/${id}`, { method: "DELETE" }),

  setVacation: (on: boolean) =>
    req<AppState>("/api/members/vacation", {
      method: "POST",
      body: JSON.stringify({ on }),
    }),

  // --- acciones sobre el turno (el actor lo pone el servidor por la sesión) ---
  complete: () => req<AppState>("/api/turns/complete", { method: "POST" }),

  decline: () => req<AppState>("/api/turns/decline", { method: "POST" }),

  // --- notificaciones push ---
  pushPublicKey: () => req<{ key: string }>("/api/push/public-key"),

  pushSubscribe: (subscription: unknown) =>
    req<{ ok: boolean }>("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ subscription }),
    }),

  pushUnsubscribe: (endpoint: string) =>
    req<{ ok: boolean }>("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    }),

  remind: (member_id: string) =>
    req<RemindResult>("/api/push/remind", {
      method: "POST",
      body: JSON.stringify({ member_id }),
    }),
};
