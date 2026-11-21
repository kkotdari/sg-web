import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, MessageCircle, Pause, Play, Share2, ThumbsUp, Trash2, X } from "lucide-react";
import { ReplayModule, useReplayMap, type MotionBase, type ShortClip9 } from "scplay";
import { api, type GameShort } from "../../../api/client";
import Avatar from "../../../components/common/Avatar";
import { showToast } from "../../../components/common/Toast";
import { useAppStore } from "../../../store/appStore";
import { formatAgo, serverMs } from "../../../utils/date";
import Comments from "../../feed/Comments";
import { renderTags } from "../../../components/common/InlineTags";
import { shareThumb, shareToKakao, type KakaoShareContent } from "../../../utils/kakaoShare";
import { gamePath, navigateTo } from "../../../utils/route";
import { cx } from "../../../utils/format";
import { isMeleeGame, resolveSlotName } from "../GameResultSides";
import { SHORTS_CHANGED } from "./shortsBus";
import { gameOf, prefetchShort, shortOf, tracksOf } from "./shortsPrefetch";
import { useIsMobile } from "../../../hooks/useIsMobile";
import type { GameResult, ItemComment } from "../../../types";

/* ★ 쇼츠 보기(2026-11-19, 요청: "가운데 큰 재생버튼으로 보기누르면 확대되어 보이기(인스타 스토리처럼) · 끝나면 다음 쇼츠로 · 좌우 탭 이전/다음 · 아래로 쓸면 닫기 ·
   로딩이 오래걸리면 안되서 해당 장면에서 필요한 모델만 로딩") — 화면 위 판(body 포털) · 위에 진행 막대(쇼츠마다 한 칸) · 머리(만든 사람 · 언제 · 게임 보기 · 지우기 · 닫기) ·
   가운데 정사각 무대(재생기 쇼츠 재생 모드 — scplay `short` prop: 장면 + 미니맵만 · 녹화된 카메라 · 자막 연출 · 그 구간 모델만 데움).
   누름: 왼쪽 3할 = 이전 · 나머지 = 다음 · 누르고 있으면 멈춤 · 아래로 쓸면 닫기 · 키 ← → 넘기기 · 스페이스 멈춤 · Esc 닫기.
   재생기는 쇼츠마다 새로 선다(key) — 받는 동안은 표지를 깔고 그 위에 로딩. 못 받으면 3초 뒤 다음으로. */

const TAP_MS = 260;

/* ★ 쇼츠 로딩 줄(2026-11-20, 지적: "로딩이 너무 걸림 · 단축 방안 찾아보자") — 쇼츠마다 단계별로 걸린 때를 재어 다 뜨면 콘솔에 한 줄(`[쇼츠 로딩]`) · window.__shortLoad9(최근 10개).
   재생기 몫은 로딩 진행도(scplay onLoadProgress · 단계마다 몫이 정해져 있다)가 처음 그 몫에 든 때로 가른다 · 아틀라스 · 다지기 값은 재생기 진단(window.__scrDiag).
   주소에 `sdiag=1` 이 있으면 판 아래에도 8초 띄운다(폰 · 콘솔 없는 데서). */
const stageOfProg = (p: number): string => (p >= 1 ? "끝" : p >= 0.97 ? "화면" : p >= 0.92 ? "굽기" : p >= 0.5 ? "모델" : p >= 0.15 ? "그래픽" : "데이터");
type ShortLoad9 = { id: number; t0: number; got?: number; grid?: number; tracks?: number; mount?: number; st: [string, number][] };
const sec = (ms: number): string => (ms / 1000).toFixed(1);
function shortLoadLine(L: ShortLoad9, end: number): string {
  const d = (window as unknown as { __scrDiag?: Record<string, unknown> }).__scrDiag ?? {};
  const st = L.st.map(([k, t], i) => `${k} ${sec((L.st[i + 1]?.[1] ?? end) - t)}`).join(" → ");
  const mount = L.mount ?? end;
  return `#${L.id} ${sec(end - L.t0)}초 — 받기 ${sec(mount - L.t0)}(토막·경기 ${L.got ? sec(L.got - L.t0) : "-"} · 지도 ${L.grid ? sec(L.grid - L.t0) : "-"} · 참값 ${L.tracks ? sec(L.tracks - L.t0) : "-"})`
    + ` · 재생기 ${sec(end - mount)} = ${st || "-"} | 아틀라스 앞 ${String(d.atlasCore ?? "-")} · 다지기 ${String(d.shortSettle ?? "-")}`;
}

