import { memo, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { ArrowLeft, MoreHorizontal, Phone } from "lucide-react";
import { LoadingMark } from "../../components/common/Feedback";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import KakaoShareButton from "../../components/common/KakaoShareButton";
import { challengePhoto, shareThumb } from "../../utils/kakaoShare";
import { useAppStore } from "../../store/appStore";
import { isAdminRole } from "../../constants/roles";
import { formatWhen } from "../../utils/date";
import { cx } from "../../utils/format";
import { api } from "../../api/client";
import type { ActivityGroupKey } from "../../utils/route";
import type { ActivityTargetType, Challenge } from "../../types";
import { ChallengeCard, ChallengeTimeHeadEdit } from "../challenge/ChallengeScreen";
import ActivityComments from "./ActivityComments";
import { ActivityCard } from "./ActivityCard";
import LeagueMatchCard from "./LeagueMatchCard";
import ScheduleCard from "./ScheduleCard";
import { GameDetailCloseContext } from "./gameDetailClose";
import { useFeedActions } from "./activityFeed";
import {
  GROUP_DEFS, GROUP_ITEM_KIND, GROUP_SCREEN_CODE, challengeItem, dateLabelOf, leagueMatchItem, rowPhoto, scheduleItem,
  type ActivityItem,
} from "./activityItems";

/* ★ 상세(일정·너 나와!·리그 경기) — 2026-10-19 ActivityScreen 에서 뗐다(요청: "…목록과 상세등 모두 컴포넌트 분리").
   상세는 제 항목을 **제 상태로** 든다 — 피드(목록)를 구독하지 않으므로 목록이 바뀌어도 다시 그려지지 않는다. 상세에서 고친 것은
   목록에도 알린다(피드 손잡이 · 일정은 빼고 — 일정은 들어올 때마다 서버에서 새로 받는다: "목록은 신경쓰지말고 목록에서 상세 들어갈때마다 새로 받아야지"). */

function ChallengeActionsMenu({ challenge, isAdmin, myId, onDeleted, onChanged }: {
  challenge: Challenge;
  isAdmin: boolean;
  myId: string;
  onDeleted: (id: number) => void;
  onChanged: (c: Challenge) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canCancel = (challenge.createdBy.id === myId || isAdmin)
    && (challenge.status === "pending" || challenge.status === "confirmed");

  const shareContent = () => {
    const caller = challenge.createdBy.nickname;
    return {
      title: `${caller ? `${caller}님` : "누군가"}의 호출`,
      description: "누가 호출됐을까요? 👀 탭해서 확인하기",
      ...shareThumb("challengeCall", challengePhoto(challenge)),
      link: `${window.location.origin}/?sv=challenge&sid=${challenge.id}`,
      fallbackText: `[스타게이트] ${caller ? `${caller}님` : "누군가"}의 호출이 도착했어요! 열어서 확인해보세요.`,
    };
  };

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.deleteChallenge(challenge.id);
      onDeleted(challenge.id);
      setConfirmOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    setErr(null);
    try {
      onChanged(await api.cancelChallenge(challenge.id));
      setCancelOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "취소하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scr-activity-chal-menu">
      <button
        type="button" className="scr-activity-post-menu-btn scr-activity-kebab-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="더보기" aria-haspopup="menu" aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div
            className="scr-activity-add-backdrop"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            aria-hidden
          />
          <div className="scr-menu-pop-drop scr-activity-chal-menu-drop" role="menu">
            <KakaoShareButton variant="menu" content={shareContent} onDone={() => setOpen(false)} />
            {canCancel && (
              <button
                type="button" role="menuitem" className="scr-menu-pop-opt"
                onClick={() => { setOpen(false); setCancelOpen(true); }}
              >
                취소
              </button>
            )}
            {isAdmin && (
              <button
                type="button" role="menuitem"
                className={cx("scr-menu-pop-opt", "scr-activity-post-menu-opt-danger")}
                onClick={() => { setOpen(false); setConfirmOpen(true); }}
              >
                삭제
              </button>
            )}
          </div>
        </>
      )}
      {confirmOpen && (
        <ConfirmDialog
          title="너 나와! 삭제"
          message="이 너 나와!를 완전히 삭제할까요? 되돌릴 수 없어요."
          confirmLabel={busy ? "삭제 중..." : "삭제"}
          error={err}
          onConfirm={() => void remove()}
          onCancel={() => { setConfirmOpen(false); setErr(null); }}
        />
      )}
      {cancelOpen && (
        <ConfirmDialog
          title="너 나와! 취소"
          message="이 호출을 거둬들일까요? 활동에는 취소로 남아요."
          confirmLabel={busy ? "취소 중..." : "취소하기"}
          cancelLabel="그냥 둘래요"
          error={err}
          onConfirm={() => void cancel()}
          onCancel={() => { setCancelOpen(false); setErr(null); }}
        />
      )}
    </div>
  );
}

function ActivityCardComments({ targetType, targetId, overModal }: {
  targetType: ActivityTargetType; targetId: number; overModal?: boolean;
}) {
  return <ActivityComments targetType={targetType} targetId={targetId} overModal={overModal} />;
}

