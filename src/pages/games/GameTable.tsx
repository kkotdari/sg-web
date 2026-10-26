import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChartLine, EyeOff, Save, Share2 } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { canManageGame } from "../../utils/gameAccess";
import { shareToKakao } from "../../utils/kakaoShare";
import { gameResultShareContent } from "./gameShare";
import { downloadReplay } from "../../utils/replayDownload";
import { cachedReplayMap, useReplayMap, useReplayMapTick } from "scplay";
import { renderMinimapCanvas } from "../../utils/minimapExport";
import type { ReplayMapGrid } from "../../utils/replayParser";
import { api } from "../../api/client";
import { showToast } from "../../components/common/Toast";
import { useLongPress } from "../../hooks/useLongPress";
import { cleanMapName } from "../../utils/mapName";
import { cx } from "../../utils/format";
import { pad } from "../../utils/date";
import { isSecretGame } from "../../utils/gameAccess";
import { isMeleeGame } from "./GameResultSides";
import { GameRowNames } from "./GameRow";
import { RecommendButton, useRecommend } from "./Recommend";
import GameCurvesModal from "../../modals/GameCurvesModal";
import InfoTip from "../../components/common/InfoTip";
import type { GameResult, Member } from "../../types";

/* ★★ PC 게임 목록 = **표**(2026-10-19, 요청: "피시는 오히려 배지들 제거하고 완전 그리드 형태로 변경(헤더로우도 만듦) · 로스터는 모바일과 같은 형태 ·
   컬럼: 게임번호 시작일시 게임길이 맵 로스터 유형(팀전, 유즈맵, 프리포올 등) 재생가능여부 조회수(→ 추천 2026-10-22) 숨김 · 숨긴 게임은 해제요청 버튼").
   2026-10-20: 게임번호 칸 뺌 · 리그는 제 칸 · 일시는 기본 타임스탬프 · 맵 칸 좁히고 가운데(요청).
   머리 줄(GameTableHead)과 줄(GameTableRow)이 같은 열 틀(--gtab-cols · global.css)을 쓴다 — 맵·시간·재생·NEW·'몇 분 전' 배지는 없다.
   로스터 칸은 폰과 같은 꼴(GameRowNames mobile — 팀마다 승패 배지 · 세로 이름 · vs). 폰은 옛 줄(FeedRow → ListRow) 그대로. */

/* 리그 칸은 **앞에서 둘째**이고 **리그 탭에서만** 선다(2026-10-20, 요청: "리그 컬럼은 앞에서 두번째로 이동하고 리그 탭에서만 나오게") —
   열 틀은 목록의 .has-league 가 고른다(global.css). */
/* 재생 칸 → **링크** 칸(2026-10-20, 요청: "게임목록에 pc에 다운로드 버튼(디스켓) 아이콘도 추가(링크 컬럼 추가)") — 리플레이 받기(💾) ·
   (재생 ▶ 은 같은 날 게임길이 칸 아래로 옮겼다) ·
   공유 · 숨기기(같은 날 요청: "링크에 숨기기 버튼 추가 · 스크랩버튼 공유버튼도" · 스크랩은 2026-10-22 기능째 걷었다) ·
   공유는 게임 상세의 공유(카카오 · 안 되면 링크 복사) · 숨기기는 뛴 사람·운영자만(확인 창은 게임 화면이 띄운다 — onHide). */
/* 숨김 칸은 걷었다(2026-10-20, 요청: "숨김 컬럼 제거하고 해제요청 버튼을 숨김 아래로") — 숨긴 판은 로스터 칸의 "비밀" 아래에 해제요청(폰 줄과 같은 꼴). */
/* 데이터 칸(2026-10-21, 요청: "로스터칸 폭 줄이고 분석그래프 컬럼 추가" → "컬럼명 데이터로 · 아이콘은 다른 것들처럼 평범한 아이콘 글자로") — 그래프 보기를 링크 칸에서 꺼내 제 칸에 · 링크 칸과 같은 아이콘 단추. */
/* 차례(2026-10-21, 요청: "유형을 맵 앞으로 · 게임길이 컬럼을 로스터 다음으로 · 리그에선 리그 + 유형 합치기 맨 마지막에 유형을 괄호로 표시") —
   리그 탭은 유형 칸 없이 리그 칸 끝에 "(유형)" · 그 칸 이름은 "경기 정보"(같은 날 요청: "리그 컬럼명을 매치 정보로" → "매치래 경기"). */
