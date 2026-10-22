import { memo, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LoadingMark } from "../../components/common/Feedback";
import { useAppStore } from "../../store/appStore";
import { isAdminRole } from "../../constants/roles";
import { formatWhen } from "../../utils/date";
import { api } from "../../api/client";
import type { ActivityGroupKey } from "../../utils/route";
import type { ActivityTargetType } from "../../types";
import ActivityComments from "./ActivityComments";
import LeagueMatchCard from "./LeagueMatchCard";
import ScheduleCard from "./ScheduleCard";
import { GameDetailCloseContext } from "./gameDetailClose";
import {
  GROUP_DEFS, GROUP_ITEM_KIND, GROUP_SCREEN_CODE, dateLabelOf, leagueMatchItem, scheduleItem,
  type ActivityItem,
} from "./activityItems";

/* ★ 상세(일정·리그 경기)는 **목록과 무관한 별도 페이지**다(2026-10-19, 요청: "목록은 신경쓰지말고 목록에서 상세 들어갈때마다 새로 받아야지" →
   "너나와 리그 게임도 목록과 전혀무관하게 변경 · 별도 페이지임 그냥") — 들어올 때마다 서버에서 받고(목록의 사본으로 먼저 그리지 않는다), 상세에서
   고친 것을 목록에 알리지도 않는다. 제 항목을 제 상태로 든다. */

function ActivityCardComments({ targetType, targetId, overModal }: {
  targetType: ActivityTargetType; targetId: number; overModal?: boolean;
}) {
  return <ActivityComments targetType={targetType} targetId={targetId} overModal={overModal} />;
}

export default memo(function ActivityDetailPage({ group, id, onBack, onClose, onMiss }: {
  group: ActivityGroupKey;
  id: number;
  /** 머리 줄의 뒤로(묶음 목록으로). */
  onBack: () => void;
  /** 카드 안에서 상세를 닫을 때(게임으로 가기 등 · GameDetailCloseContext). */
  onClose: () => void;
  /** 서버에 없을 때 — 라우터가 목록을 그린다. */
  onMiss: () => void;
}) {
  const user = useAppStore((s) => s.user);
  const isAdmin = !!user && isAdminRole(user.roles);
  const [item, setItem] = useState<ActivityItem | null>(null);

  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  useEffect(() => { void api.pingAccess(GROUP_SCREEN_CODE[group], `${group}#${id}`); }, []);
  useEffect(() => {
    if (item) return undefined;
    let cancelled = false;
    api.getActivityItem(GROUP_ITEM_KIND[group], id)
      .then((row) => {
        if (cancelled) return;
        const made = row.schedule ? scheduleItem(row.schedule)
            : row.leagueMatch ? leagueMatchItem(row.leagueMatch) : null;   // 알림(랭킹 변동)은 걷었다(GROUP_DEFS)
        if (made) setItem(made); else onMiss();
      })
      .catch(() => { if (!cancelled) onMiss(); });
    return () => { cancelled = true; };
  }, []);

  if (!item) return <div className="scr-activity-list"><LoadingMark /></div>;

  const g9 = GROUP_DEFS.find((d) => d.key === group);
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
        <div className="scr-activity-row-body">
          <GameDetailCloseContext.Provider value={onClose}>
            {item.kind === "schedule" ? (
              <div className="scr-activity-card-head-off">
                <ScheduleCard
                  schedule={item.schedule}
                  timeText={formatWhen(item.time, { clock: item.withClock })}
                  dateLabel={dateLabelOf(item)}
                  canEdit={!!user}
                  canDelete={!!user && (item.schedule.createdBy.id === user.id || isAdmin)}
                  onDeleted={onClose}
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
            ) : null}
          </GameDetailCloseContext.Provider>
        </div>
      </div>
    </div>
  );
});
