import { memo, type MouseEvent } from "react";
import { cx } from "../../utils/format";
import { serverMs } from "../../utils/date";
import { pathOf } from "../../utils/route";
import type { Post } from "../../types";
import { categoryLabel, postWhenText } from "./PostCard";

/* ★ 게시판 목록 줄(2026-10-26, 요청: "게시판을 좀더 게시판처럼 보이게") — 게임 목록의 줄(FeedRow) 대신 흔한 게시판 꼴.
   PC 는 표(번호 · 분류 · 제목 [댓글] · 글쓴이 · 날짜 — 머리 줄은 BoardHead) · 폰은 두 줄(제목 줄 · 글쓴이·날짜 줄).
   공지 글은 번호 칸에 공지 배지 · 줄 바탕을 깐다. 날짜는 게시판 버릇대로 오늘이면 시각, 올해면 월.일, 그 밖은 연.월.일.
   줄은 고리(a)다 — 새 탭·주소 복사가 되고, 그냥 누르면 목록 안에서 연다(onOpen). */

const pad2 = (n: number): string => String(n).padStart(2, "0");

export function boardDateText(iso: string, now: Date = new Date()): string {
  const ms = serverMs(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  const md = `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  return d.getFullYear() === now.getFullYear() ? md : `${String(d.getFullYear()).slice(2)}.${md}`;
}

export function BoardHead() {
  return (
    <div className="scr-bbs-row scr-bbs-head" role="row">
      <span className="scr-bbs-no" role="columnheader">번호</span>
      <span className="scr-bbs-cat" role="columnheader">분류</span>
      <span className="scr-bbs-title" role="columnheader">제목</span>
      <span className="scr-bbs-who" role="columnheader">글쓴이</span>
      <span className="scr-bbs-date" role="columnheader">날짜</span>
    </div>
  );
}

export const BoardRow = memo(function BoardRow({ post, notes, fresh, mobile, minute, onOpen }: {
  post: Post;
  /** 댓글 수. */
  notes: number;
  /** 새 글(NEW 창 안). */
  fresh: boolean;
  mobile: boolean;
  /** 분 단위 시계 — 자정을 넘기면 '오늘 시각'이 '월.일'로 바뀌게. */
  minute: number;
  onOpen: (post: Post) => void;
}) {
  void minute;
  const href = pathOf({ screen: "board", item: String(post.id) });
  const click = (e: MouseEvent<HTMLAnchorElement>): void => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // 새 탭 등은 브라우저에 맡긴다
    e.preventDefault();
    onOpen(post);
  };
  const cat = post.category ? <span className={cx("scr-post-badge", `is-${post.category}`)}>{categoryLabel(post.category)}</span> : null;
  /* 일정 글의 일시는 **오른쪽에 따로** "일시: …"(2026-10-26, 요청: "게시판 일시를 오른쪽에 별도로 표시 일시: ... 이렇게") —
     PC 는 제목 칸 오른끝 · 폰은 아랫줄(글쓴이·날짜) 오른끝. */
  const when = post.category === "schedule" && post.scheduledDate
    ? <span className="scr-bbs-when"><span className="scr-bbs-when-k">일시:</span> {postWhenText(post.scheduledDate, post.scheduledTime)}</span> : null;
  const title = (
    <span className="scr-bbs-title-line">
      <span className="scr-bbs-title-text">{post.title}</span>
      {notes > 0 && <span className="scr-bbs-notes" title={`댓글 ${notes}개`}>[{notes}]</span>}
      {fresh && <span className="scr-bbs-new" aria-label="새 글">N</span>}
    </span>
  );
  const date = boardDateText(post.createdAt);
  if (mobile) {
    return (
      <a href={href} onClick={click} className={cx("scr-bbs-item", post.notice && "is-notice")}>
        <span className="scr-bbs-item-top">
          {post.notice && <span className="scr-post-badge is-notice">공지</span>}
          {cat}
          {title}
        </span>
        <span className="scr-bbs-item-sub">
          <span className="scr-bbs-who">{post.createdBy.nickname}</span>
          <span className="scr-bbs-date">{date}</span>
          {when}
        </span>
      </a>
    );
  }
  return (
    <a href={href} onClick={click} className={cx("scr-bbs-row", post.notice && "is-notice")} role="row">
      <span className="scr-bbs-no">{post.notice ? <span className="scr-post-badge is-notice">공지</span> : post.id}</span>
      <span className="scr-bbs-cat">{cat ?? <span className="scr-bbs-dim">-</span>}</span>
      <span className="scr-bbs-title">{title}{when}</span>
      <span className="scr-bbs-who">{post.createdBy.nickname}</span>
      <span className="scr-bbs-date">{date}</span>
    </a>
  );
});
