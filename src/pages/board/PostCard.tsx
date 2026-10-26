import { memo, useMemo, useState, type ReactNode } from "react";
import { Megaphone, MessagesSquare } from "lucide-react";
import { shareThumb } from "../../utils/kakaoShare";
import { cx } from "../../utils/format";
import { formatWhen, todayStr } from "../../utils/date";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import { showAlert } from "../../components/common/AlertDialog";
import type { Post, PostCategory, PostWrite } from "../../types";
import BlockDocCard, { type DocHead, type DocSpec } from "./BlockDocCard";

/* ★ 게시판 글 카드 = 블록 문서 카드(BlockDocCard) + 꼭지(2026-10-26, 요청: "자유게시판 만들어줘 · 일정 폼 재사용(공통화) ·
   댓글달수있음 · 수정삭제는 본인만" · "꼭지(분류) 고를수있음 잡담 질문 공략" · "공지는 따로 속성으로 부여" ·
   "일정도 하나의 글로 취급"). 쓴 사람에게만 늘 편집 상태다(canEdit) · 꼭지 '일정'을 고르면 일시 칸이 선다(날짜는 꼭) ·
   공지는 꼭지가 아니라 운영자가 켜고 끄는 속성이다(글쓰기에선 머리 줄의 체크 · 쓴 뒤엔 도구 줄의 단추 — 서버도 운영자 것만 받는다). */

export const POST_CATEGORIES: { value: PostCategory; label: string }[] = [
  { value: "chat", label: "잡담" },
  { value: "question", label: "질문" },
  { value: "guide", label: "공략" },
  { value: "schedule", label: "일정" },
];
export const categoryLabel = (c: PostCategory | null): string => POST_CATEGORIES.find((x) => x.value === c)?.label ?? "";
const asCategory = (s: string | undefined): PostCategory | null =>
  POST_CATEGORIES.some((x) => x.value === s) ? (s as PostCategory) : null;

/** 일정 글의 일시 글자(예: 10월 26일 (일) 20:00). */
export function postWhenText(date: string | null, time: string | null): string {
  if (!date) return "";
  const day = formatWhen(date);
  return time ? `${day} ${time}` : day;
}

