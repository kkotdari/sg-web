import { Trophy } from "lucide-react";
import KakaoShareButton from "../../components/common/KakaoShareButton";
import { cx } from "../../utils/format";
import { normalizeSearchText } from "../../utils/memberSearch";
import { shareThumb, type KakaoShareContent } from "../../utils/kakaoShare";
import type { RankingShiftEntry, RankingShift } from "../../types";
import { ActivityCard } from "./ActivityCard";

export function shiftLabel(e: RankingShiftEntry): { rank: string; delta: string; cls: string } {
  const rank = `${e.to}위`;
  if (e.from == null) return { rank, delta: "진입", cls: "scr-activity-shift-new" };
  const d = e.from - e.to;
  return {
    rank,
    delta: d > 0 ? `▲${d}` : `▼${-d}`,
    cls: d > 0 ? "scr-activity-shift-up" : "scr-activity-shift-down",
  };
}

export function shiftLabelText(e: RankingShiftEntry): string {
  const s = shiftLabel(e);
  return `${s.rank} ${s.delta}`;
}

export const RANK_SHIFT_TITLE = "랭크 변동";

const SECTION_LABELS: { matchType: string; label: string }[] = [
  { matchType: "0101", label: "개인전" },
  { matchType: "0102", label: "팀전" },
];

const sectionOf = (shift: RankingShift, matchType: string): RankingShiftEntry[] =>
  shift.sections.find((s) => s.matchType === matchType)?.shifts ?? [];

export function rankShiftShareContent(shift: RankingShift): KakaoShareContent {
  const summary = SECTION_LABELS
    .map(({ matchType, label }) => {
      const rows = sectionOf(shift, matchType);
      if (rows.length === 0) return null;
      return `${label} ${rows.slice(0, 2).map((e) => `${e.nickname} ${shiftLabelText(e)}`).join(" · ")}`;
    })
    .filter(Boolean)
    .join(" / ");
  return {
    title: RANK_SHIFT_TITLE,
    description: summary,
    ...shareThumb("notice"),
    link: `${window.location.origin}/?sv=rankingShift&sid=${shift.id}`,
    fallbackText: `[스타게이트] ${RANK_SHIFT_TITLE}\n${summary}`,
  };
}

/* 순위 변동 도구 — 늘 보이는 단추 줄(2026-10-22, 요청: "케밥 메뉴 쓰는 곳을 전부 항시 노출 버튼 툴박스로") · 옛 ⋯ 메뉴(공유)를 펼친 꼴. */
export function RankingShiftMenu({ shift }: { shift: RankingShift }) {
  return (
    <div className="scr-tools" role="toolbar" aria-label="순위 변동 도구">
      <KakaoShareButton className="scr-tools-btn" icon="share" label="공유" content={() => rankShiftShareContent(shift)} />
    </div>
  );
}

export default function RankingShiftCard({
  shift, timeText, dateLabel, actions, footer, highlightMemberIds, highlightTerms,
}: {
  shift: RankingShift;
  timeText?: string;
  dateLabel?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  highlightMemberIds?: Set<string>;
  highlightTerms?: string[];
}) {
  const cols = SECTION_LABELS.map((s) => ({ ...s, rows: sectionOf(shift, s.matchType) }));
  return (
    <ActivityCard
      dateLabel={dateLabel}
      icon={<Trophy size={16} aria-hidden />}
      label={RANK_SHIFT_TITLE}
      timeText={timeText}
      actions={actions}
      bodyClassName="scr-activity-shift-split"
      comment={footer}
    >
      {cols.map(({ label, rows }) => (
        <section className="scr-activity-shift-col" key={label}>
          <h4 className="scr-activity-shift-col-head">{label}</h4>
          {rows.length === 0 ? (
            <p className="scr-activity-shift-none">변동 없음</p>
          ) : (
            <ul className="scr-activity-shift-list">
              {rows.map((e) => {
                const rank = shiftLabel(e);
                return (
                  <li
                    key={`${e.memberId}-${e.to}`}
                    className={cx("scr-activity-shift-row",
                      (highlightMemberIds?.has(e.memberId)
                        || highlightTerms?.some((t) => normalizeSearchText(e.nickname).includes(t)))
                        && "scr-activity-shift-row-hl")}
                  >
                    <span className="scr-activity-shift-name">{e.nickname}</span>
                    <span className="scr-activity-shift-rank">{rank.rank}</span>
                    <span className={rank.cls}>{rank.delta}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </ActivityCard>
  );
}