/** ★ 쇼츠 공유 주소(2026-11-20, 요청: "쇼츠 공유 기능 추가 · 공유한 주소 클릭 시 게임 화면에 해당 쇼츠가 목록에서 가운데로 슬라이드 앤 포커싱 및 자동 재생") —
 *  /games?short=<id> · 게임 화면 쇼츠 줄(ShortsStrip SHORT_PARAM ★)이 읽는다. */
export const SHORT_PARAM = "short";
export const shortLink = (id: number): string => `${window.location.origin}/games?${SHORT_PARAM}=${id}`;
export function shortShareContent(it: GameShort): KakaoShareContent {
  const head = it.title || it.caption;   // 제목이 먼저 · 없으면 첫 자막
  const title = head ? `쇼츠 · ${head}` : `${it.author.nickname}의 쇼츠`;
  const desc = `${it.author.nickname} · ${Math.round(it.dur)}초`;
  /* 표지(정사각 · 서버 파일)가 바깥에서 읽히는 주소면 그걸 · 아니면 게임 공유 그림. */
  const cover = it.coverUrl && /^https?:/.test(it.coverUrl) ? { imageUrl: it.coverUrl } : shareThumb("gameResult");
  return { title, description: desc, ...cover, link: shortLink(it.id), fallbackText: `[스타게이트 쇼츠]\n${title}\n${desc}` };
}

