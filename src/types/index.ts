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
  | "gameResult" | "challenge" | "rankingShift" | "leagueMatch" | "schedule" | "notice";
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
  hasTruth?: boolean | null;
  hidden?: boolean;
}

export interface DeletedGameResult extends GameResult {
  deletedAt: string;
  deletedBy: GameResultAuthor | null;
}

export type NewGameResult = Omit<GameResult, "id" | "matchNo" | "createdBy" | "replay" | "mapHash"> & {
  replay: ReplayUpload | null;
  mapData: ReplayMapGrid | null;
  chats?: { frame: number; text: string }[];
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

export interface GameResultStatsResponse {
  members: MemberStatsEntry[];
  clan: MemberStatsEntry;
  clanMaps: ClanBreakdownEntry[];
  clanFormats: ClanBreakdownEntry[];
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

export type ScreenKey = "activity" | "ladder" | "clan" | "members" | "leagues" | "minimaps" | "control" | "scraps" | "guide"
  | "catalog" | "explore";
export const SCREEN_KEYS: ScreenKey[] = ["activity", "ladder", "clan", "members",
  "leagues", "minimaps", "control", "scraps", "guide", "catalog", "explore"];

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

export interface SceneScrap {
  id: number;
  title: string;
  subtitle: string;
  link: string;
  gameNo?: string | null;
  createdAt: string;
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

export type ChallengeMatchType = "0101" | "0102";
export type ChallengeTargetResponse = "pending" | "accepted" | "rejected" | "discarded";
export type ChallengeStatus = "pending" | "confirmed" | "done" | "discarded";
export type ChallengeSide = "creator" | "target";
export type ChallengeResult = "creator" | "target" | "draw" | "not_held";

export interface ChallengeTarget {
  memberId: string;
  nickname: string;
  battletag: string;
  avatar: string | null;
  response: ChallengeTargetResponse;
  responseMessage: string;
}

export interface ChallengeOwnMember {
  memberId: string;
  nickname: string;
  battletag: string;
  avatar: string | null;
}

export interface Challenge {
  id: number;
  matchType: ChallengeMatchType;
  message: string;
  scheduledAt: string | null;
  scheduledDate: string | null;
  scheduledTimeNote: string;
  status: ChallengeStatus;
  createdBy: { id: string; nickname: string; avatar: string | null };
  targets: ChallengeTarget[];
  ownMembers: ChallengeOwnMember[];
  createdAt: string;
  updatedAt: string;
  discardedAt: string | null;
  canceledBy: { id: string; nickname: string; avatar: string | null } | null;
  resultWinnerSide: ChallengeResult | null;
  backdropUrl: string | null;
  backdropShareUrl: string | null;
  backdropShareWidth: number | null;
  backdropShareHeight: number | null;
}

export interface ChallengeCreatePayload {
  scheduledDate?: string | null;
  scheduledTimeNote?: string;
  message?: string;
  targetMemberIds: string[];
  ownTeamMemberIds?: string[];
  backdrop?: string | null;
  backdropShare?: string | null;
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
  thumbUrl: string | null;
  name: string;
  size: number;
  file?: File;
}

export interface ScheduleBlock {
  id: string;
  kind: "text" | "list" | "photo" | "photos" | "file";
  text: string;
  title: string;
  items: string[];
  url: string;
  name: string;
  size: number;
  photos: SchedulePhoto[];
}

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

export type ScheduleBlockWrite =
  | { kind: "text"; id?: string; title: string; text: string }
  | { kind: "list"; id?: string; title: string; items: string[] }
  | { kind: "photos"; id?: string; title: string; photos: ({ id: string } | { file: { name: string; data: string } })[] }
  | { kind: "photo" | "file"; id: string }
  | { kind: "photo" | "file"; file: { name: string; data: string } };

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
  kind: "challenge" | "gameResultPost" | "leagueMatch" | "schedule" | "notice";
  challenge?: Challenge | null;
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
