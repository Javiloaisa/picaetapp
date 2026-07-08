export interface MemberStanding {
  id: string;
  name: string;
  count: number;
  last_turn: string | null; // ISO date o null si nunca compró
  away_until: string | null; // ISO date de vuelta de vacaciones, o null
}

export interface HistoryEntry {
  id: string;
  date: string;
  member_id: string;
  name: string;
}

export interface Attendance {
  member_id: string;
  coming: boolean;
}

export interface AppState {
  assigned: MemberStanding | null;
  queue: MemberStanding[];
  members: MemberStanding[];
  declined_this_round: string[];
  friday: string; // ISO date del divendres d'esta setmana
  attendance: Attendance[]; // respostes Vinc / No vinc d'eixe divendres
  history: HistoryEntry[];
}

export interface Member {
  id: string;
  name: string;
  has_pin: boolean;
}

export interface Me {
  member: { id: string; name: string; away_until: string | null } | null;
}

export interface RemindResult {
  sent: number;
  has_subscription: boolean;
}
