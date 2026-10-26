import { useState } from "react";
import { SquarePen } from "lucide-react";
import { api } from "../api/client";
import type { Post, PostCategory } from "../types";
import { CategoryPicker } from "../pages/activity/PostCard";
import DocFormModal, { DocTitleField } from "./DocFormModal";

/* 자유게시판 글쓰기(2026-10-26) — 일정 등록 창과 같은 틀(DocFormModal). 제목 · 꼭지(잡담/질문/공략) · 운영자는 공지 여부.
   본문은 등록 뒤 상세(늘 편집 상태)에서 요소로 쓴다 — 일정과 같다. */
export default function PostFormModal({ admin, onClose, onSaved }: {
  admin: boolean;
  onClose: () => void;
  onSaved: (post: Post) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<PostCategory | null>(null);
  const [notice, setNotice] = useState(false);

  return (
    <DocFormModal
      hash="post-new"
      heading="글쓰기"
      submitIcon={<SquarePen size={14} />}
      submitLabel="등록"
      canSubmit={title.trim().length > 0}
      failText="글을 저장하지 못했어요."
      onSubmit={async () => {
        onSaved(await api.createPost({ title: title.trim(), category, ...(admin && notice ? { notice: true } : {}) }));
      }}
      onClose={onClose}
      className="scr-post-form-modal"
    >
      <DocTitleField value={title} onChange={setTitle} placeholder="무슨 이야기인가요?" />
      <div className="scr-field">
        <span className="scr-label">꼭지 (선택)</span>
        <CategoryPicker value={category} onChange={setCategory} />
      </div>
      {admin && (
        <label className="scr-post-notice-check">
          <input type="checkbox" checked={notice} onChange={(e) => setNotice(e.target.checked)} />
          <span>공지로 올리기</span>
        </label>
      )}
    </DocFormModal>
  );
}