/* 링크 칸 → **도구** · 조회수 칸 → **추천**(2026-10-22, 요청: "PC 목록 링크 컬럼을 도구로 바꾸고 추천 버튼도 추가" · "조회수는 화면에서 제거하고 추천 수로" ·
   같은 날 "추천 아이콘은 도구에서 추천 컬럼으로 이동"). */
/* 차례(2026-10-26, 요청: "피시에서 게임길이 컬럼을 맵 다음으로 옮기고 로스터 다음에 배치라는 컬럼 — 미니맵 안개 없는 버전에 각 유저 스타팅 위치 · 종족") —
   맵 · 게임길이 · 로스터 · 배치(아래 StartMapCell). */
const COLS = (league: boolean) => ["시작일시", league ? "경기 정보" : "유형", "맵", "게임길이", "로스터", "배치", "데이터", "도구", "추천"];

/** 맵 그림(안개 없음) — 해시마다 한 번 그려 data URL 로 쥔다(같은 맵의 줄이 나눠 쓴다 · 타일당 1px). */
const thumbCache = new Map<string, Promise<string | null>>();
/** 다 구운 그림(받은 뒤 다시 뜨는 줄이 빈 판 한 틀을 안 거치게 · 아래 StartMapCell 첫 값). */
const thumbDone = new Map<string, string | null>();
function mapThumb(hash: string, grid: ReplayMapGrid): Promise<string | null> {
  let p = thumbCache.get(hash);
  if (!p) {
    p = renderMinimapCanvas(grid, 1).then((cv) => cv.toDataURL("image/png")).catch(() => null)
      .then((u) => { thumbDone.set(hash, u); return u; });
    thumbCache.set(hash, p);
  }
  return p;
}

/** 배치 칩 글 — 폭 4칸(한글·한자 등 넓은 글자 2칸 · 영문·숫자 1칸) 안에서 앞부터(2026-10-26, 요청: "2글자 정도" → "영어는 4글자"). */
function shortSpot(name: string): string {
  let out = ""; let w = 0;
  for (const ch of Array.from(name)) {
    const cw = /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 2 : 1;
    if (w + cw > 4) break;
    out += ch; w += cw;
  }
  return out;
}

/** 칩 자리 0..1 — 가장자리 12% 안은 끝(0·1)으로 붙이고 그 사이는 고르게 편다. 칩은 left/top 을 이 값만큼 · 제 폭도 이 값만큼 당겨(translate)
 *  끝 자리 칩이 그림 테두리에 거의 붙는다(2026-10-26, 요청: "배치 맵의 유저칩 가장자리에 거의 붙이기" · 옛 판은 칩 가운데를 14/7px 안쪽에 물렸다). */
const edgeSnap = (v: number) => Math.min(1, Math.max(0, (v - 0.12) / 0.76));

/** ★ 배치 칸(2026-10-26 · 위 COLS) — 맵 그림 위에 사람마다 시작 자리(서버 참가자 startX·startY · 타일)에 **닉네임 앞 두 글자** 칩
 *  (같은 날 되요청: "2글자 정도라도 · 팀 배지 없이 · 종족 없이" — 처음 낸 종족 글자 점 · 팀색 테두리는 걷었다). 칩은 모두 흰 바탕 · 검은 글(같은 날 되요청: "색도 흰색칩으로 통일" — 처음 판은 개인색 바탕이었다).
 *  시작 자리를 모르는 옛 판(재분석 전)은 맵 그림만 · 맵 격자가 없으면 "-". 가장자리 자리는 칩이 테두리에 거의 붙는다(edgeSnap).
 *  폰 게임 줄은 카드 안 이름 줄 왼쪽에 같은 그림(ListRow lead · 같은 날 요청: "모바일에도 · 카드 안에"). */
