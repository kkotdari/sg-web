import { create } from "zustand";
import { api } from "../api/client";
import { versionNumber } from "../utils/appVersion";
import { parseRoute } from "../utils/route";
import type {
  Member, GameResult, NewGameResult, MemberCreatePayload, MemberStatus, MemberRole, AppVersion,
  AppVersionInfo, Challenge, ScreenKey,
} from "../types";

export interface UpdateNotice {
  prevVersion: string;
  activeVersion: string;
  notes: string;
}

const APP_VERSION_SEEN_KEY = "scr_last_seen_app_version";
export function hasNoticeContent(notes: string | undefined | null): boolean {
  return (notes ?? "").trim().length > 0;
}
function computeUpdateNotice(
  activeVersion: AppVersion,
  noticeEnabled: boolean,
  appVersions: AppVersionInfo[],
): UpdateNotice | null {
  try {
    const prev = localStorage.getItem(APP_VERSION_SEEN_KEY);
    localStorage.setItem(APP_VERSION_SEEN_KEY, activeVersion);
    if (!noticeEnabled) return null;
    if (!prev || prev === activeVersion) return null;
    const entry = appVersions.find((v) => versionNumber(v.number) === versionNumber(activeVersion));
    const notes = entry?.notes ?? "";
    if (!hasNoticeContent(notes)) return null;
    return { prevVersion: prev, activeVersion, notes };
  } catch {
  }
  return null;
}


const GUEST_KEY = "stargate_guest";

function writeGuest(on: boolean): void {
  try {
    if (on) localStorage.setItem(GUEST_KEY, "1");
    else localStorage.removeItem(GUEST_KEY);
  } catch { return; }
}

function readGuest(): boolean {
  let on = false;
  try { on = localStorage.getItem(GUEST_KEY) === "1"; } catch { return false; }
  if (!on) return false;
  const screen = parseRoute().screen;
  if (screen === "explore" || screen === "catalog") return true;
  writeGuest(false);
  return false;
}

interface AppState {
  user: Member | null;
  guest: boolean;
  enterGuest: () => void;
  exitGuest: () => void;
  members: Member[];
  earliestGameResultDate: string | null;
  appVersion: AppVersion;
  appVersions: AppVersionInfo[];
  noticeEnabled: boolean;
  booting: boolean;
  restoringSession: boolean;
  justLoggedIn: boolean;
  clearJustLoggedIn: () => void;
  viewingMemberId: string | null;
  inboxChallenges: Challenge[];
  dismissInboxChallenges: () => void;
  resultInboxChallenges: Challenge[];
  dismissResultInboxChallenges: () => void;
  updateNotice: UpdateNotice | null;
  dismissUpdateNotice: () => void;

  login: (id: string, password: string) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<void>;

  bootstrap: () => Promise<void>;

  addGameResult: (gameResult: NewGameResult) => Promise<{ game: GameResult; merged: boolean; deleted: boolean }>;
  deleteGameResult: (id: number) => Promise<void>;

  refreshAll: () => Promise<void>;

  updateProfile: (patch: Partial<Omit<Member, "roles" | "status" | "createdAt">>) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  withdraw: () => Promise<void>;

  updateMemberStatus: (id: string, status: MemberStatus) => Promise<void>;
  updateMemberRoles: (id: string, roles: MemberRole[]) => Promise<void>;
  reprocessMemberAvatar: (id: string) => Promise<void>;
  setMemberRosterImage: (id: string, image: string | null) => Promise<void>;
  replaceMemberReplayAliases: (id: string, aliases: string[]) => Promise<void>;
  addMemberReplayAlias: (id: string, alias: string) => Promise<void>;
  createMemberByAdmin: (payload: MemberCreatePayload) => Promise<void>;

  openMemberProfile: (id: string) => void;
  closeMemberProfile: () => void;

  setAppVersion: (version: AppVersion) => Promise<void>;

  addVersion: (number: AppVersion) => Promise<void>;
  deleteVersion: (number: AppVersion) => Promise<void>;
  setNoticeEnabled: (enabled: boolean) => Promise<void>;
  saveVersionNotes: (number: AppVersion, notes: string) => Promise<void>;

  screenIntent: ScreenKey | null;
  requestScreen: (screen: ScreenKey) => void;
  clearScreenIntent: () => void;
  memberOf: (id: string) => Member | undefined;
}

