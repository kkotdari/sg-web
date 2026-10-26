import { memo, useState, type ReactNode } from "react";
import { Megaphone, MessagesSquare } from "lucide-react";
import { shareThumb } from "../../utils/kakaoShare";
import { cx } from "../../utils/format";
import { api } from "../../api/client";
import { showAlert } from "../../components/common/AlertDialog";
import type { Post, PostCategory, PostWrite } from "../../types";
import BlockDocCard, { type DocHead, type DocSpec } from "./BlockDocCard";

/* ★ 자유게시판 글 카드 = 블록 문서 카드(BlockDocCard) + 꼭지(2026-10-26, 요청: "자유게시판 만들어줘 · 일정 폼 재사용(공통화) ·
   댓글달수있음 · 수정삭제는 본인만" · "꼭지(분류) 고를수있음 잡담 질문 공략" · "공지는 따로 속성으로 부여").
   쓴 사람에게만 늘 편집 상태다(canEdit) · 공지는 꼭지가 아니라 운영자가 도구 줄에서 켜고 끄는 속성이다(서버도 운영자 것만 받는다). */

export const POST_CATEGORIES: { value: PostCategory; label: string }[] = [
  { value: "chat", label: "잡담" },
  { value: "question", label: "질문" },
  { value: "guide", label: "공략" },
];
export const categoryLabel = (c: PostCategory | null): string => POST_CATEGORIES.find((x) => x.value === c)?.label ?? "";
const asCategory = (s: string | undefined): PostCategory | null =>
  POST_CATEGORIES.some((x) => x.value === s) ? (s as PostCategory) : null;

/** 꼭지 고르기 — 글쓰기 창과 카드 머리 줄이 같이 쓴다. 고르지 않아도 된다(요청: "카테고리 픽은 필수 아닌 선택으로") — 고른 것을 다시 누르면 푼다. */
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

/** 목록 줄·카드의 꼭지 배지(공지면 공지 배지가 앞에). */
export function PostBadges({ post }: { post: Pick<Post, "category" | "notice"> }) {
  return (
    <>
      {post.notice && <span className="scr-post-badge is-notice">공지</span>}
      {post.category && <span className={cx("scr-post-badge", `is-${post.category}`)}>{categoryLabel(post.category)}</span>}
    </>
  );
}

function CategoryLine({ doc, head, editing, onChange }: {
  doc: Post; head: DocHead; editing: boolean; onChange: (part: Partial<DocHead>) => void;
}) {
  const cat = asCategory(head.category);
  return (
    <span className="scr-post-head-line">
      {doc.notice && <span className="scr-post-badge is-notice">공지</span>}
      {editing ? <CategoryPicker value={cat} onChange={(next) => onChange({ category: next ?? "" })} />
        : cat && <span className={cx("scr-post-badge", `is-${cat}`)}>{categoryLabel(cat)}</span>}
    </span>
  );
}

/** 운영자의 공지 단추 — 남의 글이라도 공지 속성만 바꾼다(서버 PostService.update). */
function NoticeToggle({ doc, adopt }: { doc: Post; adopt: (saved: Post) => void }) {
  const [busy, setBusy] = useState(false);
  const flip = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      adopt(await api.updatePost(doc.id, { title: doc.title, category: doc.category, notice: !doc.notice }));
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

const SPEC_BASE: Omit<DocSpec<Post, PostWrite>, "extraTools"> = {
  kind: "post",
  icon: <MessagesSquare size={16} aria-hidden />,
  label: "자유게시판",
  headKeys: ["title", "category"],
  headOf: (p) => ({ title: p.title, category: p.category ?? "" }),
  serverKeyOf: (p) => JSON.stringify([p.title, p.category, p.blocks ?? []]),
  ready: (h) => !!h.title.trim(),
  writeOf: (h, blocks, expectedUpdatedAt) => ({
    title: h.title.trim(), category: asCategory(h.category), expectedUpdatedAt, blocks,
  }),
  get: (id) => api.getPost(id),
  update: (id, payload) => api.updatePost(id, payload),
  remove: (id) => api.deletePost(id),
  share: (post) => ({
    title: post.title,
    description: post.category ? `자유게시판 · ${categoryLabel(post.category)}` : "자유게시판",
    ...shareThumb("notice"),
    link: `${window.location.origin}/board/${post.id}`,
    fallbackText: `[스타게이트] ${post.title} — 자유게시판`,
  }),
  toolsLabel: "글 도구",
  deleteTitle: "글 삭제",
  deleteMessage: "이 글을 삭제할까요? 달린 댓글과 첨부파일도 함께 사라져요.",
  byline: (p) => `${p.createdBy.nickname} 작성`,
  HeadLine: CategoryLine,
};
const POST_SPEC: DocSpec<Post, PostWrite> = SPEC_BASE;
const POST_SPEC_ADMIN: DocSpec<Post, PostWrite> = {
  ...SPEC_BASE,
  extraTools: ({ doc, adopt }) => <NoticeToggle doc={doc} adopt={adopt} />,
};

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