/* 무대는 memo — 진행 막대(부모 prog)가 0.1초마다 바뀌어도 재생기까지 다시 그리지 않는다(props 가 다 굳은 값이다). */
const ShortStage = memo(function ShortStage({ item, w, h, paused, onProgress, onEnd }: {
  item: GameShort;
  w: number;
  h: number;
  paused: boolean;
  onProgress: (p: number) => void;
  onEnd: () => void;
}) {
  const memberOf = useAppStore((s) => s.memberOf);
  const [got, setGot] = useState<{ clip: ShortClip9; game: GameResult } | null>(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const loadRef = useRef<ShortLoad9>({ id: item.id, t0: performance.now(), st: [] });   // 로딩 줄(위 ★)
  const [diagLine, setDiagLine] = useState("");
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        void tracksOf(item.gameResultId).then(() => { loadRef.current.tracks ??= performance.now(); }, () => undefined);   // 참값(가장 크다)은 먼저 출발 — 재생기가 받을 때 같은 약속을 쓴다
        const [one, game] = await Promise.all([shortOf(item), gameOf(item.gameResultId)]);
        if (!one.clip) throw new Error("토막 없음");
        loadRef.current.got = performance.now();
        if (!dead) setGot({ clip: one.clip, game });
      } catch {
        if (!dead) setErr("이 쇼츠를 불러오지 못했어요");
      }
    })();
    return () => { dead = true; };
  }, [item]);
  const grid = useReplayMap(got?.game.mapHash ?? null);
  if (grid && !loadRef.current.grid) loadRef.current.grid = performance.now();
  if (got && grid && !loadRef.current.mount) loadRef.current.mount = performance.now();
  const onLoadProg = useCallback((p: number) => {
    const L = loadRef.current; const k = stageOfProg(p);
    if (k !== "끝" && L.st[L.st.length - 1]?.[0] !== k) L.st.push([k, performance.now()]);
  }, []);
  const onPlayerReady = useCallback(() => {
    setReady(true);
    const line = shortLoadLine(loadRef.current, performance.now());
    console.info(`[쇼츠 로딩] ${line}`);
    const w = window as unknown as { __shortLoad9?: string[] };
    (w.__shortLoad9 ??= []).push(line); if (w.__shortLoad9.length > 10) w.__shortLoad9.shift();
    if (/[?&#]sdiag=1/.test(window.location.href)) setDiagLine(line);
  }, []);
  useEffect(() => {
    if (!diagLine) return undefined;
    const t9 = window.setTimeout(() => setDiagLine(""), 8000);
    return () => window.clearTimeout(t9);
  }, [diagLine]);
  useEffect(() => {
    if (!err && grid !== null) return undefined;
    if (!got && !err) return undefined;
    const t9 = window.setTimeout(onEnd, 3000);   // 못 여는 쇼츠는 잠깐 알리고 넘긴다
    return () => window.clearTimeout(t9);
  }, [err, grid, got, onEnd]);
  /* 끝내 안 서는 판(참값 없음 · 재생할 수 없는 게임 — 재생기가 onReady 를 안 부른다)은 25초 뒤 알리고 넘긴다. */
  useEffect(() => {
    if (ready || err) return undefined;
    const t9 = window.setTimeout(() => setErr("이 쇼츠를 재생할 수 없어요"), 25000);
    return () => window.clearTimeout(t9);
  }, [ready, err]);
  const game = got?.game ?? null;
  const bases: MotionBase[] = useMemo(() => {
    if (!game) return [];
    const all = [...game.team1, ...game.team2];
    const out: MotionBase[] = [];
    const add = (list: typeof game.team1, team: 1 | 2): void => {
      for (const slot of list) {
        if (!slot.rawName) continue;
        out.push({
          key: slot.rawName, name: resolveSlotName(slot, all, memberOf), memberId: slot.memberId,
          avatar: memberOf(slot.memberId)?.avatar ?? null, race: slot.race, team, withName: true, highlight: false, apm: slot.apm,
        });
      }
    };
    add(game.team1, 1);
    add(game.team2, 2);
    return out;
  }, [game, memberOf]);
  const teamOfRaw = useCallback((raw: string): 1 | 2 | undefined => bases.find((b) => b.key === raw)?.team as 1 | 2 | undefined, [bases]);
  const loadUnitTracks = useCallback(
    () => (game ? tracksOf(game.id).catch(() => ({ motion: null })) : Promise.resolve({ motion: null })),
    [game],
  );
  return (
    <div className="scr-shortv-stage" style={{ width: w, height: h }}>
      {!ready && item.coverUrl && <img className="scr-shortv-cover" src={item.coverUrl} alt="" draggable={false} />}
      {/* 로딩 = 로고 별이 뛰논다(2026-11-20, 요청: "쇼츠 로딩 마크를 우리 로고의 별마크 회전으로 · 재밌게 회전 및 이동") — 옛: 글자 마크(LoadingMark). */}
      {!ready && !err && (
        <div className="scr-shortv-wait" role="status" aria-label="불러오는 중">
          <span className="scr-shortv-star" aria-hidden><img src="/images/logo/symbol.png" alt="" draggable={false} /></span>
        </div>
      )}
      {err && <div className="scr-shortv-err">{err}</div>}
      {diagLine && <div className="scr-shortv-diag">{diagLine}</div>}
      {got && grid && (
        <div className={cx("scr-shortv-player", ready && "is-ready")}>
          <ReplayModule
            grid={grid} endSec={got.game.durationSeconds ?? null}
            bases={bases} teamOfRaw={teamOfRaw} active
            clockKey={`short-${item.id}`}
            melee={isMeleeGame({ matchType: got.game.matchType, team1: got.game.team1, team2: got.game.team2 })}
            loadUnitTracks={loadUnitTracks}
            short={got.clip} shortPaused={paused} onShortProgress={onProgress} onShortEnd={onEnd}
            veil onReady={onPlayerReady} onLoadProgress={onLoadProg}
            frameW={w} frameH={h}
            guide={false}
          />
        </div>
      )}
    </div>
  );
});

/* ★ 쇼츠 댓글 미리보기(2026-11-21, 요청: "쇼츠 댓글 기능 · 기본적으로 게임 댓글과 유사하게 · 아래 남는 공간에 넣어주기 · 최신 거가 위에 3개까지 보이게 · 아래 더 있다는
   느낌은 주기 · 남는 공간 없으면 어떡할지") — 공용 댓글(sg-api target "short")을 받아 **새것부터** 세 개 · 넘치면(넷째부터 · 칸이 모자라 잘리면) 아래로 흐려지는 그늘과
   "댓글 N개 모두 보기". 누르면 전체 댓글(폰 시트 · PC 옆 판 — 게임 댓글과 같은 Comments 부품 · 태그 · 첨부 · 지우기 그대로). 자리는 보기 화면이 잰다(아래 room ★) —
   남는 칸이 없으면 미리보기는 안 서고 옆 단추 줄의 [댓글 N]이 전체 댓글을 연다. */
