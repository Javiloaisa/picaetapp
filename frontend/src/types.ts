export interface MemberStanding {
  id: string;
  name: string;
  count: number;
  last_turn: string | null; // ISO date o null si nunca compró
}

export interface HistoryEntry {
  id: string;
  date: string;
  member_id: string;
  name: string;
}

export interface AppState {
  assigned: MemberStanding | null;
  queue: MemberStanding[];
  members: MemberStanding[];
  declined_this_round: string[];
  history: HistoryEntry[];
}

export interface Member {
  id: string;
  name: string;
  has_pin: boolean;
}

export interface Me {
  member: { id: string; name: string } | null;
}