export function StartMapCell({ game, memberOf }: { game: GameResult; memberOf: (id: string) => Member | undefined }) {
  const grid = useReplayMap(game.mapHash);
  /* undefined = 굽는 중 · null = 못 구움 */
  const [url, setUrl] = useState<string | null | undefined>(() => (game.mapHash ? thumbDone.get(game.mapHash) : undefined));
  useEffect(() => {
    let dead = false;
    if (grid && game.mapHash) void mapThumb(game.mapHash, grid as ReplayMapGrid).then((u) => { if (!dead) setUrl(u); });
    return () => { dead = true; };
  }, [grid, game.mapHash]);
  /* 받는 중(격자 undefined · 그림 굽는 중)엔 **같은 크기 빈 판**을 세운다 — "-" 를 세웠다가 그림이 오면 줄 키가 자랐다
     (2026-10-26 지적: "배치맵 뜨기 전과 뜬 후 행 높이 변하는 현상"). 격자를 모르면 정사각(맵 대부분). 맵이 없다(null)고 판가름 나면 빈 칸. */
  if (grid === null || !game.mapHash || url === null) return null;   /* 맵 없음은 칸을 비운다(같은 날 요청: "없으면 - 말고 비우기") */
  if (!grid || !url) {
    return <span className="scr-gtab-startmap is-pending" style={{ aspectRatio: grid ? `${grid.width} / ${grid.height}` : "1 / 1" }} aria-hidden />;
  }
  /* 팀전이면 칩 바탕을 연한 팀색으로(2026-10-26, 요청: "팀전만 너무 튀지 않게" → 후보 A "연한 팀색 바탕 · 조금씩 진하게") — 1팀 빨강 · 2팀 파랑(원작 · scplay TEAM_COLOR).
     개인전(밀리)은 흰 칩 그대로. */
  const melee = isMeleeGame({ matchType: game.matchType, team1: game.team1, team2: game.team2 });
  const spots = [...game.team1.map((p) => ({ p, t: 1 })), ...game.team2.map((p) => ({ p, t: 2 }))]
    .filter(({ p }) => !p.observer && p.startX != null && p.startY != null)
    .map(({ p, t }) => {
      const name = memberOf(p.memberId)?.nickname ?? p.rawName ?? "";
      return { name, short: shortSpot(name), team: melee ? 0 : t,
        ex: edgeSnap((p.startX as number) / grid.width), ey: edgeSnap((p.startY as number) / grid.height) };
    });
  return (
    <span className="scr-gtab-startmap" style={{ aspectRatio: `${grid.width} / ${grid.height}` }}>
      <img src={url} alt="" draggable={false} />
      {spots.map((sp, i) => (
        <i
          key={i} className={cx("scr-gtab-spot", sp.team === 1 && "is-team1", sp.team === 2 && "is-team2")} title={sp.name || undefined}
          style={{
            left: `calc(2px + ${sp.ex} * (100% - 4px))`, top: `calc(1px + ${sp.ey} * (100% - 2px))`,
            transform: `translate(${-sp.ex * 100}%, ${-sp.ey * 100}%)`,
          }}
        >{sp.short}</i>
      ))}
    </span>
  );
}