const CMT_PREVIEW_N = 3;
function ShortCmtPreview({ id, ver, onOpen, onCount }: { id: number; ver: number; onOpen: () => void; onCount: (n: number) => void }) {
  const [notes, setNotes] = useState<ItemComment[] | null>(null);
  const onCountRef = useRef(onCount); onCountRef.current = onCount;
  useEffect(() => {
    let dead = false;
    api.listComments("short", id)
      .then((n) => { if (!dead) { setNotes(n); onCountRef.current(n.length); } })
      .catch(() => { if (!dead) setNotes([]); });
    return () => { dead = true; };
  }, [id, ver]);
  const list = notes ? [...notes].sort((a, b) => serverMs(b.createdAt) - serverMs(a.createdAt)) : [];
  const n = list.length;
  return (
    <div className={cx("scr-shortv-cmts", n > CMT_PREVIEW_N && "is-more")} role="button" tabIndex={0} aria-label={n ? `댓글 ${n}개 보기` : "댓글 쓰기"}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onOpen(); } }}>
      <div className="scr-shortv-cmts-head">
        <b>댓글{n ? ` ${n}` : ""}</b>
        <span>{notes === null ? "" : n ? (n > CMT_PREVIEW_N ? `${n}개 모두 보기` : "댓글 쓰기") : "첫 댓글을 남겨 보세요"}</span>
      </div>
      {n > 0 && (
        <ul className="scr-shortv-cmts-list">
          {list.slice(0, CMT_PREVIEW_N + 1).map((c) => (
            <li key={c.id}>
              <Avatar member={{ id: c.author.memberId, nickname: c.author.nickname, avatar: c.author.avatar }} size={22} />
              <p>
                <b>{c.author.nickname}</b>
                <span className="scr-shortv-cmts-text">{renderTags(c.text, c.mentions.map((m) => m.nickname))}{c.attachments?.length ? " 📎" : ""}</span>
                <small>{formatAgo(c.createdAt)}</small>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ShortsViewer({ items, start, from, onClose, onDeleted, onNeedMore, onPatch }: {
  items: GameShort[];
  start: number;
  /** 누른 카드의 자리 — 그 자리에서 펼쳐진다(인스타 스토리처럼). */
  from: DOMRect | null;
  onClose: () => void;
  onDeleted: (id: number) => void;
  onNeedMore?: () => void;
  /** 추천을 바꿨다 — 목록의 그 카드도 고친다. */
  onPatch?: (id: number, patch: Partial<GameShort>) => void;
}) {
  const memberOf = useAppStore((s) => s.memberOf);
  const [idx, setIdx] = useState(Math.min(start, Math.max(0, items.length - 1)));
  const [prog, setProg] = useState(0);
  const [hold, setHold] = useState(false);
  const [stop, setStop] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [vw, setVw] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const it = items[idx] ?? null;
  /** 전체 댓글이 열렸나(위 ShortCmtPreview ★) — 연 동안 쇼츠는 멈춘다 · 미리보기는 ver 로 다시 받는다(달기 · 지우기 뒤). */
  const [cmtOpen, setCmtOpen] = useState(false);
  const [cmtVer, setCmtVer] = useState(0);
  const cmtOpenRef = useRef(false); cmtOpenRef.current = cmtOpen;
  /** 전체 댓글을 시트로 여나(Comments 의 폰 갈래와 같은 자 — 아니면 옆 판). */
  const cmtSheet = useIsMobile();
  useEffect(() => { setCmtOpen(false); }, [it?.id]);
  /* 댓글 시트 · 지우기 확인 창은 body 포털(z 90~150)이라 보기 화면(z 3000) 밑에 깔린다 — 연 동안 body 표식으로 올린다(global.css .scr-shortv-open). */
  useEffect(() => {
    document.body.classList.add("scr-shortv-open");
    return () => document.body.classList.remove("scr-shortv-open");
  }, []);
  useEffect(() => {
    const on = (): void => setVw({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  /* 뒤 페이지는 안 굴러가게 · 닫으면 되돌린다. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => { setProg(0); setStop(false); if (idx >= items.length - 3) onNeedMore?.(); }, [idx, items.length, onNeedMore]);
  /* 쇼츠 접속 기록(2026-11-19, 요청: "쇼츠도 억세스 로그") — 보기(넘어갈 때마다) · 추천 · 지우기 · 만들기(GameResultStory). 기록이 안 돼도 보기는 그대로. */
  const viewId = it?.id ?? 0;
  useEffect(() => {
    if (!it) return;
    api.pingAccess("short_view", `short#${it.id} game#${it.matchNo || it.gameResultId}`).catch(() => undefined);
    api.viewShort(it.id).catch(() => undefined);   // 본 횟수 +1(DB 에만 · 2026-11-19 "쇼츠 뷰카운트 · 디비에만")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId]);
  /* 다음 쇼츠를 미리 받는다(shortsPrefetch ★) — 토막 · 경기 · 참값 · 지도. 지도는 해시를 안 뒤에 useReplayMap 캐시로 당긴다. */
  const nextItem = items[idx + 1] ?? null;
  const [nextHash, setNextHash] = useState<string | null>(null);
  useEffect(() => {
    if (!nextItem) return undefined;
    let dead = false;
    const t9 = window.setTimeout(() => {   // 지금 쇼츠의 첫 받기와 안 다투게 조금 뒤에
      prefetchShort(nextItem);
      gameOf(nextItem.gameResultId).then((g) => { if (!dead) setNextHash(g.mapHash ?? null); }).catch(() => undefined);
    }, 1200);
    return () => { dead = true; window.clearTimeout(t9); };
  }, [nextItem]);
  useReplayMap(nextHash);
  const next = useCallback((): void => {
    setIdx((i) => {
      if (i + 1 < items.length) return i + 1;
      window.setTimeout(onClose, 0);
      return i;
    });
  }, [items.length, onClose]);
  const prev = useCallback((): void => { setIdx((i) => Math.max(0, i - 1)); }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent): void => {
      /* 댓글 칸에 쓰는 중 · 전체 댓글이 열린 동안은 보기 화면 단축키를 안 먹는다(스페이스 · 화살표가 글자 · 커서로 가야) — Esc 는 댓글 창부터 닫는다. */
      const t9 = e.target as HTMLElement | null;
      const typing9 = !!t9 && (t9.tagName === "INPUT" || t9.tagName === "TEXTAREA" || t9.isContentEditable);
      if (cmtOpenRef.current || typing9) {
        if (e.key === "Escape" && cmtOpenRef.current && !typing9 && !document.querySelector(".scr-comment-confirm-over-modal")) { e.preventDefault(); setCmtOpen(false); }
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === " ") { e.preventDefault(); setStop((v) => !v); }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [next, prev, onClose]);
  /* 누름 — 짧게 떼면 탭(좌 3할 이전 · 나머지 다음) · 오래 누르면 멈춤(떼면 다시) · 아래로 끌면 판이 따라 내려가고 90px 넘게 놓으면 닫힘. */
  const press = useRef<{ x: number; y: number; t: number; id: number; holdTm: number } | null>(null);
  const onDown = (e: RPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const holdTm = window.setTimeout(() => setHold(true), TAP_MS);
    press.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, holdTm };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>): void => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const dy = e.clientY - p.y;
    if (Math.abs(dy) > 8 || Math.abs(e.clientX - p.x) > 8) window.clearTimeout(p.holdTm);
    if (dy > 0) setDragY(dy);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>): void => {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== e.pointerId) return;
    window.clearTimeout(p.holdTm);
    const dy = e.clientY - p.y;
    const dx = e.clientX - p.x;
    const held = performance.now() - p.t >= TAP_MS;
    setHold(false);
    setDragY(0);
    if (dy > 90) { onClose(); return; }
    if (held || Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - r.left < r.width * 0.3) prev(); else next();
  };
  const del = async (): Promise<void> => {
    if (!it || !window.confirm("이 쇼츠를 지울까요?")) return;
    try {
      await api.deleteShort(it.id);
      api.pingAccess("short_del", `short#${it.id}`).catch(() => undefined);
    } catch {
      showToast("지우지 못했어요", { kind: "warn" });
      return;
    }
    onDeleted(it.id);
    window.dispatchEvent(new CustomEvent(SHORTS_CHANGED));
    if (items.length <= 1) onClose();
    else if (idx >= items.length - 1) setIdx(idx - 1);
  };
  /* ★ 쇼츠 추천(2026-11-19, 요청: "쇼츠에도 추천버튼 넣고 3개 이상시 명예의 전당에 들어감") — 누르면 곧장 바꿔 그리고(되면 서버 값 · 안 되면 되돌림) 목록 카드도 고친다. */
  const [recBusy, setRecBusy] = useState(false);
  const recToggle = (): void => {
    if (!it || recBusy) return;
    const before = { recommendCount: it.recommendCount, recommended: it.recommended, fame: it.fame };
    const n = Math.max(0, it.recommendCount + (it.recommended ? -1 : 1));
    onPatch?.(it.id, { recommendCount: n, recommended: !it.recommended, fame: n >= 3 });
    setRecBusy(true);
    const id = it.id;
    api.pingAccess("short_rec", `${before.recommended ? "-" : ""}short#${id}`).catch(() => undefined);
    api.recommendShort(id, !before.recommended)
      .then((r) => {
        onPatch?.(id, { recommendCount: r.recommendCount, recommended: r.recommended, fame: r.recommendCount >= 3 });
        if (r.recommendCount >= 3 && before.recommendCount < 3) { showToast("명예의 전당에 들어갔어요"); window.dispatchEvent(new CustomEvent(SHORTS_CHANGED)); }
        else if (r.recommendCount < 3 && before.recommendCount >= 3) window.dispatchEvent(new CustomEvent(SHORTS_CHANGED));
      })
      .catch((e) => { onPatch?.(id, before); showToast(e instanceof Error ? e.message : "추천하지 못했어요", { kind: "warn" }); })
      .finally(() => setRecBusy(false));
  };
  const share = async (): Promise<void> => {
    if (!it) return;
    const out = await shareToKakao(shortShareContent(it));
    if (out === "copied") showToast("링크를 복사했어요.", { kind: "ok" });
    else if (out === "failed") showToast("공유하지 못했어요.", { kind: "warn" });
    if (out !== "failed") api.pingAccess("short_share", `short#${it.id}`).catch(() => undefined);
  };
  const goGame = (): void => {
    if (!it) return;
    onClose();
    navigateTo(gamePath(it.matchNo || String(it.gameResultId)), { search: `t=${Math.floor(it.t0)}` });
  };
  /* ★ 판은 **정사각**(2026-11-20, 요청: "쇼츠 무조건 정사각형으로 나오기로 했는데 피시랑 폰 모두 수정") — 녹화도 정사각 틀이다(scplay recSq9). PC 는 창 가운데 큰 정사각에 머리 · 단추를 얹고,
     폰은 폭을 다 쓰는 정사각에 머리를 위 · 단추 줄을 아래 바깥에(장면을 안 가리게 · global.css .is-phone). 옛(2026-11-19): 폰 9:16 화면 꽉 · PC 4:3. */
  const phone = vw.w < 700 || (typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);
  const box = ((): { w: number; h: number } => {
    const s0 = phone ? Math.min(vw.w, vw.h - 170) : Math.min(vw.h - 48, 760, vw.w - 48);
    const s1 = Math.max(200, Math.floor(s0));
    return { w: s1, h: s1 };
  })();
  const origin = from ? `${from.left + from.width / 2}px ${from.top + from.height / 2}px` : "50% 50%";
  /* ★ 댓글 자리(위 ShortCmtPreview ★) — 판(.scr-shortv-box)을 그린 뒤 재어 고른다. 폰: 단추 줄 아래 남는 세로(110px 넘으면) · PC: 판 오른쪽 남는 폭(300px 넘으면 옆 칸) →
     아니면 판 아래 남는 세로(130px 넘으면) → 아니면 없음(단추 줄의 [댓글]만). 폰은 판을 위로 올려(머리 몫만 남기고) 아래 칸을 키운다(.is-phone.has-cmts). */
  const boxRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ mode: "below" | "right" | "none"; w: number; h: number }>({ mode: "none", w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current; if (!el) return;
    /* offset 값(변환 전 자리 — 열림 애니메이션 scale · 끌어 닫기 변환에 안 흔들린다) · 부모 .scr-shortv 는 화면 꽉(fixed inset 0). */
    const r = { right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight, width: el.offsetWidth, height: el.offsetHeight };
    const H = window.innerHeight; const W = window.innerWidth;
    let next: typeof room = { mode: "none", w: 0, h: 0 };
    if (phone) {
      const below = H - r.bottom - 92 - 10;
      if (below >= 110) next = { mode: "below", w: r.width, h: Math.floor(below) };
    } else {
      /* 옆 칸은 재지 않고 셈한다 — 판 + 20 + 칸 묶음을 가운데로 세우면(판을 왼쪽으로 민다 · marginRight) 잰 값이 바뀌어 오갈 수 있다. 화면 양 끝 24px 씩 비운다. */
      const side = W - box.w - 48 - 20;
      const below = (H - box.h) / 2 - 14 - 16;
      if (side >= 300) next = { mode: "right", w: Math.floor(Math.min(420, side)), h: box.h };
      else if (below >= 130) next = { mode: "below", w: r.width, h: Math.floor(below) };
    }
    if (next.mode !== room.mode || Math.abs(next.w - room.w) > 1 || Math.abs(next.h - room.h) > 1) setRoom(next);
  });   // eslint-disable-line react-hooks/exhaustive-deps
  const patchCount = (n: number): void => { if (it && (it.commentCount ?? 0) !== n) onPatch?.(it.id, { commentCount: n }); };
  if (!it) return null;
  const many = items.length > 24;
  const node = (
    <div className={cx("scr-shortv", phone && "is-phone", box.h >= vw.h - 2 && "is-tall", phone && box.h + 300 < vw.h && "has-cmts")} role="dialog" aria-modal="true" aria-label="쇼츠" style={{ transformOrigin: origin }}>
      {/* 감싸개(2026-11-21 · 댓글 칸 자리) — 판(.scr-shortv-box)은 PC 에서 overflow hidden 이라 옆 · 아래 댓글 칸을 그 밖(이 감싸개)에 둔다 · 끌어 닫기 변환도 여기서. */}
      <div className="scr-shortv-wrap" ref={boxRef} style={{
        width: box.w, height: box.h, ...(room.mode === "right" ? { marginRight: room.w + 20 } : {}),
        ...(dragY ? { transform: `translateY(${dragY}px) scale(${Math.max(0.85, 1 - dragY / 1400)})`, opacity: Math.max(0.4, 1 - dragY / 500) } : {}),
      }}>
      <div className="scr-shortv-box" style={{ width: box.w, height: box.h }}>
        <ShortStage key={it.id} item={it} w={box.w} h={box.h} paused={hold || stop || cmtOpen} onProgress={setProg} onEnd={next} />
        <div className="scr-shortv-tap" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={(e) => e.preventDefault()} />
        {(hold || stop) && <span className="scr-shortv-paused" aria-hidden><Pause size={30} fill="currentColor" /></span>}
        {/* 판 위 머리 — 진행 막대 · 만든 사람 · 멈춤 · 닫기(릴스 · 스토리처럼 장면 위에 얹는다 · 위 그늘). */}
        <div className="scr-shortv-top">
          <div className="scr-shortv-bars">
            {many ? (
              <i><b style={{ width: `${prog * 100}%` }} /></i>
            ) : items.map((x, i) => (
              <i key={x.id}><b style={{ width: i < idx ? "100%" : i === idx ? `${prog * 100}%` : "0%" }} /></i>
            ))}
          </div>
          <div className="scr-shortv-head">
            <Avatar member={{ id: it.author.memberId, nickname: it.author.nickname, avatar: memberOf(it.author.memberId)?.avatar ?? it.author.avatar ?? null }} size={28} />
            {/* 제목(2026-11-20)이 있으면 굵은 줄이 제목 · 아랫줄에 지은이 — 없으면 옛 꼴(지은이 · 때) */}
            <span className="scr-shortv-who">
              <b>{it.title || it.author.nickname}</b>
              <small>{it.title ? `${it.author.nickname} · ` : ""}{formatAgo(it.createdAt)}{many ? ` · ${idx + 1}/${items.length}` : ""}</small>
            </span>
            {it.fame && <span className="scr-shortv-fame">명예의 전당</span>}
            <button type="button" className="scr-shortv-btn" onClick={() => setStop((v) => !v)} aria-label={stop ? "재생" : "멈춤"} title={stop ? "재생 (스페이스)" : "멈춤 (스페이스)"}>
              {stop ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
            </button>
            <button type="button" className="scr-shortv-btn" onClick={onClose} aria-label="닫기" title="닫기 (Esc)">
              <X size={20} aria-hidden />
            </button>
          </div>
        </div>
        {/* 오른쪽 아래 단추 줄(릴스처럼 세로) — 추천(수) · 이 장면부터 게임 보기 · 내 쇼츠 지우기. 미니맵은 왼아래 · 자막은 가운데 아래라 안 겹친다. */}
        <div className="scr-shortv-side">
          <button type="button" className={cx("scr-shortv-act", it.recommended && "is-on")} onClick={recToggle} disabled={recBusy}
            aria-pressed={it.recommended} aria-label={it.recommended ? "추천 취소" : "추천"} title={it.recommended ? "추천 취소" : "추천 — 3개가 모이면 명예의 전당"}>
            <i className="scr-shortv-ico" aria-hidden><ThumbsUp size={22} fill={it.recommended ? "currentColor" : "none"} /></i>
            <span>{it.recommendCount}</span>
          </button>
          <button type="button" className={cx("scr-shortv-act", cmtOpen && "is-on")} onClick={() => setCmtOpen((v) => !v)} aria-label="댓글" title="댓글">
            <i className="scr-shortv-ico" aria-hidden><MessageCircle size={22} /></i>
            <span>{it.commentCount ? it.commentCount : "댓글"}</span>
          </button>
          <button type="button" className="scr-shortv-act" onClick={goGame} aria-label="이 장면부터 게임 보기" title="이 장면부터 게임 보기">
            <i className="scr-shortv-ico" aria-hidden><ExternalLink size={22} /></i>
            <span>게임</span>
          </button>
          <button type="button" className="scr-shortv-act" onClick={() => { void share(); }} aria-label="쇼츠 공유" title="공유 — 링크를 누르면 게임 화면에서 이 쇼츠가 바로 재생돼요">
            <i className="scr-shortv-ico" aria-hidden><Share2 size={22} /></i>
            <span>공유</span>
          </button>
          {it.mine && (
            <button type="button" className="scr-shortv-act" onClick={() => { void del(); }} aria-label="쇼츠 지우기" title="지우기">
              <i className="scr-shortv-ico" aria-hidden><Trash2 size={22} /></i>
              <span>지우기</span>
            </button>
          )}
        </div>
      </div>
        {/* 댓글 미리보기(남는 칸이 있을 때 · 위 room ★) — PC 옆 칸은 전체 댓글이 열리면 그 자리에 선다. */}
        {room.mode !== "none" && !(cmtOpen && (cmtSheet || room.mode === "right")) && (
          <div className={cx("scr-shortv-cmtroom", `is-${room.mode}`)} style={room.mode === "right" ? { width: room.w, maxHeight: room.h } : { maxHeight: room.h }}>
            <ShortCmtPreview id={it.id} ver={cmtVer} onOpen={() => setCmtOpen(true)} onCount={patchCount} />
          </div>
        )}
        {/* 전체 댓글 — PC: 옆 칸(자리가 있으면 그 자리 · 없으면 화면 오른쪽에 떠서) · 폰은 아래 시트(Comments sheetOnly). */}
        {cmtOpen && !cmtSheet && room.mode === "right" && (
          <div className="scr-shortv-cmtpanel is-right"
            style={{ width: room.w, height: room.h }}
            onPointerDown={(e) => e.stopPropagation()}>
            <div className="scr-shortv-cmtpanel-head">
              <b>댓글{it.commentCount ? ` ${it.commentCount}` : ""}</b>
              <button type="button" className="scr-shortv-btn" onClick={() => setCmtOpen(false)} aria-label="댓글 닫기" title="닫기 (Esc)"><X size={18} aria-hidden /></button>
            </div>
            <div className="scr-shortv-cmtpanel-body scr-scroll">
              <Comments key={it.id} targetType="short" targetId={it.id} fresh overModal onCount={(n) => { patchCount(n); setCmtVer((v) => v + 1); }} />
            </div>
          </div>
        )}
      </div>
      {/* 옆 칸이 없는 PC — 화면 오른쪽에 떠서 */}
      {cmtOpen && !cmtSheet && room.mode !== "right" && (
        <div className="scr-shortv-cmtpanel is-float" onPointerDown={(e) => e.stopPropagation()}>
          <div className="scr-shortv-cmtpanel-head">
            <b>댓글{it.commentCount ? ` ${it.commentCount}` : ""}</b>
            <button type="button" className="scr-shortv-btn" onClick={() => setCmtOpen(false)} aria-label="댓글 닫기" title="닫기 (Esc)"><X size={18} aria-hidden /></button>
          </div>
          <div className="scr-shortv-cmtpanel-body scr-scroll">
            <Comments key={it.id} targetType="short" targetId={it.id} fresh overModal onCount={(n) => { patchCount(n); setCmtVer((v) => v + 1); }} />
          </div>
        </div>
      )}
      {cmtOpen && cmtSheet && (
        <Comments key={it.id} targetType="short" targetId={it.id} fresh overModal sheetOnly
          onSheetClose={() => setCmtOpen(false)} onCount={(n) => { patchCount(n); setCmtVer((v) => v + 1); }} />
      )}
    </div>
  );
  return createPortal(node, document.body);
}
