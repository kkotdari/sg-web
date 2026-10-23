import type { GameCurve,
  Member, GameResult, ActivityComment, ActivityTargetType, RankingShift, ActivityNotice, ActivityFeedItem, ActivityFeedPage, NewGameResult, SignupPayload, MemberCreatePayload, MemberStatus, MemberRole,
  ScreenKey, AppVersion, AppVersionStatus, AppVersionInfo,
  MapCanon, MapCatalog,
  GameResultSlot, GameResultPage, GameResultStatsResponse, GameOutcome, GameType, Race, TeamRankingResponse,
  RatingHistoryResponse, RivalryPair,
  ReplayNameClassificationEntry, ReplayNameKind, ReplayNameMappingEntry, ReplayNameMappingKind,
  League, LeagueListItem, LeagueCreatePayload, LeagueUpdatePayload,
  LeagueMatchSide, LeagueMatchSet, PlacementRound, PlacementRoundBrief, LeaguePoolKind, LeagueTeamCompositionEntry,
  Schedule, ScheduleWrite,
  ExtShareList, ExtShareAddResult,
  DeletedGameResult,
  GameUnhideRequest,
} from "../types";
import type { ReplayMapGrid } from "../utils/replayParser";
import type { GameIndexRow9 } from "scplay";

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "" || value === "all") return;
    usp.set(key, String(value));
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

type WireSlot = Omit<GameResultSlot, "rawName"> & { playerName?: string | null };
type WireGameResult = Omit<GameResult, "team1" | "team2"> & { team1: WireSlot[]; team2: WireSlot[] };
type WireDeletedGameResult = Omit<DeletedGameResult, "team1" | "team2"> & { team1: WireSlot[]; team2: WireSlot[] };
type WireActivityFeedPage = Omit<ActivityFeedPage, "items"> & {
  items: (Omit<ActivityFeedItem, "gameResults"> & { gameResults: WireGameResult[] })[];
};

function slotToWire(slot: GameResultSlot): WireSlot {
  const { rawName, ...rest } = slot;
  return { ...rest, playerName: rawName ?? null };
}
function gameResultToWire(gameResult: NewGameResult): Omit<NewGameResult, "team1" | "team2"> & { team1: WireSlot[]; team2: WireSlot[] } {
  return { ...gameResult, team1: gameResult.team1.map(slotToWire), team2: gameResult.team2.map(slotToWire) };
}
function slotFromWire(slot: WireSlot): GameResultSlot {
  const { playerName, ...rest } = slot;
  return { ...rest, rawName: playerName || null };
}
function gameResultFromWire(gameResult: WireGameResult): GameResult {
  return {
    ...gameResult,
    team1: (gameResult.team1 ?? []).map(slotFromWire),
    team2: (gameResult.team2 ?? []).map(slotFromWire),
  };
}

export interface GameResultListParams {
  cursor?: string;
  limit?: number;
  sort?: "latest" | "oldest";
  dateFrom?: string;
  dateTo?: string;
  matchType?: GameType | "all";
  userQuery?: string;
  matchAllUsers?: boolean;
  q?: string;
  any?: string;
  linked?: string;
  hasPlaceholder?: boolean;
  membersOnly?: boolean;
  pubOnly?: boolean;
  leagueOnly?: boolean;
  noLeague?: boolean;
  fameOnly?: boolean;
  teamMemberIds?: string[];
  /** 마감 보존한 판(결과만 남음)도 — 래더 상세 이력만 켠다. */
  withArchived?: boolean;
}

export interface GameResultStatsParams {
  memberIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  matchType?: GameType | "all";
  race?: Race | "all" | "main";
  ratingScope?: "total" | "period";
  /** 팀 규모 — 두 편 다 그 머릿수인 판만(통계 화면 탭 4:4 · 3:3 · 2:2 · 1:1 · 2026-10-20). */
  teamSize?: number;
  /** 맵 무리 — 그 대표맵(빨무 · 헌터 · 투혼)에 묶인 맵의 판만 · 2026-10-20. 없으면 모든 맵. */
  mapGroup?: "fastest" | "hunter" | "spirit";
}

export interface TeamRankingParams {
  dateFrom?: string;
  dateTo?: string;
}

export interface MainRaceParams {
  memberId: string;
  dateFrom?: string;
  dateTo?: string;
  matchType?: GameType | "all";
}

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

const CLIENT_ENV = import.meta.env.PROD ? "production" : "development";

interface AuthResponse {
  user: Member;
}

interface RawAuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  user: Member;
}

const TOKEN_KEY = "stargate_token";
const REFRESH_KEY = "stargate_refresh_token";
let accessToken: string | null = localStorage.getItem(TOKEN_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);

function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

let refreshingPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  if (!refreshingPromise) {
    refreshingPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          clearTokens();
          return false;
        }
        const body = (await res.json()) as RawAuthResponse;
        setTokens(body.accessToken, body.refreshToken);
        return true;
      } catch {
        clearTokens();
        return false;
      } finally {
        refreshingPromise = null;
      }
    })();
  }
  return refreshingPromise;
}