/** 꼭지 고르기 — 고르지 않아도 된다(요청: "카테고리 픽은 필수 아닌 선택으로") — 고른 것을 다시 누르면 푼다. */
export function CategoryPicker({ value, onChange }: { value: PostCategory | null; onChange: (next: PostCategory | null) => void }) {
  return (
    <span className="scr-post-cats" role="radiogroup" aria-label="꼭지">
      {POST_CATEGORIES.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={o.value === value}
          className={cx("scr-post-cat", `is-${o.value}`, o.value === value && "is-on")}
          onClick={(e) => { e.stopPropagation(); onChange(o.value === value ? null : o.value); }}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** 목록 줄의 배지(공지면 공지 배지가 앞에) · 일정 글은 일시도. */
export function PostBadges({ post }: { post: Pick<Post, "category" | "notice"> }) {
  return (
    <>
      {post.notice && <span className="scr-post-badge is-notice">공지</span>}
      {post.category && <span className={cx("scr-post-badge", `is-${post.category}`)}>{categoryLabel(post.category)}</span>}
    </>
  );
}

function headLineOf(admin: boolean, draft: boolean) {
  return function PostHeadLine({ doc, head, editing, onChange }: {
    doc: Post; head: DocHead; editing: boolean; onChange: (part: Partial<DocHead>) => void;
  }) {
    const cat = asCategory(head.category);
    const notice = draft ? head.notice === "1" : doc.notice;
    if (!editing) {
      return (
        <span className="scr-post-head-line">
          {notice && <span className="scr-post-badge is-notice">공지</span>}
          {cat && <span className={cx("scr-post-badge", `is-${cat}`)}>{categoryLabel(cat)}</span>}
          {cat === "schedule" && <span className="scr-post-when">{postWhenText(head.date || null, head.time || null)}</span>}
        </span>
      );
    }
    return (
      <span className="scr-post-head-line" onClick={(e) => e.stopPropagation()} role="presentation">
        {notice && !draft && <span className="scr-post-badge is-notice">공지</span>}
        <CategoryPicker
          value={cat}
          /* 일정을 고르면 날짜를 오늘로 채워 둔다(날짜는 꼭 있어야 한다). */
          onChange={(next) => onChange(next === "schedule" && !head.date ? { category: next, date: todayStr() } : { category: next ?? "" })}
        />
        {cat === "schedule" && (
          <span className="scr-schedule-when-edit">
            <input className="scr-sb-line" type="date" value={head.date} onChange={(e) => onChange({ date: e.target.value })} aria-label="날짜" />
            <input className="scr-sb-line" type="time" value={head.time} onChange={(e) => onChange({ time: e.target.value })} aria-label="시간" />
          </span>
        )}
        {draft && admin && (
          <label className="scr-post-notice-check">
            <input type="checkbox" checked={notice} onChange={(e) => onChange({ notice: e.target.checked ? "1" : "" })} />
            <span>공지</span>
          </label>
        )}
      </span>
    );
  };
}

/** 운영자의 공지 단추 — 남의 글이라도 공지 속성만 바꾼다(서버 PostService.update). */
function NoticeToggle({ doc, adopt }: { doc: Post; adopt: (saved: Post) => void }) {
  const [busy, setBusy] = useState(false);
  const flip = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      adopt(await api.updatePost(doc.id, {
        title: doc.title, category: doc.category, scheduledDate: doc.scheduledDate, scheduledTime: doc.scheduledTime,
        notice: !doc.notice,
      }));
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "공지를 바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  const label = doc.notice ? "공지 내리기" : "공지로 올리기";
  return (
    <button
      type="button" className={cx("scr-icon-btn scr-tools-btn", doc.notice && "is-on")}
      title={label} aria-label={label} aria-pressed={doc.notice} disabled={busy}
      onClick={() => void flip()}
    >
      <Megaphone size={15} />
    </button>
  );
}

function postSpec({ admin, draft }: {
  admin: boolean;
  draft?: { onCreated: (p: Post) => void; onCancel: () => void };
}): DocSpec<Post, PostWrite> {
  return {
    kind: "post",
    icon: <MessagesSquare size={16} aria-hidden />,
    label: "게시판",
    headKeys: ["title", "category", "date", "time", "notice"],
    headOf: (p) => ({
      title: p.title, category: p.category ?? "", date: p.scheduledDate ?? "", time: p.scheduledTime ?? "", notice: p.notice ? "1" : "",
    }),
    serverKeyOf: (p) => JSON.stringify([p.title, p.category, p.scheduledDate, p.scheduledTime, p.blocks ?? []]),
    ready: (h) => !!h.title.trim() && (h.category !== "schedule" || !!h.date),
    writeOf: (h, blocks, expectedUpdatedAt) => {
      const category = asCategory(h.category);
      const when = category === "schedule" ? { scheduledDate: h.date || null, scheduledTime: h.time || null } : {};
      return draft
        ? { title: h.title.trim(), category, ...when, blocks, ...(admin && h.notice === "1" ? { notice: true } : {}) }
        : { title: h.title.trim(), category, ...when, expectedUpdatedAt, blocks };
    },
    get: (id) => api.getPost(id),
    update: draft
      ? async (_id, payload) => { const p = await api.createPost(payload); draft.onCreated(p); return p; }
      : (id, payload) => api.updatePost(id, payload),
    remove: (id) => api.deletePost(id),
    share: (post) => {
      const when = postWhenText(post.scheduledDate, post.scheduledTime);
      return {
        title: post.title,
        description: when || (post.category ? `게시판 · ${categoryLabel(post.category)}` : "게시판"),
        ...shareThumb(post.category === "schedule" ? "schedule" : "notice"),
        link: `${window.location.origin}/board/${post.id}`,
        fallbackText: `[스타게이트] ${post.title} — ${when || "게시판"}`,
      };
    },
    toolsLabel: "글 도구",
    deleteTitle: "글 삭제",
    deleteMessage: "이 글을 삭제할까요? 달린 댓글과 첨부파일도 함께 사라져요.",
    byline: (p) => `${p.createdBy.nickname} 작성`,
    HeadLine: headLineOf(admin, !!draft),
    ...(admin && !draft ? { extraTools: ({ doc, adopt }) => <NoticeToggle doc={doc} adopt={adopt} /> } : {}),
    ...(draft ? { draft: { saveLabel: "등록", onDiscard: draft.onCancel } } : {}),
  };
}
const POST_SPEC = postSpec({ admin: false });
const POST_SPEC_ADMIN = postSpec({ admin: true });

type PostCardProps = {
  post: Post;
  timeText?: ReactNode;
  dateLabel?: string;
  /** 쓴 사람만 — 고치기·지우기 둘 다(요청: "수정삭제는 본인만"). */
  mine: boolean;
  /** 운영자 — 공지 단추. */
  admin: boolean;
  onDeleted: (id: number) => void;
  footer?: ReactNode;
};

export default memo(function PostCard({ post, mine, admin, ...rest }: PostCardProps) {
  return <BlockDocCard spec={admin ? POST_SPEC_ADMIN : POST_SPEC} doc={post} canEdit={mine} canDelete={mine} {...rest} />;
}, (a, b) => (
  a.post === b.post && a.mine === b.mine && a.admin === b.admin
  && a.dateLabel === b.dateLabel && a.timeText === b.timeText
));

/** 글쓰기 — 아직 없는 글을 같은 카드로 쓴다(제목 · 꼭지 · 일시 · 공지 · 본문을 한 폼에서). 등록하면 onCreated. */
export function PostDraftCard({ admin, onCreated, onCancel }: {
  admin: boolean;
  onCreated: (p: Post) => void;
  onCancel: () => void;
}) {
  const user = useAppStore((s) => s.user);
  const [doc] = useState<Post>(() => ({
    id: 0, title: "", category: null, notice: false, scheduledDate: null, scheduledTime: null, blocks: [],
    createdBy: { id: user?.id ?? "", nickname: user?.nickname ?? "", avatar: null },
    createdAt: new Date().toISOString(), updatedAt: "",
  }));
  const spec = useMemo(() => postSpec({ admin, draft: { onCreated, onCancel } }), []);
  return <BlockDocCard spec={spec} doc={doc} canEdit canDelete={false} onDeleted={onCancel} />;
}