export default memo(function ActivityDetailPage({ group, id, seed, onBack, onClose, onMiss }: {
  group: ActivityGroupKey;
  id: number;
  /** 목록에서 눌러 온 항목 — 첫 그림을 바로 그린다. 일정은 쓰지 않는다(늘 새로 받는다). */
  seed: ActivityItem | null;
  /** 머리 줄의 뒤로(묶음 목록으로). */
  onBack: () => void;
  /** 카드 안에서 상세를 닫을 때(게임으로 가기 등 · GameDetailCloseContext). */
  onClose: () => void;
  /** 서버에 없을 때 — 라우터가 목록을 그린다. */
  onMiss: () => void;
}) {
  const feed = useFeedActions();
  const user = useAppStore((s) => s.user);
  const isAdmin = !!user && isAdminRole(user.roles);
  const [item, setItem] = useState<ActivityItem | null>(group === "schedule" ? null : seed);

  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  useEffect(() => { void api.pingAccess(GROUP_SCREEN_CODE[group], `${group}#${id}`); }, []);
  useEffect(() => {
    if (item) return undefined;
    let cancelled = false;
    api.getActivityItem(GROUP_ITEM_KIND[group], id)
      .then((row) => {
        if (cancelled) return;
        const made = row.challenge ? challengeItem(row.challenge)
          : row.schedule ? scheduleItem(row.schedule)
            : row.leagueMatch ? leagueMatchItem(row.leagueMatch) : null;   // 알림(랭킹 변동)은 걷었다(GROUP_DEFS)
        if (made) setItem(made); else onMiss();
      })
      .catch(() => { if (!cancelled) onMiss(); });
    return () => { cancelled = true; };
  }, []);

  if (!item) return <div className="scr-activity-list"><LoadingMark /></div>;

  const upsertChallenge = (c: Challenge): void => {
    setItem(challengeItem(c));
    feed.upsertChallenge(c);
  };
  const g9 = GROUP_DEFS.find((d) => d.key === group);
  const photo = rowPhoto(item);
  return (
    <div className="scr-activity-group-page">
      <div className="scr-v2-toolbar scr-v2-toolbar-crumb">
        <div className="scr-v2-toolbar-title-row scr-crumb">
          <button type="button" className="scr-crumb-back" onClick={onBack}>
            <ArrowLeft size={14} />
            <span>{group === "league" ? "활동" : g9?.label ?? "활동"}</span>
          </button>
          <h1 className="scr-title scr-crumb-title">{g9?.label ?? ""}</h1>
        </div>
      </div>
      <div className="scr-activity-list">
        <div
          className={cx("scr-activity-row-body", photo && "scr-activity-detail-photo")}
          {...(photo ? { style: { "--card-photo": `url("${photo}")` } as CSSProperties } : {})}
        >
          {photo && <div className="scr-activity-card-photo" aria-hidden="true" />}
          <GameDetailCloseContext.Provider value={onClose}>
            {item.kind === "schedule" ? (
              <div className="scr-activity-card-head-off">
                <ScheduleCard
                  schedule={item.schedule}
                  timeText={formatWhen(item.time, { clock: item.withClock })}
                  dateLabel={dateLabelOf(item)}
                  canEdit={!!user}
                  canDelete={!!user && (item.schedule.createdBy.id === user.id || isAdmin)}
                  onDeleted={(sid) => {
                    feed.patch((prev) => prev.filter((it) => it.schedule?.id !== sid));
                    feed.reload();
                  }}
                  footer={<ActivityCardComments targetType="schedule" targetId={item.schedule.id} overModal />}
                />
              </div>
            ) : item.kind === "leagueMatch" ? (
              <div className="scr-activity-card-head-off">
                <LeagueMatchCard
                  match={item.match}
                  timeText={formatWhen(item.time, { clock: item.withClock })}
                  dateLabel={dateLabelOf(item)}
                  footer={<ActivityCardComments targetType="leagueMatch" targetId={item.match.id} overModal />}
                />
              </div>
            ) : item.kind === "challenge" ? (
              <div className="scr-activity-card-head-off">
                <ActivityCard
                  className={item.challenge.resultWinnerSide === "not_held" ? "scr-activity-card-void" : undefined}
                  dateLabel={item.undated ? "미정" : dateLabelOf(item)}
                  icon={<Phone size={16} aria-hidden />}
                  label="너 나와!"
                  timeText={item.undated ? "미정" : formatWhen(item.time, { clock: item.withClock })}
                  headMeta={<>
                    <ChallengeTimeHeadEdit
                      challenge={item.challenge}
                      timeLabel={null}
                      myId={user?.id}
                      onUpdated={upsertChallenge}
                    />
                  </>}
                  actions={
                    <ChallengeActionsMenu
                      challenge={item.challenge}
                      isAdmin={isAdmin}
                      myId={user?.id ?? ""}
                      onDeleted={(cid) => {
                        feed.patch((prev) => prev.filter((it) => it.challenge?.id !== cid));
                        feed.reload();
                      }}
                      onChanged={upsertChallenge}
                    />
                  }
                  comment={<ActivityCardComments targetType="challenge" targetId={item.challenge.id} overModal />}
                  bodyClassName={item.challenge.backdropUrl ? "scr-activity-card-body-photo" : undefined}
                >
                  {item.challenge.backdropUrl && (
                    <div
                      className="scr-activity-card-photo" aria-hidden="true"
                      style={{ "--card-photo": `url("${item.challenge.backdropUrl}")` } as CSSProperties}
                    />
                  )}
                  <ChallengeCard
                    challenge={item.challenge}
                    myId={user?.id}
                    onResponded={upsertChallenge}
                  />
                </ActivityCard>
              </div>
            ) : null}
          </GameDetailCloseContext.Provider>
        </div>
      </div>
    </div>
  );
});
