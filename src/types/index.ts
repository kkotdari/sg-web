import type { TruthMix } from "../utils/statsMix";
import type { ReplayMapGrid } from "../utils/replayParser";

export type BaseRace = "테란" | "프로토스" | "저그";

import type { Race } from "scplay";

export type { Race };

export type GameOutcome = "team1" | "team2" | "draw" | "not_held" | "unknown";

export type GameType = "0101" | "0102" | "0103";

export type MemberStatus = "pending" | "active" | "suspended" | "withdrawn";

export type MemberRole = "0202" | "0203";

export interface Member {
  id: string;
  nickname: string;
  battletag: string;
  insta: string;
  avatar: string | null;
  rosterImage: string | null;
  replayAliases: string[];
  roles: MemberRole[];
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SignupPayload {
  id: string;
  password: string;
  nickname: string;
  battletag: string;
  replayAliases: string[];
  insta: string;
  avatar: string | null;
}

export interface MemberCreatePayload {
  id: string;
  password: string;
  nickname: string;
  battletag: string;
  replayAliases?: string[];
  insta: string;
  avatar: string | null;
}

export type ReplayNameKind = "computer" | "unregistered";
export interface ReplayNameClassificationEntry {
  rawName: string;
  kind: ReplayNameKind;
}

export type ReplayNameMappingKind = "member" | "computer" | "unregistered" | "unresolved";
export interface ReplayNameMappingMember {
  id: string;
  nickname: string;
  battletag: string;
  avatar: string | null;
}
export interface ReplayNameMappingEntry {
  rawName: string;
  kind: ReplayNameMappingKind;
  member: ReplayNameMappingMember | null;
  lastSeen: string | null;
  appearances?: number | null;
  hasMatches: boolean;
}

/** 게임 그래프의 한 사람(GET /api/game-results/{id}/curves · 2026-10-21) — 0분부터 1분 간격 · color 는 개인색 "#rrggbb"(못 읽었으면 null). */
export interface GameCurve {
  memberId: string;
  playerName: string;
  team: "team1" | "team2" | string;
  race: Race | "";
  color: string | null;
  wk: number[];
  /** 분마다 인구 · 일꾼 뺀 인구(2026-10-21 · 병력 가치 대신). */
  sp: number[];
  sx: number[];
  /** 분마다 쥔 미네랄 · 가스(자원 그래프 · PC). */
  rm: number[];
  rg: number[];
  /** 모든 건물의 생애(초) — t 처음 종류 · s 짓기 시작 · d 다 지음(못 지었으면 null) · e 사라짐(끝까지 남았으면 null)
   *  · m 변태들 [새 종류, 변태 시작, 다 됨(못 됐으면 null)](해처리 → 레어 · 크립 → 성큰 …) · PC 건설 줄. */
  /** h — 애드온만: 붙어 있던 본 건물 [같은 사람 blds 안 차례, 붙은 초] · 본 건물이 바뀔 때마다 한 줄(2026-10-22). */
  blds: { t: number; s: number; d: number | null; e: number | null; m: [number, number, number | null][]; x: [number, number][]; h?: [number, number][] }[];
  /** 테크 건물 종류별 첫 한 채 — t 유닛 종류 · s 짓기 시작 초 · e 다 지은 초. */
  techs: { t: number; s: number; e: number }[];
}

export interface GameResultSlot {
  memberId: string;
  race: Race | "";
  rawName?: string | null;
  apm: number | null;
  eapm: number | null;
  cmdCount: number | null;
  effectiveCmdCount: number | null;
  buildCount: number | null;
  color?: string | null;
  observer?: boolean | null;
}

export interface Replay {
  id: number;
  originalName: string;
  displayName: string;
  url: string;
}

export interface ReplayUpload {
  originalName: string;
  displayName: string;
  url: string;
}

export interface GameResultAuthor {
  id: string;
  nickname: string;
}

export interface ActivityCommentMention {
  memberId: string;
  nickname: string;
}

export interface ActivityCommentAuthor {
  memberId: string;
  nickname: string;
  avatar: string | null;
}

export interface RankingShiftEntry {
  memberId: string;
  nickname: string;
  from: number | null;
  to: number;
  fromPoints?: number | null;
  toPoints?: number | null;
}
export interface RankingShiftSection {
  matchType: GameType;
  shifts: RankingShiftEntry[];
}
export interface RankingShift {
  id: number;
  reason: "daily" | "seed";
  createdAt: string;
  matchIds: number[];
  sections: RankingShiftSection[];
}

export type ActivityTargetType =
  | "gameResult" | "rankingShift" | "leagueMatch" | "schedule" | "notice";
export interface ActivityComment {
  id: number;
  targetType: ActivityTargetType;
  targetId: number;
  text: string;
  author: ActivityCommentAuthor;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  mentions: ActivityCommentMention[];
}


export interface GameResult {
  id: number;
  matchNo: string;
  date: string;
  team1: GameResultSlot[];
  team2: GameResultSlot[];
  result: GameOutcome;
  matchType: GameType;
  gameType?: number;
  replay: Replay | null;
  createdBy: GameResultAuthor | null;
  mapName: string | null;
  gameStartedAt: string | null;
  durationSeconds: number | null;
  mapHash: string | null;
  mapCanonName?: string | null;
  viewCount?: number;
  /** 추천 수 · 내가 추천했나(2026-10-22) · 명예의 전당 판인가(마감 때 추천 3 이상). */
  recommendCount?: number;
  recommended?: boolean;
  fame?: boolean;
  hasTruth?: boolean | null;
  hidden?: boolean;
  /** 내전(참가자 전원이 회원)인가 — 서버가 실어 준다(비공개 판은 팀이 비어 슬롯으로 못 가른다 · 2026-10-12). 옛 서버면 없다. */
  clan?: boolean;
  /** 유즈맵 판 — 기록만 남고 통계·재생기에서 빠진다(서버 game_result_ums · 2026-10-19). 옛 서버면 없다. */
  ums?: boolean;
  /** 리그 경기 세트로 쓰인 판이면 그 자리 — 리그 탭의 배지 "2026 팀리그 · 결승 · 1세트"(2026-10-19). 아니면 null · 옛 서버면 없다. */
  league?: GameLeagueTag | null;
}

export interface GameLeagueTag {
  leagueId: number;
  leagueName: string;
  roundName: string;
  /** 라운드 안 경기 번호(1부터 · 결승은 없다 · 2026-10-21). */
  matchInRound?: number | null;
  setNo: number;
}

export interface DeletedGameResult extends GameResult {
  deletedAt: string;
  deletedBy: GameResultAuthor | null;
}

/** 숨긴 경기 해제 요청(운영자 화면 · 서버 game_unhide_requests · 2026-10-19). */
export interface GameUnhideRequest {
  id: number;
  gameResultId: number;
  matchNo: string;
  gameDate: string;
  hiddenAt: string | null;
  requestedBy: string | null;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
}

export type NewGameResult = Omit<GameResult, "id" | "matchNo" | "createdBy" | "replay" | "mapHash"> & {
  replay: ReplayUpload | null;
  mapData: ReplayMapGrid | null;
  chats?: { frame: number; text: string; name?: string }[];
};

export interface GameResultPage {
  items: GameResult[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number | null;
}

export interface MemberStats {
  plays: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  bests: number;
  lostBests?: number;
  avgApm: number | null;
  avgEapm: number | null;
  avgCmd: number | null;
  avgEcmd: number | null;
  avgBuild: number | null;
  truthMix: TruthMix | null;
  buildMix?: TruthMix | null;
  avgWorker5: number | null;
  mixPlays: number | null;
  mixSeconds: number | null;
  upPlays: number | null;
  kills?: number | null;
  deaths?: number | null;
  /** 인구 K/D — 잡은·잃은 유닛의 인구 합(저글링 0.5). 새 덤퍼로 구운 경기에만 있다. */
  killSupply?: number | null;
  deathSupply?: number | null;
  kdPlays?: number | null;
  /** 준·입은 데미지 — 체력+실드 점수 합. 유닛·건물로 나눠 오고 화면은 합쳐 보인다. dmgPlays = 그 값이 있는 경기 수. */
  dmgDealtUnit?: number | null;
  dmgDealtBldg?: number | null;
  dmgTakenUnit?: number | null;
  dmgTakenBldg?: number | null;
  dmgPlays?: number | null;
  /** 경기 평균 대비 %(준·입은) — 내 합 ÷ 그 경기들의 '평균 선수' 합 · 100 = 평균. 화면은 '평균의 1.1배 입힘 / 0.8배 입음'.
   *  판 수·길이·팀 인원이 지워진 공평한 자. */
  dmgDealtRel?: number | null;
  dmgTakenRel?: number | null;
  dmgRelPlays?: number | null;
  /** 통계용 참값의 분당 평균 곡선(서버 game_result_participant_curves · 2026-10-20) — 0분부터 1분 간격.
   *  wk 일꾼 수 · sp 인구 · sx 일꾼 뺀 인구 · n 그 분까지 간 판 수. 곡선 있는 판이 없으면 null. */
  curve?: StatCurve | null;
}

export interface StatCurve { wk: number[]; sp: number[]; sx: number[]; n: number[] }

export interface MemberStatsEntry {
  memberId: string;
  overall: MemberStats;
  byRace: Record<BaseRace, MemberStats>;
  mostPlayedRace: Race | null;
  sortOrder: number | null;
  tieGroup: number | null;
  personScore: number | null;
  superiorCount: number | null;
  equalCount: number | null;
  inferiorCount: number | null;
  rankScore: number | null;
  mu: number | null;
  sigma: number | null;
  ratingGames: number | null;
  provisional: boolean | null;
}

export interface RatingHistoryResponse {
  deltas: Record<string, number>;
  mu: number | null;
  sigma: number | null;
  conservative: number | null;
  games: number;
  provisional: boolean;
}

export interface RivalryPair {
  a: string;
  b: string;
  aWins: number;
  bWins: number;
  draws: number;
}

export interface ClanBreakdownEntry {
  label: string;
  plays: number;
  ratio: number;
}

export interface ClanCompEntry {
  format: string;
  label: string;
  plays: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

export interface GameResultStatsResponse {
  members: MemberStatsEntry[];
  clan: MemberStatsEntry;
  clanMaps: ClanBreakdownEntry[];
  clanFormats: ClanBreakdownEntry[];
  clanComps?: ClanCompEntry[];
}

export interface TeamRankEntry {
  memberIds: string[];
  plays: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
}

export interface TeamRankingResponse {
  teams: TeamRankEntry[];
}

export type ScreenKey = "activity" | "ladder" | "clan" | "members" | "leagues" | "minimaps" | "control"
  | "catalog" | "explore";
export const SCREEN_KEYS: ScreenKey[] = ["activity", "ladder", "clan", "members",
  "leagues", "minimaps", "control", "catalog", "explore"];

export interface ExtShareList {
  id: number;
  name: string;
  gameCount: number;
  locked: boolean;
  password?: string;
  sortOrder?: number;
}

export interface ExtShareAddResult {
  added: number;
  already: number;
  skipped: number;
}

export type AppVersion = string;

export interface AppVersionStatus {
  activeVersion: AppVersion;
  noticeEnabled: boolean;
}

export interface AppVersionInfo {
  number: AppVersion;
  notes: string;
}

export type PeriodPreset = "all" | "today" | "week" | "month" | "year" | "custom";

export type LeagueMode = "team" | "individual";
export type LeagueStatus = "setup" | "active" | "completed";
export type LeagueMatchSide = "a" | "b";

export type LeaguePoolKind = "member" | "guest" | "computer";

export interface LeagueRosterMember {
  poolId: number;
  kind: LeaguePoolKind;
  memberId: string;
  nickname: string;
  battletag: string;
  avatar: string | null;
  rosterImage: string | null;
  position: number;
}

export interface LeaguePoolMember {
  id: number;
  kind: LeaguePoolKind;
  memberId: string;
  nickname: string;
  battletag: string;
  avatar: string | null;
  rosterImage: string | null;
}

export interface LeagueTeam {
  id: number;
  label: string;
  size: number;
  roster: LeagueRosterMember[];
}

export interface LeagueMatchTeamRef {
  id: number;
  label: string;
}

export interface LeagueMatchSubstitution {
  teamId: number;
  rosterPosition: number;
  substituteMemberId: string;
  substituteNickname: string;
  note: string;
}

/** 경기 한 판의 세트 — 그 세트로 친 게임 결과(고른 것이 있으면)와 이긴 쪽("draw" 무승부 · 2026-10-19) · 손으로 적은 글(게임을 안 이은 세트). */
export interface LeagueMatchSet {
  gameResultId: number | null;
  winner: LeagueMatchSide | "draw" | null;
  /** 옛 서버면 없다. */
  memo?: string;
}

export interface LeagueMatch {
  id: number;
  round: number;
  slotInRound: number;
  teamA: LeagueMatchTeamRef | null;
  teamB: LeagueMatchTeamRef | null;
  isDead: boolean;
  scheduledAt: string | null;
  setsWonA: number | null;
  setsWonB: number | null;
  winnerTeamId: number | null;
  note: string;
  substitutions: LeagueMatchSubstitution[];
  /** 옛 서버면 없다. */
  sets?: LeagueMatchSet[];
}

export interface League {
  id: number;
  name: string;
  mode: LeagueMode;
  status: LeagueStatus;
  drawSize: number | null;
  plannedTeams: number | null;
  bracketLocked: boolean;
  pool: LeaguePoolMember[];
  teams: LeagueTeam[];
  matches: LeagueMatch[];
  createdAt: string;
}

export interface LeagueListItem {
  id: number;
  name: string;
  mode: LeagueMode;
  status: LeagueStatus;
  teamCount: number;
}

export interface LeagueCreatePayload {
  name: string;
  mode: LeagueMode;
}

export interface LeagueUpdatePayload {
  name?: string;
}

export interface LeagueTeamCompositionEntry {
  id: number | null;
  size?: number;
  roster: (number | null)[];
}



export interface MapCanon {
  id: number;
  name: string;
  matches?: number;
}

export interface MapCatalogEntry {
  hash: string;
  name: string | null;
  width: number;
  height: number;
  matches: number;
  sharedMatches?: number;
  orphan?: boolean;
  canonId: number | null;
  hasTerrain?: boolean;
}

export interface MapCatalog {
  maps: MapCatalogEntry[];
  canons: MapCanon[];
}

export interface LeagueMatchMember {
  memberId: string;
  nickname: string;
}

export interface LeagueMatchTeam {
  label: string;
  members: LeagueMatchMember[];
}

export interface LeagueMatchActivity {
  id: number;
  leagueId: number;
  leagueName: string;
  roundName: string;
  teamA: LeagueMatchTeam | null;
  teamB: LeagueMatchTeam | null;
  scheduledAt: string | null;
  setsWonA: number | null;
  setsWonB: number | null;
  winnerSide: "a" | "b" | null;
  postedAt: string;
  updatedAt: string;
}

export interface ScheduleFile {
  name: string;
  url: string;
  size: number;
}

export interface ScheduleAttendee {
  memberId: string;
  nickname: string;
  avatar: string | null;
  response: "going" | "notGoing";
}

export interface SchedulePhoto {
  id: string;
  url: string;
  name: string;
  size: number;
  /** 긴 변 240 썸네일(사진 · 동영상 첫 장면 · 2026-10-19) — 작은 사진·옛 서버·풀 수 없는 동영상은 없다(원본으로 내려간다). */
  thumbUrl?: string | null;
  file?: File;
}

export interface ScheduleBlock {
  id: string;
  kind: "text" | "list" | "photo" | "photos" | "slides" | "file";
  text: string;
  title: string;
  items: string[];
  url: string;
  name: string;
  size: number;
  photos: SchedulePhoto[];
  collapsed?: boolean;
  indent?: number;
  levels?: number[];
  /** 화면만 쓰는 표식 — 아직 비어 있는 새 제목 요소(저장하지 않는다 · 제목 글자가 생기면 title 로 안다). */
  heading?: boolean;
}

/** 사진을 담는 요소 — 사진 목록(photos · 격자)과 사진 슬라이드(slides · 큰 액자)(2026-10-22, 요청: "요소를 사진 목록과 사진 슬라이드로 나눔"). */
export const isPhotoSet = (b: { kind: ScheduleBlock["kind"] }): b is { kind: "photos" | "slides" } => b.kind === "photos" || b.kind === "slides";

export interface Schedule {
  id: number;
  title: string;
  scheduledDate: string;
  scheduledTime: string | null;
  content: string;
  linkUrl: string;
  files: ScheduleFile[];
  blocks: ScheduleBlock[];
  attendees: ScheduleAttendee[];
  createdBy: { id: string; nickname: string; avatar: string | null };
  createdAt: string;
  updatedAt: string;
}

export type ScheduleBlockWrite = (
  | { kind: "text"; id?: string; title: string; text: string }
  | { kind: "list"; id?: string; title: string; items: string[]; levels: number[] }
  | { kind: "photos" | "slides"; id?: string; title: string; photos: ({ id: string } | { file: { name: string; data: string } })[] }
  | { kind: "photo" | "file"; id: string }
  | { kind: "photo" | "file"; file: { name: string; data: string } }
) & { collapsed?: boolean; indent?: number };

export interface ScheduleWrite {
  title: string;
  scheduledDate: string;
  scheduledTime: string | null;
  expectedUpdatedAt?: string;
  blocks?: ScheduleBlockWrite[];
  content?: string;
  linkUrl?: string;
  files?: (ScheduleFile | { name: string; data: string })[];
}

export interface ActivityNotice {
  id: number;
  kind: string;
  payload: {
    reason?: RankingShift["reason"];
    matchIds?: number[];
    sections?: RankingShiftSection[];
  };
  createdAt: string;
}

export interface ActivityFeedItem {
  key: string;
  kind: "gameResultPost" | "leagueMatch" | "schedule" | "notice";
  gameResults: GameResult[];
  leagueMatch?: LeagueMatchActivity | null;
  schedule?: Schedule | null;
  notice?: ActivityNotice | null;
  comments: ActivityComment[];
}

export interface ActivityFeedPage {
  total: number;
  totalActivities: number;
  items: ActivityFeedItem[];
  nextCursor: string | null;
}