const NO_REFRESH_RETRY_PATHS = ["/api/auth/login", "/api/auth/signup", "/api/auth/refresh"];

async function request<T>(path: string, options: RequestInit = {}, retryOn401 = true): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Client-Env", CLIENT_ENV);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && retryOn401 && !NO_REFRESH_RETRY_PATHS.includes(path)) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, false);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    const message = typeof detail === "string"
      ? detail
      : Array.isArray(detail) && detail.length > 0 && typeof detail[0]?.msg === "string"
        ? detail[0].msg
        : "요청 처리 중 오류가 발생했어요.";
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

let extShareCtx: { listId: number; pass: string } | null = null;

export function setExtShareContext(ctx: { listId: number; pass: string } | null): void {
  extShareCtx = ctx;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
export const apiStatusOf = (e: unknown): number | undefined => (e instanceof ApiError ? e.status : undefined);

export const api = {
  async login(id: string, password: string): Promise<AuthResponse> {
    const res = await request<RawAuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ id, password }),
    });
    setTokens(res.accessToken, res.refreshToken);
    return { user: res.user };
  },

  async signup(payload: SignupPayload): Promise<AuthResponse> {
    const res = await request<RawAuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setTokens(res.accessToken, res.refreshToken);
    return { user: res.user };
  },

  async createMemberByAdmin(payload: MemberCreatePayload): Promise<Member> {
    return request<Member>("/api/members", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  hasToken(): boolean {
    return !!refreshToken;
  },

  async logout(): Promise<void> {
    const tokenToRevoke = refreshToken;
    clearTokens();
    if (!tokenToRevoke) return;
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: tokenToRevoke }),
      });
    } catch {
    }
  },

  async me(): Promise<Member> {
    return request<Member>("/api/auth/me");
  },

  async getMembers(): Promise<Member[]> {
    return request<Member[]>("/api/members");
  },

  async getGameResultsPage(params: GameResultListParams = {}): Promise<GameResultPage> {
    const qs = buildQuery({
      cursor: params.cursor,
      limit: params.limit,
      sort: params.sort,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      matchType: params.matchType,
      userQuery: params.userQuery,
      hasPlaceholder: params.hasPlaceholder,
      membersOnly: params.membersOnly,
      pubOnly: params.pubOnly,
      leagueOnly: params.leagueOnly,
      noLeague: params.noLeague,
      fameOnly: params.fameOnly,
      matchAllUsers: params.matchAllUsers,
      q: params.q,
      any: params.any,
      linked: params.linked,
      teamMemberIds: params.teamMemberIds?.length ? params.teamMemberIds.join(",") : undefined,
      withArchived: params.withArchived,
    });
    const page = await request<Omit<GameResultPage, "items"> & { items: WireGameResult[] }>(`/api/game-results${qs}`);
    return { ...page, items: page.items.map(gameResultFromWire) };
  },

  async countGameResults(params: GameResultListParams = {}): Promise<number> {
    const page = await this.getGameResultsPage({ ...params, cursor: undefined, limit: 1 });
    return page.total ?? page.items.length;
  },

  async setGameOutcome(id: number, result: GameOutcome, winnerPlayerName?: string): Promise<GameResult> {
    return gameResultFromWire(await request<WireGameResult>(`/api/game-results/${id}/result`, {
      method: "PUT", body: JSON.stringify({ result, winnerPlayerName }),
    }));
  },

  async markGameViewed(id: number): Promise<void> {
    await request<void>(`/api/game-results/${id}/view`, { method: "POST" });
  },

  async getGameResult(id: number): Promise<GameResult> {
    return gameResultFromWire(await request<WireGameResult>(`/api/game-results/${id}`));
  },

  /** 게임 그래프 — 참가자마다 분당 일꾼 수 · 인구 · 자원 · 건물 생애 · 개인색(서버 통계용 참값 표 · 2026-10-21). */
  async getGameCurves(id: number): Promise<GameCurve[]> {
    /* 손님 모드(외부 공개 목록)는 목록 비밀번호로 그 목록에 든 판만(2026-10-21). */
    return (extShareCtx
      ? await request<{ players: GameCurve[] }>(
        `/api/restricted/share/lists/${extShareCtx.listId}/games/${id}/curves`,
        { headers: { "X-Ext-Pass": extShareCtx.pass } },
      )
      : await request<{ players: GameCurve[] }>(`/api/game-results/${id}/curves`)).players;
  },

  /** 자취 + 경기 채팅 — 채팅은 재생기 중계 자막의 gg 선언·노엘 외침 재료(2026-10-10 · 말한 사람을 아는 줄만 · 프레임 → 초는 fastest 42ms). */
  async getGameUnitTracks(id: number): Promise<{ motion: string | null; chats?: { sec: number; name: string; text: string }[] }> {
    type Res = { motion?: string | null; chats?: { frame: number; text: string; name?: string | null }[] };
    const res = extShareCtx
      ? await request<Res>(
        `/api/restricted/share/lists/${extShareCtx.listId}/games/${id}/unit-tracks`,
        { headers: { "X-Ext-Pass": extShareCtx.pass } },
      )
      : await request<Res>(`/api/game-results/${id}/unit-tracks`);
    const chats = (res.chats ?? []).flatMap((c) => (c.name ? [{ sec: (c.frame * 42) / 1000, name: c.name, text: c.text }] : []));
    return { motion: res.motion ?? null, ...(chats.length > 0 ? { chats } : {}) };
  },

  async getGameResultStats(params: GameResultStatsParams = {}): Promise<GameResultStatsResponse> {
    const qs = buildQuery({
      memberIds: params.memberIds?.length ? params.memberIds.join(",") : undefined,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      matchType: params.matchType,
      race: params.race,
      ratingScope: params.ratingScope,
      teamSize: params.teamSize,
      mapGroup: params.mapGroup,
    });
    return request<GameResultStatsResponse>(`/api/game-results/stats${qs}`);
  },

  async getRivalries(params: { dateFrom?: string; dateTo?: string; mode?: "solo" | "team" } = {}): Promise<{ pairs: RivalryPair[] }> {
    const qs = buildQuery({ dateFrom: params.dateFrom, dateTo: params.dateTo, mode: params.mode });
    return request<{ pairs: RivalryPair[] }>(`/api/game-results/stats/rivalries${qs}`);
  },

  async getRanking(params: GameResultStatsParams = {}): Promise<GameResultStatsResponse> {
    const qs = buildQuery({
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      matchType: params.matchType,
      race: params.race,
    });
    return request<GameResultStatsResponse>(`/api/game-results/ranking${qs}`);
  },

  async getRatingHistory(
    memberId: string, matchType?: string, dateFrom?: string, dateTo?: string, race?: string,
  ): Promise<RatingHistoryResponse> {
    const qs = buildQuery({ memberId, matchType, dateFrom, dateTo, race });
    return request<RatingHistoryResponse>(`/api/game-results/rating-history${qs}`);
  },

  async getTeamRanking(params: TeamRankingParams = {}): Promise<TeamRankingResponse> {
    const qs = buildQuery({ dateFrom: params.dateFrom, dateTo: params.dateTo });
    return request<TeamRankingResponse>(`/api/game-results/team-ranking${qs}`);
  },

  async getMemberMainRace(params: MainRaceParams): Promise<Race | null> {
    const qs = buildQuery({
      memberId: params.memberId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      matchType: params.matchType,
    });
    const res = await request<{ race: Race | null }>(`/api/game-results/main-race${qs}`);
    return res.race;
  },

  async getEarliestGameResultDate(): Promise<string | null> {
    const res = await request<{ date: string | null }>("/api/game-results/earliest-date");
    return res.date;
  },

  async mergeReplay(payload: {
    gameStartedAt: string;
    result: "team1" | "team2" | "draw" | null;
    mapName: string | null;
    durationSeconds: number | null;
    mapData: ReplayMapGrid | null;
    chats?: { frame: number; text: string; name?: string }[];
    players: {
      playerName: string;
      race: string | null;
      apm: number | null;
      eapm: number | null;
      cmdCount: number | null;
      effectiveCmdCount: number | null;
      buildCount: number | null;
    }[];
  }): Promise<{ merged: boolean; matchNo: string | null }> {
    return request<{ merged: boolean; matchNo: string | null }>("/api/game-results/merge-replay", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async lookupReplayNameClassifications(rawNames: string[]): Promise<ReplayNameClassificationEntry[]> {
    if (rawNames.length === 0) return [];
    const res = await request<{ classifications: ReplayNameClassificationEntry[] }>(
      "/api/game-results/replay-name-classifications/lookup",
      { method: "POST", body: JSON.stringify({ rawNames }) },
    );
    return res.classifications;
  },

  async setReplayNameClassification(rawName: string, kind: ReplayNameKind): Promise<ReplayNameClassificationEntry> {
    return request<ReplayNameClassificationEntry>("/api/game-results/replay-name-classifications", {
      method: "POST",
      body: JSON.stringify({ rawName, kind }),
    });
  },

  async listReplayNameMappings(): Promise<ReplayNameMappingEntry[]> {
    const res = await request<{ entries: ReplayNameMappingEntry[] }>("/api/game-results/replay-name-mappings");
    return res.entries;
  },

  async setReplayNameMapping(
    rawName: string, kind: ReplayNameMappingKind, memberId?: string,
  ): Promise<ReplayNameMappingEntry> {
    return request<ReplayNameMappingEntry>("/api/game-results/replay-name-mappings", {
      method: "POST",
      body: JSON.stringify({ rawName, kind, memberId }),
    });
  },

  async deleteReplayNameMapping(rawName: string): Promise<void> {
    await request<void>(`/api/game-results/replay-name-mappings/${encodeURIComponent(rawName)}`, { method: "DELETE" });
  },

  async getReplayMaps(hashes: string[]): Promise<ReplayMapGrid[]> {
    if (hashes.length === 0) return [];
    const qs = hashes.map((h) => `hash=${encodeURIComponent(h)}`).join("&");
    const res = extShareCtx
      ? await request<{ maps: ReplayMapGrid[] }>(
        `/api/restricted/share/lists/${extShareCtx.listId}/maps?${qs}`,
        { headers: { "X-Ext-Pass": extShareCtx.pass } },
      )
      : await request<{ maps: ReplayMapGrid[] }>(`/api/game-results/replay-maps?${qs}`);
    return res.maps;
  },

  async getMapCatalog(): Promise<MapCatalog> {
    return request<MapCatalog>("/api/game-results/replay-maps/catalog");
  },

  async createMapCanon(
    body: { name: string; hashes?: string[] },
  ): Promise<MapCanon> {
    return request<MapCanon>("/api/game-results/replay-maps/canons", {
      method: "POST", body: JSON.stringify(body),
    });
  },

  async updateMapCanon(
    id: number,
    body: { name: string; hashes?: string[] },
  ): Promise<MapCanon> {
    return request<MapCanon>(`/api/game-results/replay-maps/canons/${id}`, {
      method: "PUT", body: JSON.stringify(body),
    });
  },

  async deleteOrphanMaps(): Promise<{ deleted: number }> {
    return request<{ deleted: number }>("/api/game-results/replay-maps/orphans", {
      method: "DELETE",
    });
  },

  async deleteMapCanon(id: number): Promise<void> {
    await request<void>(`/api/game-results/replay-maps/canons/${id}`, { method: "DELETE" });
  },

  async assignMapCanon(canonId: number | null, hashes: string[]): Promise<number> {
    const res = await request<{ changed: number }>("/api/game-results/replay-maps/assign", {
      method: "POST", body: JSON.stringify({ canonId, hashes }),
    });
    return res.changed;
  },

  /** 게임결과 수기 입력(리플레이 없이 · 2026-10-23) — 리플레이 등록과 같은 길(POST /api/game-results). */
  async createManualGameResult(body: {
    date: string; matchType: GameType; result: "team1" | "team2" | "draw"; mapName?: string;
    team1: { memberId: string; race: Race; playerName: string }[];
    team2: { memberId: string; race: Race; playerName: string }[];
    /** 리플레이의 게임 종류 값 — 10 이면 유즈맵(기록만). */
    gameType?: number;
  }): Promise<GameResult> {
    return gameResultFromWire(await request<WireGameResult>("/api/game-results", { method: "POST", body: JSON.stringify(body) }));
  },

  async createGameResult(
    gameResult: NewGameResult,
  ): Promise<{ game: GameResult; merged: boolean; deleted: boolean }> {
    const res = await request<WireGameResult & { merged?: boolean; deleted?: boolean }>("/api/game-results", {
      method: "POST",
      body: JSON.stringify(gameResultToWire(gameResult)),
    });
    return { game: gameResultFromWire(res), merged: res.merged === true, deleted: res.deleted === true };
  },


  async deleteGameResult(id: number): Promise<void> {
    await request<void>(`/api/game-results/${id}`, { method: "DELETE" });
  },

  async hideGameResult(id: number): Promise<GameResult> {
    return gameResultFromWire(await request<WireGameResult>(`/api/game-results/${id}/hide`, { method: "POST" }));
  },

  /** 게임 일괄 명령(삭제·숨김) — all 이면 그 목록 조건에 드는 판 전부(exclude 는 뺀다) · 아니면 ids. 못 한 판은 서버가 건너뛰고 센다. */
  async bulkGames(body: {
    action: "delete" | "hide";
    ids?: number[];
    all?: Omit<GameResultListParams, "cursor" | "limit" | "sort" | "teamMemberIds">;
    exclude?: number[];
  }): Promise<{ done: number; failed: number }> {
    return request<{ done: number; failed: number }>("/api/game-results/bulk", { method: "POST", body: JSON.stringify(body) });
  },

  /** 숨긴 경기 해제 요청 — 숨김은 누구도 못 되돌리니 운영자에게 청한다(두 번 눌러도 하나 · 2026-10-19). */
  async requestUnhideGameResult(id: number): Promise<GameUnhideRequest> {
    return request<GameUnhideRequest>(`/api/game-results/${id}/unhide-request`, { method: "POST" });
  },
  async listUnhideRequests(): Promise<GameUnhideRequest[]> {
    return (await request<{ items: GameUnhideRequest[] }>("/api/game-results/unhide-requests")).items;
  },
  async resolveUnhideRequest(rid: number, approve: boolean): Promise<GameUnhideRequest> {
    return request<GameUnhideRequest>(`/api/game-results/unhide-requests/${rid}/${approve ? "approve" : "reject"}`, { method: "POST" });
  },

  async listDeletedGameResults(): Promise<DeletedGameResult[]> {
    const res = await request<{ items: WireDeletedGameResult[] }>("/api/game-results/deleted");
    return res.items.map((g) => ({ ...gameResultFromWire(g), deletedAt: g.deletedAt, deletedBy: g.deletedBy }));
  },
  async restoreGameResult(id: number): Promise<GameResult> {
    return gameResultFromWire(await request<WireGameResult>(`/api/game-results/${id}/restore`, { method: "POST" }));
  },
  async purgeGameResult(id: number): Promise<void> {
    await request<void>(`/api/game-results/${id}/permanent`, { method: "DELETE" });
  },

  /** 제어판 데이터 관리 — 고른 판들의 참값만 지운다(리그·외부 공개 판은 서버가 남긴다 · 2026-10-20). */
  async purgeTruthOf(ids: number[]): Promise<{ deleted: number }> {
    return request<{ deleted: number }>("/api/game-results/admin/purge-truth", { method: "POST", body: JSON.stringify({ ids }) });
  },
  /** 게임 추천 켜기·거두기(2026-10-22) — 한 사람이 한 판에 하나. */
  async recommendGame(id: number, on: boolean): Promise<{ recommendCount: number; recommended: boolean }> {
    return request<{ recommendCount: number; recommended: boolean }>(`/api/game-results/${id}/recommend`, { method: on ? "POST" : "DELETE" });
  },
  /** 그 판을 추천한 사람(추천한 차례대로). */
  async listGameRecommends(id: number): Promise<{ memberId: string; nickname: string; createdAt: string }[]> {
    return (await request<{ items: { memberId: string; nickname: string; createdAt: string }[] }>(`/api/game-results/${id}/recommends`)).items;
  },
  /** 게임 자료 마감 상태 — 마감한 마지막 날("YYYY-MM-DD" · 없으면 null). */
  /** 마감 상태 — 마감한 마지막 날 · 보존 대기 판(pending) · 그중 리플레이 붙은 판(replays) · 보존 때 판째 지울 공방 · 지운 판(dropPending). */
  async getGamesClose(): Promise<{ closedUntil: string | null; pending: number; dropPending: number; replays: number }> {
    return request<{ closedUntil: string | null; pending: number; dropPending: number; replays: number }>("/api/game-results/admin/close");
  },
  /** 보존 대기 판의 리플레이 압축(경기일 폴더 YYYYMMDD) — 받은 뒤에 archiveClosed. */
  async downloadCloseArchive(): Promise<Blob> {
    const headers = new Headers();
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    const res = await fetch(`${API_BASE}/api/game-results/admin/close/archive.zip`, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { detail?: string } | null;
      throw new Error(body?.detail ?? "압축 파일을 받지 못했어요.");
    }
    return res.blob();
  },
  /** 보존 처리 — 마감한 달까지의 공방 · 지운 판은 리플레이째 지우고 나머지는 래더 · 통계용 결과만 남긴다(되돌릴 수 없다). */
  async archiveClosed(): Promise<{ archived: number; dropped: number }> {
    return request<{ archived: number; dropped: number }>("/api/game-results/admin/close/archive", { method: "POST" });
  },
  /** 그 달("YYYY-MM")까지 마감 — 그날까지의 게임은 등록·삭제가 막히고 참값을 지운다(되돌릴 수 없다). */
  async closeGames(month: string): Promise<{ closedUntil: string; purged: number; famed: number }> {
    return request<{ closedUntil: string; purged: number; famed: number }>("/api/game-results/admin/close", { method: "POST", body: JSON.stringify({ month }) });
  },
  /** 제어판 데이터 관리 — 고른 판들을 리플레이째 지운다(되돌릴 수 없다 · 리그 판은 서버가 남긴다). */
  async deleteGamesOf(ids: number[]): Promise<{ deleted: number }> {
    return request<{ deleted: number }>("/api/game-results/admin/delete", { method: "POST", body: JSON.stringify({ ids }) });
  },

  async recomputeRankingShifts(): Promise<{ changed: boolean }> {
    return request<{ changed: boolean }>("/api/activities/ranking-shifts/recompute", { method: "POST" });
  },

  async reseedRankingShifts(): Promise<Record<string, number>> {
    return request<Record<string, number>>("/api/activities/ranking-shifts/seed", { method: "POST" });
  },

  async listRankingShifts(): Promise<RankingShift[]> {
    return request<RankingShift[]>("/api/activities/ranking-shifts");
  },

  async getActivityNotice(id: number): Promise<ActivityNotice> {
    return request<ActivityNotice>(`/api/activities/notices/${id}`);
  },

  async listActivityFeed(params: { cursor?: string; limit?: number } = {}): Promise<ActivityFeedPage> {
    const q = new URLSearchParams();
    if (params.cursor) q.set("cursor", params.cursor);
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    const page = await request<WireActivityFeedPage>(`/api/activities${qs ? `?${qs}` : ""}`);
    return {
      ...page,
      items: page.items.map((it) => ({
        ...it,
        gameResults: (it.gameResults ?? []).map(gameResultFromWire),
      })),
    };
  },

  async getActivityItem(kind: string, id: number): Promise<ActivityFeedItem> {
    const it = await request<WireActivityFeedPage["items"][number]>(
      `/api/activities/item?kind=${encodeURIComponent(kind)}&id=${id}`,
    );
    return { ...it, gameResults: (it.gameResults ?? []).map(gameResultFromWire) };
  },

  async listSchedules(): Promise<Schedule[]> {
    const res = await request<{ items: Schedule[] }>("/api/schedules");
    return res.items;
  },
  async getSchedule(id: number): Promise<Schedule> {
    return request<Schedule>(`/api/schedules/${id}`);
  },
  async createSchedule(payload: ScheduleWrite): Promise<Schedule> {
    return request<Schedule>("/api/schedules", { method: "POST", body: JSON.stringify(payload) });
  },
  async updateSchedule(id: number, payload: ScheduleWrite): Promise<Schedule> {
    return request<Schedule>(`/api/schedules/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  async attendSchedule(id: number, response: "going" | "notGoing" | null): Promise<Schedule> {
    return request<Schedule>(`/api/schedules/${id}/attend`, {
      method: "POST", body: JSON.stringify({ response }),
    });
  },
  async deleteSchedule(id: number): Promise<void> {
    await request<void>(`/api/schedules/${id}`, { method: "DELETE" });
  },

  async listActivityComments(targetType: ActivityTargetType, targetId: number): Promise<ActivityComment[]> {
    return request<ActivityComment[]>(`/api/activities/comments?targetType=${targetType}&targetId=${targetId}`);
  },
  async createActivityComment(
    targetType: ActivityTargetType, targetId: number, text: string, targetMemberIds: string[],
  ): Promise<ActivityComment> {
    return request<ActivityComment>("/api/activities/comments", {
      method: "POST",
      body: JSON.stringify({ targetType, targetId, text, targetMemberIds }),
    });
  },
  async updateActivityComment(
    commentId: number, text: string, targetMemberIds: string[],
  ): Promise<ActivityComment> {
    return request<ActivityComment>(`/api/activities/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ text, targetMemberIds }),
    });
  },
  async deleteActivityComment(commentId: number): Promise<void> {
    await request<void>(`/api/activities/comments/${commentId}`, { method: "DELETE" });
  },


  async downloadReplay(gameResultId: number): Promise<Blob> {
    const headers = new Headers();
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    const res = await fetch(`${API_BASE}/api/game-results/${gameResultId}/replay`, { headers });
    if (!res.ok) throw new Error("리플레이를 다운로드하지 못했어요.");
    return res.blob();
  },

  /** 판의 게임 색인(사건마다 한 줄 · 운영자 재분석 · sg-api game_result_index) — 통째로 갈아 끼운다 · 판을 열 때는 안 부른다. */
  async putGameIndex(gameResultId: number, rows: GameIndexRow9[]): Promise<void> {
    await request<{ rows: number }>(`/api/game-results/${gameResultId}/index`, {
      method: "PUT", body: JSON.stringify({ rows }),
    });
  },

  async reanalyzeGameResult(
    gameResultId: number,
    body: {
      mapData?: ReplayMapGrid | null;
      chats?: { frame: number; text: string; name?: string }[];
      mapName?: string | null;
      gameStartedAt?: string | null;
      durationSeconds?: number | null;
      slots?: {
        rawName: string;
        race: string;
        apm: number | null;
        eapm: number | null;
        cmdCount: number | null;
        effectiveCmdCount: number | null;
        buildCount: number | null;
      }[];
    },
  ): Promise<void> {
    await request<void>(`/api/game-results/${gameResultId}/summary`, {
      method: "POST", body: JSON.stringify(body),
    });
  },

  async downloadReplayArchive(): Promise<Blob> {
    const headers = new Headers();
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    const res = await fetch(`${API_BASE}/api/game-results/replays/archive`, { headers });
    if (!res.ok) throw new Error("리플레이를 다운로드하지 못했어요.");
    return res.blob();
  },

  async updateProfile(id: string, patch: Partial<Member>): Promise<Member> {
    return request<Member>(`/api/members/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  async replaceMemberReplayAliases(id: string, aliases: string[]): Promise<Member> {
    return request<Member>(`/api/members/${id}/replay-aliases`, {
      method: "PUT",
      body: JSON.stringify({ aliases }),
    });
  },

  async addMemberReplayAlias(id: string, alias: string): Promise<Member> {
    return request<Member>(`/api/members/${id}/replay-aliases`, {
      method: "POST",
      body: JSON.stringify({ alias }),
    });
  },

  async updateMemberPassword(id: string, newPassword: string): Promise<Member> {
    return request<Member>(`/api/members/${id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ newPassword }),
    });
  },

  async updateMemberStatus(id: string, status: MemberStatus): Promise<Member> {
    return request<Member>(`/api/members/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  async updateMemberRoles(id: string, roles: MemberRole[]): Promise<Member> {
    return request<Member>(`/api/members/${id}/roles`, {
      method: "PATCH",
      body: JSON.stringify({ roles }),
    });
  },

  async setMemberRosterImage(id: string, image: string | null): Promise<Member> {
    return request<Member>(`/api/members/${id}/roster-image`, {
      method: "PUT", body: JSON.stringify({ image }),
    });
  },

  /** 운영자 비밀번호 초기화 — 1234 로 되돌린다(2026-10-22). */
  async resetMemberPassword(id: string): Promise<Member> {
    return request<Member>(`/api/members/${id}/password/reset`, { method: "POST" });
  },

  async reprocessMemberAvatar(id: string): Promise<Member> {
    return request<Member>(`/api/members/${id}/avatar/reprocess`, { method: "POST" });
  },

  async withdraw(id: string): Promise<Member> {
    return request<Member>(`/api/members/${id}/withdraw`, { method: "POST" });
  },

  async pingPublicAccess(screen: string, detail?: string): Promise<void> {
    try {
      await request<void>("/api/public/access-ping", {
        method: "POST", body: JSON.stringify({ screen, detail: detail ?? null }),
      });
    } catch { return; }
  },

  async getExtShareLists(): Promise<ExtShareList[]> {
    return request<ExtShareList[]>("/api/public/share/lists");
  },

  async enterExtShare(listId: number, password: string): Promise<void> {
    await request<{ ok: boolean }>(`/api/restricted/share/lists/${listId}/enter`, {
      method: "POST", body: JSON.stringify({ password }),
    });
  },

  async getExtShareGames(listId: number, password: string): Promise<GameResult[]> {
    const res = await request<{ items: WireGameResult[] }>(
      `/api/restricted/share/lists/${listId}/games`, { headers: { "X-Ext-Pass": password } },
    );
    return res.items.map(gameResultFromWire);
  },

  async pingAccess(screen: ScreenKey | "share" | (string & {}), detail?: string): Promise<void> {
    await request<void>("/api/auth/access-ping", {
      method: "POST",
      body: JSON.stringify({ screen, detail: detail ?? null }),
    });
  },

  /** 게임 목록의 동작 기록(2026-10-21, 요청: "공유, 리플레이 다운로드, 스크랩, 그래프보기도 access_history 에 기록(특정 가능하게)" · 스크랩은 2026-10-22 걷음) — 화면 코드 game_<동작> ·
   *  detail "game#게임번호". 기록이 안 돼도 동작은 그대로 간다(조용히 삼킨다). */
  async pingGameAction(action: "share" | "replay" | "graph", game: { id: number; matchNo?: string | null }): Promise<void> {
    try {
      await this.pingAccess(`game_${action}`, `game#${game.matchNo || String(game.id)}`);
    } catch { return; }
  },

  async getAppVersion(): Promise<AppVersionStatus> {
    return request<AppVersionStatus>("/api/app-version");
  },

  async getAppVersions(): Promise<AppVersionInfo[]> {
    return request<AppVersionInfo[]>("/api/app-versions");
  },

  async setAppVersion(activeVersion: AppVersion): Promise<AppVersionStatus> {
    return request<AppVersionStatus>("/api/app-version", {
      method: "PUT",
      body: JSON.stringify({ activeVersion }),
    });
  },

  async addAppVersion(number: AppVersion): Promise<AppVersionInfo> {
    return request<AppVersionInfo>("/api/app-versions", {
      method: "POST",
      body: JSON.stringify({ number }),
    });
  },

  async deleteAppVersion(number: AppVersion): Promise<void> {
    await request<void>(`/api/app-versions/${encodeURIComponent(number)}`, { method: "DELETE" });
  },

  async setVersionNoticeEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
    return request<{ enabled: boolean }>("/api/app-versions/notice-settings", {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
  },

  async setVersionNotes(number: AppVersion, notes: string): Promise<AppVersionInfo> {
    return request<AppVersionInfo>(`/api/app-versions/${encodeURIComponent(number)}/notes`, {
      method: "PUT",
      body: JSON.stringify({ notes }),
    });
  },

  async verifyAdminPanelPassword(password: string): Promise<boolean> {
    const res = await request<{ ok: boolean }>("/api/env-vars/admin-panel/verify", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    return res.ok;
  },

  async getLeagues(): Promise<LeagueListItem[]> {
    const res = await request<{ items: LeagueListItem[] }>("/api/leagues");
    return res.items;
  },
  async getPlacementRounds(): Promise<PlacementRoundBrief[]> {
    return (await request<{ items: PlacementRoundBrief[] }>("/api/placement")).items;
  },
  async getPlacementRound(id: number): Promise<PlacementRound> {
    return request<PlacementRound>(`/api/placement/${id}`);
  },
  async createPlacementRound(name: string): Promise<PlacementRound> {
    return request<PlacementRound>("/api/placement", { method: "POST", body: JSON.stringify({ name }) });
  },
  async renamePlacementRound(id: number, name: string): Promise<PlacementRound> {
    return request<PlacementRound>(`/api/placement/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
  },
  async deletePlacementRound(id: number): Promise<void> {
    await request<void>(`/api/placement/${id}`, { method: "DELETE" });
  },
  async addPlacementPlayer(id: number, memberId: string): Promise<PlacementRound> {
    return request<PlacementRound>(`/api/placement/${id}/players`, { method: "POST", body: JSON.stringify({ memberId }) });
  },
  async removePlacementPlayer(id: number, memberId: string): Promise<PlacementRound> {
    return request<PlacementRound>(`/api/placement/${id}/players/${encodeURIComponent(memberId)}`, { method: "DELETE" });
  },
  /** 한 대진의 세트를 통째로 — 이긴 쪽(a · b)은 여기 적은 a · b 기준. */
  async setPlacementSets(id: number, a: string, b: string, sets: LeagueMatchSet[]): Promise<PlacementRound> {
    return request<PlacementRound>(`/api/placement/${id}/sets`, {
      method: "PUT", body: JSON.stringify({ a, b, sets: sets.map((s) => ({ gameResultId: s.gameResultId, winner: s.winner, memo: s.memo ?? "" })) }),
    });
  },

  async getLeague(id: number): Promise<League> {
    return request<League>(`/api/leagues/${id}`);
  },
  async createLeague(payload: LeagueCreatePayload): Promise<League> {
    return request<League>("/api/leagues", { method: "POST", body: JSON.stringify(payload) });
  },
  async updateLeague(id: number, payload: LeagueUpdatePayload): Promise<League> {
    return request<League>(`/api/leagues/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  async deleteLeague(id: number): Promise<void> {
    await request<void>(`/api/leagues/${id}`, { method: "DELETE" });
  },
  async addLeaguePoolMember(
    leagueId: number, body: { kind: LeaguePoolKind; memberId?: string; name?: string },
  ): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/pool`, {
      method: "POST", body: JSON.stringify(body),
    });
  },
  async removeLeaguePoolMember(leagueId: number, poolId: number): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/pool/${poolId}`, { method: "DELETE" });
  },
  async addLeagueTeam(leagueId: number, size: number): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/teams`, {
      method: "POST", body: JSON.stringify({ size }),
    });
  },
  async updateLeagueTeam(leagueId: number, teamId: number, size: number): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/teams/${teamId}`, {
      method: "PATCH", body: JSON.stringify({ size }),
    });
  },
  async setLeagueTeamComposition(
    leagueId: number, teams: LeagueTeamCompositionEntry[],
  ): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/teams`, {
      method: "PUT", body: JSON.stringify({ teams }),
    });
  },
  async setLeagueBracket(
    leagueId: number,
    paths: string[],
    assignments: { path: string; side: LeagueMatchSide; teamId: number | null }[],
  ): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/bracket`, {
      method: "PUT", body: JSON.stringify({ paths, assignments }),
    });
  },
  async confirmLeagueBracket(leagueId: number): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/bracket/confirm`, { method: "POST" });
  },
  async setLeagueBracketSeeding(
    leagueId: number, assignments: { matchId: number; side: LeagueMatchSide; teamId: number | null }[],
  ): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/bracket/seeding`, {
      method: "PUT", body: JSON.stringify({ assignments }),
    });
  },
  async setLeagueMatchSchedule(leagueId: number, matchId: number, scheduledAt: string | null): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/matches/${matchId}/schedule`, {
      method: "PUT", body: JSON.stringify({ scheduledAt }),
    });
  },
  async setLeagueMatchResult(
    leagueId: number, matchId: number, setsWonA: number | null, setsWonB: number | null,
  ): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/matches/${matchId}/result`, {
      method: "PUT", body: JSON.stringify({ setsWonA, setsWonB }),
    });
  },
  async setLeagueMatchSets(leagueId: number, matchId: number, sets: LeagueMatchSet[]): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/matches/${matchId}/sets`, {
      method: "PUT", body: JSON.stringify({ sets }),
    });
  },

  async setLeagueMatchNote(leagueId: number, matchId: number, note: string): Promise<League> {
    return request<League>(`/api/leagues/${leagueId}/matches/${matchId}/note`, {
      method: "PUT", body: JSON.stringify({ note }),
    });
  },

  async adminExtShareLists(): Promise<ExtShareList[]> {
    return request<ExtShareList[]>("/api/ext-share/admin/lists");
  },
  async adminCreateExtShareList(name: string, password: string): Promise<ExtShareList> {
    return request<ExtShareList>("/api/ext-share/admin/lists", {
      method: "POST", body: JSON.stringify({ name, password }),
    });
  },
  async adminPatchExtShareList(
    id: number, patch: { name?: string; password?: string; sortOrder?: number },
  ): Promise<ExtShareList> {
    return request<ExtShareList>(`/api/ext-share/admin/lists/${id}`, {
      method: "PATCH", body: JSON.stringify(patch),
    });
  },
  async adminDeleteExtShareList(id: number): Promise<void> {
    await request<void>(`/api/ext-share/admin/lists/${id}`, { method: "DELETE" });
  },
  async adminExtShareGames(listId: number): Promise<GameResult[]> {
    const res = await request<{ items: WireGameResult[] }>(
      `/api/ext-share/admin/lists/${listId}/games`,
    );
    return res.items.map(gameResultFromWire);
  },
  async adminAddExtShareGames(listId: number, gameIds: number[]): Promise<ExtShareAddResult> {
    return request<ExtShareAddResult>(`/api/ext-share/admin/lists/${listId}/games`, {
      method: "POST", body: JSON.stringify({ gameIds }),
    });
  },
  async adminRemoveExtShareGame(listId: number, gameId: number): Promise<void> {
    await request<void>(`/api/ext-share/admin/lists/${listId}/games/${gameId}`, { method: "DELETE" });
  },
};
