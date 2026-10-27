import type { TruthMix } from "../utils/statsMix";
import type { ReplayMapGrid } from "scplay";

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
  /** 분마다 그 앞 1분 동안 캔 미네랄 · 가스(원작 채집 누적 · 참값 판 14 · 2026-10-22) — 누적은 화면이 더한다. 재분석 전 판은 빈 줄. */
  cm?: number[];
  cg?: number[];
  /** 인구 계단 [[초, 인구], …] — 바뀔 때만(건물 칩 팝오버의 그때 인구 · 2026-10-22). 재분석 전 판은 빈 줄. */
  spt?: [number, number][];
  /** 분마다 그 앞 1분 동안 준 · 입은 데미지(체력+실드 · 유닛+건물 · 2026-10-22) — 누적은 화면이 더한다. 옛 판(참값 판 13 아래)은 빈 줄. */
  dd?: number[];
  dt?: number[];
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
  /** 시작 위치(타일 · 2026-10-26 · 게임 목록 배치 칸) — 리플레이 MapData.StartLocations(그 슬롯) ÷ 32 · 서버가 반올림. */
  startX?: number | null;
  startY?: number | null;
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

export interface ItemCommentMention {
  memberId: string;
  nickname: string;
}

export interface ItemCommentAuthor {
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

export type CommentTargetType =
  | "gameResult" | "rankingShift" | "leagueMatch" | "notice" | "post";
export interface ItemComment {
  id: number;
  targetType: CommentTargetType;
  targetId: number;
  text: string;
  author: ItemCommentAuthor;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  mentions: ItemCommentMention[];
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
  /** 리플레이 저장자(2026-10-26 · 팀챗/전체 가름). */
  chatSaver?: string | null;
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
}

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
  /** 팀전 티어(sg-api tier.py · 2026-10-27) — 팀전 조회에서만 · 1 이 가장 높다. */
  tier?: TierEntry | null;
}

