import type { AppState, Member } from "./types";

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
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
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getState: () => req<AppState>("/api/state"),

  listMembers: () => req<Member[]>("/api/members"),

  addMember: (name: string) =>
    req<Member>("/api/members", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  removeMember: (id: string) =>
    req<AppState>(`/api/members/${id}`, { method: "DELETE" }),

  complete: (member_id: string) =>
    req<AppState>("/api/turns/complete", {
      method: "POST",
      body: JSON.stringify({ member_id }),
    }),

  decline: (member_id: string) =>
    req<AppState>("/api/turns/decline", {
      method: "POST",
      body: JSON.stringify({ member_id }),
    }),
};
