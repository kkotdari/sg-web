import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Gamepad2 } from "lucide-react";
import Avatar from "./Avatar";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { cx } from "../../utils/format";
import { attachPopover } from "../../utils/popover";
import { gamePath, navigateTo, rememberListScroll } from "../../utils/route";
import type { GameResult, Member } from "../../types";

/* ★ 글 속 태그(2026-10-26, 요청: "/g 로 언제든 게임목록 불러와서 게임 태그 가능하게(게임번호) @는 유저태그") —
   댓글 입력 · 글/일정의 요소(글·제목·목록 줄) 어디서든 `/g` 를 치면 게임 목록이 뜨고 고르면 `#게임번호` 가, `@` 를 치면 회원 목록이 뜨고
   고르면 `@닉네임` 이 들어간다. 저장은 글자 그대로(서버는 모른다) — 보일 때 그 글자를 칩으로 그린다(renderTags):
   `#` + 게임번호(12자리 · 같은 초 판은 -2…) 는 그 게임 상세로 가는 칩, `@` + 회원 닉네임은 회원 칩. */

/** 게임번호 꼴 — 시작 시각 12자리(yyMMddHHmmss · 시각 모를 판은 yyMMdd99nnnn), 같은 초에 둘째 판부터 -2…-9. */
const GAME_TAG = /#(\d{12}(?:-\d)?)(?![\d-])/g;
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function GameTagChip({ no }: { no: string }) {
  const path = gamePath(no);
  return (
    <a
      className="scr-tag-game" href={path}
      onClick={(e) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        rememberListScroll();
        navigateTo(path);
      }}
    >
      <Gamepad2 size={12} aria-hidden />#{no}
    </a>
  );
}

/** 글자 → 칩을 섞은 조각들. names 는 회원 칩으로 그릴 닉네임(긴 이름 먼저 맞춘다). keyBase 는 여러 조각을 이어 붙일 때 겹치지 않게. */
export function renderTags(text: string, names: string[], keyBase = ""): ReactNode[] {
  const nameAlt = names.filter(Boolean).slice().sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`${GAME_TAG.source}${nameAlt.length ? `|@(${nameAlt.join("|")})` : ""}`, "g");
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<span key={`${keyBase}t${last}`}>{text.slice(last, m.index)}</span>);
    out.push(m[1]
      ? <GameTagChip key={`${keyBase}g${m.index}`} no={m[1]} />
      : <span key={`${keyBase}c${m.index}`} className="scr-comment-mention">@{m[2]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<span key={`${keyBase}t${last}`}>{text.slice(last)}</span>);
  return out;
}

/** 지금 회원 닉네임(칩으로 그릴 이름들). */
export function useMemberNames(): string[] {
  const members = useAppStore((s) => s.members);
  return useMemo(() => members.filter((m) => m.status === "active" && m.nickname).map((m) => m.nickname), [members]);
}

/** 글 속 회원 태그의 회원 id — 댓글이 알림 대상으로 보낸다. */
export function mentionIdsOf(text: string, members: Member[]): string[] {
  const active = members.filter((m) => m.status === "active" && m.nickname);
  if (active.length === 0) return [];
  const byName = new Map(active.map((m) => [m.nickname, m.id]));
  const esc = active.map((m) => m.nickname).sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`@(${esc.join("|")})`, "g");
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = byName.get(m[1]);
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

/* 게임 고르기 목록 — 최근 판(한 번 받아 둔다) · `/g` 뒤에 친 글자가 있으면 서버 검색(맵·사람 · 아래 any)과 번호 앞머리로 거른다. */
const RECENT_GAMES = 30;
let recentGames: Promise<GameResult[]> | null = null;
const loadRecent = (): Promise<GameResult[]> => {
  recentGames ??= api.getGameResultsPage({ limit: RECENT_GAMES, sort: "latest" })
    .then((p) => p.items)
    .catch(() => { recentGames = null; return []; });
  return recentGames;
};

type Mode = { kind: "member" | "game"; q: string; start: number } | null;
const GAME_TRIGGER = /(?:^|\s)\/g(\S*)$/;
const MEMBER_TRIGGER = /@([^\s@]*)$/;

function gameLine(g: GameResult, memberOf: (id: string) => Member | undefined): string {
  const name = (s: GameResult["team1"][number]) => memberOf(s.memberId)?.nickname ?? s.rawName ?? "?";
  const [, m, d] = g.date.split("-");
  const map = g.mapCanonName ?? g.mapName ?? "";
  const sides = `${g.team1.map(name).join(", ")} vs ${g.team2.map(name).join(", ")}`;
  return [`${Number(m)}/${Number(d)}`, map, sides].filter(Boolean).join(" · ");
}