/** 팀전 티어 — tier/score 는 판이 다섯 미만이면 null(신뢰도 부족). win = 팀원·상대·종족 조합을 걷어낸 보정 승률(%) · 나머지는 그 판 참가자 평균 대비 배수. */
export interface TierEntry {
  tier: number | null;
  tiers: number;
  score: number | null;
  plays: number;
  win: number | null;
  dmg: number | null;
  wk: number | null;
  res: number | null;
  sup: number | null;
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

/** 종족 구성 맞대결 전적(서버 ClanCompVsEntry · 2026-10-24) — 판 꼴(format)에서 구성 a 가 b 를 만난 판·a 승·b 승·무. a ≤ b 로 한 번만(거꾸로 만난 판은 뒤집어 읽는다). */
export interface ClanCompVsEntry {
  format: string;
  a: string;
  b: string;
  plays: number;
  aWins: number;
  bWins: number;
  draws: number;
}

export interface GameResultStatsResponse {
  members: MemberStatsEntry[];
  clan: MemberStatsEntry;
  clanMaps: ClanBreakdownEntry[];
  clanFormats: ClanBreakdownEntry[];
  clanComps?: ClanCompEntry[];
  clanCompVs?: ClanCompVsEntry[];
  /** 달별 변화("YYYY-MM" → 사람 줄들) — trendMonths 를 줬을 때만(2026-10-24 · 통계 변화 그래프). */
  trend?: Record<string, MemberStatsEntry[]> | null;
  /** 달별 평균 줄 · 달별 경기 수(2026-10-25 · 평균 행의 변화 그래프) — trend 와 같은 열쇠. */
  trendClan?: Record<string, MemberStatsEntry> | null;
  trendGames?: Record<string, number> | null;
}

/* 옛 "activity"(활동) 화면은 게임 · 게시판 두 화면이 됐다(2026-10-26, 요청: "활동 화면 제거 · 게임 게시판 두개의 메뉴로"). */
export type ScreenKey = "games" | "board" | "ladder" | "clan" | "members" | "leagues" | "minimaps" | "control"
  | "catalog" | "explore" | "placement";

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

/** 경기 한 판의 세트 — 그 세트로 친 게임 결과(고른 것이 있으면)와 이긴 쪽("draw" 무승부 · 2026-10-19) · 손으로 적은 글(게임을 안 이은 세트). */
export interface LeagueMatchSet {
  gameResultId: number | null;
  winner: LeagueMatchSide | "draw" | null;
  memo: string;
}

/* ★ 배치고사(2026-10-23) — 회차(1차 · 2차 …)마다 참가자 명단과 대진 세트가 따로다. 세트 꼴은 리그 세트와 같다(a = 대진의 앞사람). */
export interface PlacementPlayer {
  memberId: string;
  nickname: string;
  /** 세트 승패로 맞춘 점수(1500 기준 · 브래들리-테리). */
  rating: number;
  /** 1 ~ 4 · 세트를 placedMin 만큼 못 친 사람은 null(미배치). */
  tier: number | null;
  won: number;
  lost: number;
  drawn: number;
  /** 한 세트라도 친 상대 수. */
  met: number;
}
export interface PlacementPair {
  /** 회원 pk 작은 쪽 — 세트의 a. */
  a: string;
  b: string;
  sets: LeagueMatchSet[];
}
export interface PlacementRound {
  id: number;
  name: string;
  createdAt: string;
  /** 점수 높은 차례. */
  players: PlacementPlayer[];
  pairs: PlacementPair[];
  placedMin: number;
  tierCount: number;
}
export interface PlacementRoundBrief {
  id: number;
  name: string;
  createdAt: string;
  players: number;
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
  sets: LeagueMatchSet[];
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

export interface LeagueMatchEntry {
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

export type ScheduleBlockWrite = (
  | { kind: "text"; id?: string; title: string; text: string }
  | { kind: "list"; id?: string; title: string; items: string[]; levels: number[] }
  | { kind: "photos" | "slides"; id?: string; title: string; photos: ({ id: string } | { file: { name: string; data: string } })[] }
  | { kind: "photo" | "file"; id: string }
  | { kind: "photo" | "file"; file: { name: string; data: string } }
) & { collapsed?: boolean; indent?: number };

/** 게시판 꼭지 — 잡담 · 질문 · 공략(2026-10-26, 요청: "꼭지(분류) 고를수있음 잡담 질문 공략") · 일정(같은 날 "일정도 하나의 글로").
 *  공지는 꼭지가 아니라 따로 붙는 속성(notice). */
export type PostCategory = "chat" | "question" | "guide" | "schedule";

/** 자유게시판 글 — 본문은 일정과 같은 블록 문서(ScheduleBlock). */
export interface Post {
  id: number;
  title: string;
  /** 안 골랐으면 null(요청: "카테고리 픽은 필수 아닌 선택으로"). */
  category: PostCategory | null;
  notice: boolean;
  /** 보는 사람이 쓴 글인가(고치기·지우기). */
  mine?: boolean;
  /** 꼭지 '일정' 글의 일시(YYYY-MM-DD · HH:MM) — 그 밖의 글은 null. */
  scheduledDate: string | null;
  scheduledTime: string | null;
  blocks: ScheduleBlock[];
  createdBy: { id: string; nickname: string; avatar: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface PostWrite {
  title: string;
  category: PostCategory | null;
  /** 운영자만 먹는다(서버가 다른 사람의 값은 무시). */
  notice?: boolean;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  blocks?: ScheduleBlockWrite[];
}

export interface FeedNotice {
  id: number;
  kind: string;
  payload: {
    reason?: RankingShift["reason"];
    matchIds?: number[];
    sections?: RankingShiftSection[];
  };
  createdAt: string;
}

export interface FeedEntry {
  key: string;
  kind: "gameResultPost" | "leagueMatch" | "notice" | "post";
  gameResults: GameResult[];
  leagueMatch?: LeagueMatchEntry | null;
  post?: Post | null;
  notice?: FeedNotice | null;
  comments: ItemComment[];
}

export interface FeedPage {
  total: number;
  totalActivities: number;
  items: FeedEntry[];
  nextCursor: string | null;
}
