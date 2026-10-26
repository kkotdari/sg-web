import { memo, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LoadingMark } from "../../components/common/Feedback";
import { useAppStore } from "../../store/appStore";
import { isAdminRole } from "../../constants/roles";
import { formatWhen } from "../../utils/date";
import { api } from "../../api/client";
import type { CommentTargetType, Post } from "../../types";
import Comments from "../feed/Comments";
import PostCard, { PostDraftCard } from "./PostCard";
import { GameDetailCloseContext } from "../games/gameDetailClose";
import { dateLabelOf, postItem, type PostItem } from "../feed/feedItems";

/* ★ 게시판 글 상세는 **목록과 무관한 별도 페이지**다(2026-10-19, 요청: "목록은 신경쓰지말고 목록에서 상세 들어갈때마다 새로 받아야지") —
   들어올 때마다 서버에서 받고(목록의 사본으로 먼저 그리지 않는다), 상세에서 고친 것을 목록에 알리지도 않는다. 제 항목을 제 상태로 든다.
   (2026-10-26 일정이 꼭지 '일정' 글이 되고 리그 경기 상세는 리그 화면으로 옮겨, 이 페이지는 게시판 글만 그린다.)
   item: 글 번호 · "new"(글쓰기 — 요청: "등록시 바로 등록폼으로 가고 제목과 분류같은거도 거기서 입력"). */

export const NEW_POST_ITEM = "new";

function CardComments({ targetType, targetId, overModal }: {
  targetType: CommentTargetType; targetId: number; overModal?: boolean;
}) {
  return <Comments targetType={targetType} targetId={targetId} overModal={overModal} />;
}

export default memo(function PostDetailPage({ item: itemText, onBack, onClose, onMiss, onCreated }: {
  item: string;
  /** 머리 줄의 뒤로(게시판 목록으로). */
  onBack: () => void;
  /** 카드 안에서 상세를 닫을 때(지움 · 게임으로 가기 등 · GameDetailCloseContext). */
  onClose: () => void;
  /** 서버에 없을 때 — 라우터가 목록을 그린다. */
  onMiss: () => void;
  /** 글쓰기에서 등록했을 때 — 그 글의 주소로 갈아 끼운다. */
  onCreated: (post: Post) => void;
}) {
  const user = useAppStore((s) => s.user);
  const isAdmin = !!user && isAdminRole(user.roles);
  const creating = itemText === NEW_POST_ITEM;
  const [item, setItem] = useState<PostItem | null>(null);

  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  useEffect(() => { if (!creating) void api.pingAccess("board", `board#${itemText}`); }, []);
  useEffect(() => {
    if (creating || item) return undefined;
    let cancelled = false;
    const id = Number(itemText);
    const load = Number.isInteger(id) ? api.getFeedItem("post", id).then((row) => row.post ?? null) : Promise.resolve(null);
    load
      .then((p) => {
        if (cancelled) return;
        if (p) setItem(postItem(p)); else onMiss();
      })
      .catch(() => { if (!cancelled) onMiss(); });
    return () => { cancelled = true; };
  }, []);

  if (!creating && !item) return <div className="scr-feed-list"><LoadingMark /></div>;

  return (
    <div className="scr-feed-group-page">
      <div className="scr-v2-toolbar scr-v2-toolbar-crumb">
        <div className="scr-v2-toolbar-title-row scr-crumb">
          <button type="button" className="scr-crumb-back" onClick={onBack}>
            <ArrowLeft size={14} />
            <span>게시판</span>
          </button>
          <h1 className="scr-title scr-crumb-title">{creating ? "글쓰기" : "게시판"}</h1>
        </div>
      </div>
      <div className="scr-feed-list">
        <div className="scr-feed-row-body">
          <GameDetailCloseContext.Provider value={onClose}>
            <div className="scr-feed-card-head-off">
              {creating ? (
                <PostDraftCard admin={isAdmin} onCreated={onCreated} onCancel={onBack} />
              ) : item && (
                /* 고치기·지우기는 쓴 사람만(요청: "수정삭제는 본인만") · 운영자는 공지 단추만. */
                <PostCard
                  post={item.post}
                  timeText={formatWhen(item.time, { clock: item.withClock })}
                  dateLabel={dateLabelOf(item)}
                  mine={!!user && item.post.createdBy.id === user.id}
                  admin={isAdmin}
                  onDeleted={onClose}
                  footer={<CardComments targetType="post" targetId={item.post.id} overModal />}
                />
              )}
            </div>
          </GameDetailCloseContext.Provider>
        </div>
      </div>
    </div>
  );
});