export function GameTableHead({ selecting, leagueCol }: { selecting: boolean; leagueCol: boolean }) {
  return (
    <div className={cx("scr-feed-row-wrap scr-gtab-headwrap", selecting && "scr-feed-row-wrap-sel")}>
      {/* 체크 칸만큼 비운다(줄의 RowCheck 와 같은 폭). */}
      {selecting && <span className="scr-checkbox-field scr-selcell scr-gtab-headcheck" aria-hidden><input type="checkbox" tabIndex={-1} /></span>}
      <div className="scr-gtab scr-gtab-head">
        {COLS(leagueCol).map((c) => (
          <span key={c} className="scr-gtab-cell">
            {c}
            {/* 데이터 칸 설명(2026-10-21 요청) — 머리 글 옆 ⓘ. */}
            {c === "데이터" && <InfoTip label="데이터" text="유저별 테크트리 진행과 유닛 생산 수치(인구 · 일꾼 수 · 자원)를 그래프로 한눈에 확인!" />}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 유형 — 유즈맵 · 프리포올(난투·셋 이상 일대일) · 1:1 · 팀전. */
export function gameKindText(g: GameResult): string {
  if (g.ums) return "유즈맵";
  if (isMeleeGame({ matchType: g.matchType, team1: g.team1, team2: g.team2 })) return "프리포올";
  if (g.matchType === "0101") return "1:1";
  if (g.matchType === "0102") return "팀전";
  return "-";
}

const lengthText = (sec: number | null): string =>
  (sec == null ? "-" : `${Math.floor(sec / 60)}:${pad(Math.round(sec) % 60)}`);

/** 이 화면에서 해제를 청한 판 — 서버는 같은 판에 기다리는 요청을 하나만 두니 다시 눌러도 되지만, 단추는 '요청됨'으로 잠근다. */
const requested = new Set<number>();

/** 해제요청 단추 — PC 표의 숨김 칸과 폰 숨긴 줄(FeedRow)이 같이 쓴다. 폰 줄은 그 자체가 <button> 이라 단추를 못 넣는다 —
 *  inRow 면 span(role=button)으로 선다(2026-10-20, 요청: "모바일 숨김 경기에도 해제 요청 버튼"). */
export function UnhideRequestButton({ game, inRow }: { game: GameResult; inRow?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done">(requested.has(game.id) ? "done" : "idle");
  const ask = async () => {
    setState("busy");
    try {
      await api.requestUnhideGameResult(game.id);
      requested.add(game.id);
      setState("done");
      showToast("숨김 해제를 요청했어요. 운영자가 확인하면 풀려요.", { kind: "ok" });
    } catch (e) {
      setState("idle");
      showToast(e instanceof Error ? e.message : "요청하지 못했어요.", { kind: "warn" });
    }
  };
  const label = state === "done" ? "요청됨" : "해제요청";
  const press = (e: { stopPropagation: () => void; preventDefault?: () => void }) => {
    e.stopPropagation();
    if (state === "idle") void ask();
  };
  if (inRow) {
    return (
      <span
        role="button" tabIndex={0} aria-disabled={state !== "idle" ? true : undefined}
        className={cx("scr-pill-btn scr-gtab-unhide", state !== "idle" && "is-off")}
        onClick={press}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); press(e); } }}
      >
        {label}
      </span>
    );
  }
  return (
    <button
      type="button" className="scr-pill-btn scr-gtab-unhide"
      disabled={state !== "idle"}
      onClick={press}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {label}
    </button>
  );
}

export function GameTableRow({ game, memberOf, check, picked, disabled, onClick, onLongPress, when, leagueCol, league, onHide }: {
  game: GameResult;
  memberOf: (id: string) => Member | undefined;
  check?: ReactNode;
  picked?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onLongPress?: () => void;
  /** 시작일시 칸 — 목록의 기본 타임스탬프(formatAgo · 폰 줄 오른끝과 같은 글 · 2026-10-20 요청: "일시는 기본 타임스탬프 형식"). */
  when: string;
  /** 리그 칸("2026 팀리그" / "결승 · 1세트") — 리그 판이 아니면 "-"(같은 요청: "로스터에서 리그 정보 별도 컬럼으로"). */
  league?: { name: string; round: string } | null;
  /** 리그 칸을 세우나(리그 탭) — 머리 줄과 같은 값. */
  leagueCol: boolean;
  /** 숨기기(확인 창은 부르는 쪽) — 없으면 숨기기 단추가 없다. */
  onHide?: () => void;
}) {
  useReplayMapTick();
  const hold = useLongPress(onLongPress);
  const secret = isSecretGame(game);
  const map = secret ? "" : cleanMapName(game.mapCanonName ?? cachedReplayMap(game.mapHash)?.canonName ?? game.mapName);
  const kind = secret ? "-" : gameKindText(game);
  const user = useAppStore((st) => st.user);
  const canHide = !!onHide && !game.hidden && canManageGame(game, user);
  const [graphOpen, setGraphOpen] = useState(false);
  const rec = useRecommend(game);
  const share = async () => {
    const out = await shareToKakao(gameResultShareContent(game, memberOf));
    if (out === "shared" || out === "copied") void api.pingGameAction("share", game);
    if (out === "copied") showToast("링크를 복사했어요.", { kind: "ok" });
  };
  /** 링크 칸 단추 — 줄 열기로 번지지 않게 막는다. */
  const linkBtn = (key: string, title: string, run: () => void, icon: ReactNode) => (
    <button
      key={key} type="button" className="scr-icon-btn scr-gtab-link" title={title} aria-label={title}
      onClick={(e) => { e.stopPropagation(); run(); }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {icon}
    </button>
  );
  const open = () => { if (!disabled) onClick(); };
  return (
    <div className={cx("scr-feed-row-wrap", !!check && "scr-feed-row-wrap-sel", picked && "is-picked")}>
      {check}
      <div
        role="button" tabIndex={disabled ? -1 : 0}
        {...hold}
        className={cx("scr-gtab scr-gtab-row", secret && "is-secret", disabled && "is-off", picked && "is-picked")}
        aria-disabled={disabled ? true : undefined}
        onClick={open}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault(); open();
        }}
      >
        <span className="scr-gtab-cell scr-gtab-num">{when}</span>
        {leagueCol && league ? (
          <span className="scr-gtab-cell scr-gtab-league" title={`${league.name} · ${league.round} (${kind})`}>
            <span>{league.name}</span><span>{league.round} ({kind})</span>
          </span>
        ) : <span className="scr-gtab-cell">{kind}</span>}
        <span className="scr-gtab-cell scr-gtab-map" title={map || undefined}><span>{map || "-"}</span></span>
        {/* 재생 가능 표시는 게임길이 아래(2026-10-20, 요청: "링크 컬럼의 재생버튼은 제거 · 재생여부 표시는 게임길이 컬럼에 시간 아래줄로 · 시간은 세로 가운데 유지 ·
            버튼 유무에 따라 흔들림 X") — 시간은 칸 가운데 그대로, 표시는 그 아래에 띄워(absolute) 줄 높이를 안 바꾼다. */}
        <span className="scr-gtab-cell scr-gtab-num scr-gtab-len">
          <span className="scr-gtab-len-t">
            {lengthText(game.durationSeconds)}
          </span>
        </span>
        <span className="scr-gtab-cell scr-gtab-roster">
          <GameRowNames game={game} memberOf={memberOf} mobile playable={false} />
          {game.hidden && <UnhideRequestButton game={game} />}
        </span>
        <span className="scr-gtab-cell scr-gtab-start">{secret ? <span className="scr-gtab-dim">-</span> : <StartMapCell game={game} memberOf={memberOf} />}</span>
        {/* 그래프 보기 — 참가자 전원의 분당 인구 · 일꾼 수 · 자원 · 건설(GameCurvesModal). 유즈맵은 참값을 굽지 않아 없다. */}
        <span className="scr-gtab-cell">
          {!secret && !game.ums ? linkBtn("graph", "데이터 그래프", () => { setGraphOpen(true); void api.pingGameAction("graph", game); }, <ChartLine size={13} />)
            : <span className="scr-gtab-dim">-</span>}
        </span>
        <span className="scr-gtab-cell scr-gtab-links">
          {!secret && game.replay && linkBtn("save", "리플레이 저장", () => { void downloadReplay(game); void api.pingGameAction("replay", game); }, <Save size={13} />)}
          {!secret && linkBtn("share", "공유", () => { void share(); }, <Share2 size={13} />)}
          {canHide && linkBtn("hide", "숨기기", () => onHide?.(), <EyeOff size={13} />)}
          {secret && <span className="scr-gtab-dim">-</span>}
        </span>
        {/* 추천 단추는 도구 칸이 아니라 추천 칸에 수와 함께(2026-10-22, 요청: "추천 아이콘은 도구에서 추천 컬럼으로 이동") — 단추가 안 서는 판(명예의 전당 · 손님)은 수만. */}
        <span className="scr-gtab-cell scr-gtab-num">{secret ? "-" : rec.shown ? <RecommendButton rec={rec} count className="scr-gtab-rec" /> : rec.n}</span>
      </div>
      {graphOpen && <GameCurvesModal game={game} onClose={() => setGraphOpen(false)} />}
    </div>
  );
}