/** 입력 칸(input · textarea) 하나에 붙이는 태그 고르기 — onInput 을 값이 바뀔 때마다, onKeyDown 을 칸의 키 처리 맨 앞에 부르고(참이면 칸은 그 키를 버린다), popover 를 그린다. */
export function useInlineTags({ inputRef, value, setValue, maxLength }: {
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  setValue: (next: string) => void;
  maxLength?: number;
}) {
  const members = useAppStore((s) => s.members);
  const memberOf = useAppStore((s) => s.memberOf);
  const [mode, setMode] = useState<Mode>(null);
  const [highlight, setHighlight] = useState(0);
  const [games, setGames] = useState<GameResult[]>([]);
  const dropRef = useRef<HTMLDivElement>(null);

  const gameQ = mode?.kind === "game" ? mode.q : null;
  useEffect(() => {
    if (gameQ === null) return undefined;
    let dead = false;
    const q = gameQ.trim();
    const t = window.setTimeout(() => {
      const pick = q && !/^\d+$/.test(q)
        ? api.getGameResultsPage({ limit: RECENT_GAMES, sort: "latest", any: q }).then((p) => p.items).catch(() => [])
        : loadRecent().then((xs) => (q ? xs.filter((g) => g.matchNo.startsWith(q)) : xs));
      void pick.then((xs) => { if (!dead) setGames(xs.filter((g) => g.matchNo)); });
    }, q ? 200 : 0);
    return () => { dead = true; window.clearTimeout(t); };
  }, [gameQ]);

  const people = useMemo(() => {
    if (mode?.kind !== "member") return [];
    const q = mode.q.toLowerCase();
    return members
      .filter((m) => m.status === "active")
      .filter((m) => !q || m.nickname.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"))
      .slice(0, 50);
  }, [members, mode]);
  const count = mode?.kind === "game" ? games.length : people.length;
  const shown = mode !== null && count > 0;

  useEffect(() => { setHighlight(0); }, [mode?.kind, mode?.q, games]);
  useEffect(() => {
    dropRef.current?.querySelector(".scr-pv-opt-active")?.scrollIntoView({ block: "nearest" });
  }, [highlight]);
  useLayoutEffect(() => {
    if (!shown || !inputRef.current || !dropRef.current) return undefined;
    return attachPopover(inputRef.current, dropRef.current, { matchAnchor: true });
  }, [shown]);
  useEffect(() => {
    if (!shown) return undefined;
    const closeOnOutside = (e: Event) => {
      const t = e.target as Node | null;
      if (inputRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setMode(null);
    };
    const closeOnScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && dropRef.current?.contains(t)) return;
      setMode(null);
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [shown]);

  const onInput = (next: string, cursor: number): void => {
    const before = next.slice(0, cursor);
    const g = before.match(GAME_TRIGGER);
    if (g) { setMode({ kind: "game", q: g[1], start: cursor - g[1].length - 2 }); return; }
    const m = before.match(MEMBER_TRIGGER);
    setMode(m ? { kind: "member", q: m[1], start: cursor - m[0].length } : null);
  };

  const insert = (token: string): void => {
    if (!mode) return;
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const next = value.slice(0, mode.start) + token + value.slice(cursor);
    if (maxLength !== undefined && next.length > maxLength) return;
    setValue(next);
    setMode(null);
    const pos = mode.start + token.length;
    requestAnimationFrame(() => {
      const e = inputRef.current;
      if (e) { e.focus(); e.setSelectionRange(pos, pos); }
    });
  };
  const choose = (i: number): void => {
    if (mode?.kind === "game") { const g = games[i]; if (g) insert(`#${g.matchNo} `); }
    else { const p = people[i]; if (p) insert(`@${p.nickname} `); }
  };

  const onKeyDown = (e: React.KeyboardEvent): boolean => {
    if (!shown || e.nativeEvent.isComposing || e.keyCode === 229) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); setHighlight((h) => (h + 1) % count); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); setHighlight((h) => (h - 1 + count) % count); return true; }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); choose(Math.min(highlight, count - 1)); return true; }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMode(null); return true; }
    return false;
  };

  const popover = shown ? createPortal(
    <div className="scr-pv-drop scr-scroll scr-tag-drop" ref={dropRef}>
      {mode?.kind === "game" ? games.map((g, i) => (
        <button
          key={g.id} type="button"
          className={cx("scr-pv-opt scr-tag-game-opt", i === highlight && "scr-pv-opt-active")}
          onMouseEnter={() => setHighlight(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(i)}
        >
          <span className="scr-tag-game-no">#{g.matchNo}</span>
          <span className="scr-tag-game-desc">{gameLine(g, memberOf)}</span>
        </button>
      )) : people.map((m, i) => (
        <button
          key={m.id} type="button"
          className={cx("scr-pv-opt scr-mention-opt", i === highlight && "scr-pv-opt-active")}
          onMouseEnter={() => setHighlight(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(i)}
        >
          <Avatar member={m} size={22} />
          <span className="scr-mention-name">{m.nickname}</span>
        </button>
      ))}
    </div>,
    document.body,
  ) : null;

  return { onInput, onKeyDown, popover, open: shown, close: () => setMode(null) };
}