export const useAppStore = create<AppState>()((set, get) => ({
  user: null,
  guest: readGuest(),
  enterGuest: () => { writeGuest(true); set({ guest: true }); },
  exitGuest: () => { writeGuest(false); set({ guest: false }); },
  members: [],
  earliestGameResultDate: null,
  appVersion: "1",
  appVersions: [],
  noticeEnabled: true,
  booting: api.hasToken(),
  restoringSession: api.hasToken(),
  viewingMemberId: null,
  justLoggedIn: false,
  clearJustLoggedIn: () => set({ justLoggedIn: false }),
  inboxChallenges: [],
  dismissInboxChallenges: () => set({ inboxChallenges: [] }),
  resultInboxChallenges: [],
  dismissResultInboxChallenges: () => set({ resultInboxChallenges: [] }),
  updateNotice: null,
  dismissUpdateNotice: () => set({ updateNotice: null }),

  login: async (id, password) => {
    const { user } = await api.login(id, password);
    writeGuest(false);
    set({ user, guest: false, justLoggedIn: true, booting: true });
  },

  logout: () => {
    api.logout();
    set({ user: null, members: [] });
  },

  restoreSession: async () => {
    if (!api.hasToken()) { set({ restoringSession: false }); return; }
    try {
      const user = await api.me();
      set({ user });
    } catch {
      api.logout();
    } finally {
      set({ restoringSession: false });
    }
  },

  bootstrap: async () => {
    set({ booting: true });
    try {
      const [
        members, { activeVersion, noticeEnabled }, appVersions, earliestGameResultDate,
        { items: inboxChallenges }, { items: resultInboxChallenges },
      ] = await Promise.all([
        api.getMembers(),
        api.getAppVersion(),
        api.getAppVersions(),
        api.getEarliestGameResultDate(),
        api.getPendingChallengesForMe(),
        api.getResultPendingChallengesForMe(),
      ]);
      set({
        members, appVersion: activeVersion, appVersions, noticeEnabled, earliestGameResultDate,
        inboxChallenges, resultInboxChallenges,
        updateNotice: computeUpdateNotice(activeVersion, noticeEnabled, appVersions),
      });
    } finally {
      set({ booting: false });
    }
  },

  addGameResult: async (gameResult) => {
    return api.createGameResult(gameResult);
  },
  deleteGameResult: async (id) => {
    await api.deleteGameResult(id);
  },

  refreshAll: async () => {
    const [members, { activeVersion }] = await Promise.all([
      api.getMembers(),
      api.getAppVersion(),
    ]);
    set({ members, appVersion: activeVersion });
  },

  updateProfile: async (patch) => {
    const current = get().user;
    if (!current) return;
    const updated = await api.updateProfile(current.id, patch);
    set((s) => ({
      user: updated,
      members: s.members.map((m) => (m.id === current.id ? updated : m)),
    }));
  },

  updatePassword: async (newPassword) => {
    const current = get().user;
    if (!current) return;
    await api.updateMemberPassword(current.id, newPassword);
  },

  withdraw: async () => {
    const current = get().user;
    if (!current) return;
    await api.withdraw(current.id);
    api.logout();
    set({ user: null, members: [] });
  },

  updateMemberStatus: async (id, status) => {
    const updated = await api.updateMemberStatus(id, status);
    set((s) => ({ members: s.members.map((m) => (m.id === id ? updated : m)) }));
  },

  updateMemberRoles: async (id, roles) => {
    const updated = await api.updateMemberRoles(id, roles);
    set((s) => ({ members: s.members.map((m) => (m.id === id ? updated : m)) }));
  },

  setMemberRosterImage: async (id, image) => {
    const updated = await api.setMemberRosterImage(id, image);
    set((s) => ({
      members: s.members.map((m) => (m.id === id ? updated : m)),
      user: s.user?.id === id ? updated : s.user,
    }));
  },

  reprocessMemberAvatar: async (id) => {
    const updated = await api.reprocessMemberAvatar(id);
    set((s) => ({
      members: s.members.map((m) => (m.id === id ? updated : m)),
      user: s.user?.id === id ? updated : s.user,
    }));
  },

  replaceMemberReplayAliases: async (id, aliases) => {
    const updated = await api.replaceMemberReplayAliases(id, aliases);
    set((s) => ({
      members: s.members.map((m) => (m.id === id ? updated : m)),
      user: s.user?.id === id ? updated : s.user,
    }));
  },

  addMemberReplayAlias: async (id, alias) => {
    const updated = await api.addMemberReplayAlias(id, alias);
    set((s) => ({
      members: s.members.map((m) => (m.id === id ? updated : m)),
      user: s.user?.id === id ? updated : s.user,
    }));
  },

  createMemberByAdmin: async (payload) => {
    const created = await api.createMemberByAdmin(payload);
    set((s) => ({ members: [...s.members, created] }));
  },

  openMemberProfile: (id) => set({ viewingMemberId: id }),
  closeMemberProfile: () => set({ viewingMemberId: null }),

  setAppVersion: async (version) => {
    const { activeVersion } = await api.setAppVersion(version);
    set({ appVersion: activeVersion });
  },

  addVersion: async (number) => {
    const added = await api.addAppVersion(number);
    set({
      appVersions: [...get().appVersions, added].sort(
        (a, b) => versionNumber(a.number) - versionNumber(b.number),
      ),
    });
  },

  deleteVersion: async (number) => {
    await api.deleteAppVersion(number);
    set({
      appVersions: get().appVersions.filter(
        (v) => versionNumber(v.number) !== versionNumber(number),
      ),
    });
  },

  setNoticeEnabled: async (enabled) => {
    const res = await api.setVersionNoticeEnabled(enabled);
    set({ noticeEnabled: res.enabled });
  },

  saveVersionNotes: async (number, notes) => {
    const saved = await api.setVersionNotes(number, notes);
    set({
      appVersions: get().appVersions.map((v) =>
        versionNumber(v.number) === versionNumber(saved.number) ? { ...v, notes: saved.notes } : v,
      ),
    });
  },

  screenIntent: null,
  requestScreen: (screen) => set({ screenIntent: screen }),
  clearScreenIntent: () => set({ screenIntent: null }),

  memberOf: (id) => get().members.find((m) => m.id === id),
}));
