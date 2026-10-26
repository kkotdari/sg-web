import { memo, useState, type ReactNode } from "react";
import { CalendarDays, ExternalLink, Paperclip } from "lucide-react";
import PhotoViewer from "../../components/common/PhotoViewer";
import { shareThumb } from "../../utils/kakaoShare";
import { cx, formatBytes } from "../../utils/format";
import { formatWhen } from "../../utils/date";
import { api } from "../../api/client";
import type { Schedule, ScheduleFile, ScheduleWrite } from "../../types";
import BlockDocCard, { type DocHead, type DocSpec } from "./BlockDocCard";
import { imgSrc } from "../../utils/imgSrc";

/* ★ 일정 카드 = 블록 문서 카드(BlockDocCard) + 일정 머리(일시)(2026-10-26 공통화, 요청: "자유게시판 만들어줘 · 일정 폼 재사용(공통화)").
   늘 편집 상태 · 저장 단추 · 남의 고침 합치기 · 요소 편집은 BlockDocCard 가 하고, 여기는 일정만의 것(일시 줄 · 옛 본문 · 서버 길)만 든다. */

function whenTextOf(date: string, time: string | null): string {
  const day = formatWhen(date);
  return time ? `${day} ${time}` : day;
}
function whenText(schedule: Schedule): string {
  return whenTextOf(schedule.scheduledDate, schedule.scheduledTime);
}

function WhenLine({ head, editing, onChange }: { head: DocHead; editing: boolean; onChange: (part: Partial<DocHead>) => void }) {
  const [whenOpen, setWhenOpen] = useState(false);
  return editing && whenOpen ? (
    <span className="scr-schedule-when-edit" onClick={(e) => e.stopPropagation()} role="presentation">
      <input
        className="scr-sb-line" type="date" value={head.date} autoFocus
        onChange={(e) => onChange({ date: e.target.value })}
      />
      <input
        className="scr-sb-line" type="time" value={head.time}
        onChange={(e) => onChange({ time: e.target.value })}
        onBlur={() => setWhenOpen(false)}
      />
    </span>
  ) : (
    <span
      className={cx(editing && "scr-sb-editable")}
      role={editing ? "button" : undefined} tabIndex={editing ? 0 : undefined}
      onClick={editing ? (e) => { e.stopPropagation(); setWhenOpen(true); } : undefined}
      onKeyDown={editing ? (e) => {
        if (e.key === "Enter") { e.preventDefault(); setWhenOpen(true); }
      } : undefined}
    >
      {whenTextOf(head.date, head.time || null)}
    </span>
  );
}

const IMAGE_NAME = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const isImageFile = (f: ScheduleFile): boolean =>
  f.url.startsWith("data:image/") || IMAGE_NAME.test(f.name);

function SchedulePhotos({ photos }: { photos: ScheduleFile[] }) {
  const [open, setOpen] = useState<ScheduleFile | null>(null);
  return (
    <>
      <ul className={cx("scr-schedule-photos", photos.length === 1 && "scr-schedule-photos-one")}>
        {photos.map((f) => (
          <li key={f.url}>
            <button
              type="button" className="scr-schedule-photo"
              onClick={(e) => { e.stopPropagation(); setOpen(f); }}
              aria-label={`${f.name} 크게 보기`}
            >
              <img src={imgSrc(f.url)} alt={f.name} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <PhotoViewer src={open.url} alt={open.name} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function LegacyBody({ schedule }: { schedule: Schedule }) {
  const photos = schedule.files.filter(isImageFile);
  const docs = schedule.files.filter((f) => !isImageFile(f));
  return (
    <>
      {schedule.content && <p className="scr-schedule-content">{schedule.content}</p>}

      {schedule.linkUrl && (
        <a
          className="scr-schedule-link"
          href={schedule.linkUrl} target="_blank" rel="noreferrer noopener"
        >
          <ExternalLink size={13} aria-hidden />
          <span className="scr-schedule-link-text">{schedule.linkUrl}</span>
        </a>
      )}

      {docs.length > 0 && (
        <ul className="scr-schedule-files">
          {docs.map((f) => (
            <li key={f.url}>
              <a className="scr-schedule-file-link" href={imgSrc(f.url)} download={f.name} target="_blank" rel="noreferrer noopener">
                <Paperclip size={13} aria-hidden />
                <span className="scr-schedule-file-link-name">{f.name}</span>
                <span className="scr-schedule-file-size">{formatBytes(f.size)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {photos.length > 0 && <SchedulePhotos photos={photos} />}
    </>
  );
}

export const SCHEDULE_SPEC: DocSpec<Schedule, ScheduleWrite> = {
  kind: "schedule",
  icon: <CalendarDays size={16} aria-hidden />,
  label: "일정",
  headKeys: ["title", "date", "time"],
  headOf: (s) => ({ title: s.title, date: s.scheduledDate, time: s.scheduledTime ?? "" }),
  serverKeyOf: (s) => JSON.stringify([s.title, s.scheduledDate, s.scheduledTime, s.blocks ?? []]),
  ready: (h) => !!h.title.trim() && !!h.date,
  writeOf: (h, blocks, expectedUpdatedAt) => ({
    title: h.title.trim(), scheduledDate: h.date, scheduledTime: h.time || null, expectedUpdatedAt, blocks,
  }),
  get: (id) => api.getSchedule(id),
  update: (id, payload) => api.updateSchedule(id, payload),
  remove: (id) => api.deleteSchedule(id),
  share: (schedule) => {
    const when = whenText(schedule);
    return {
      title: schedule.title,
      description: when,
      ...shareThumb("schedule"),
      link: `${window.location.origin}/schedules/${schedule.id}`,
      fallbackText: `[스타게이트] ${schedule.title} — ${when}`,
    };
  },
  toolsLabel: "일정 도구",
  deleteTitle: "일정 삭제",
  deleteMessage: "이 일정을 삭제할까요? 달린 댓글과 첨부파일도 함께 사라져요.",
  byline: (s) => `${s.createdBy.nickname} 등록`,
  HeadLine: WhenLine,
  legacy: (s) => <LegacyBody schedule={s} />,
};

type ScheduleCardProps = {
  schedule: Schedule;
  timeText?: ReactNode;
  dateLabel?: string;
  canEdit: boolean;
  canDelete: boolean;
  onDeleted: (id: number) => void;
  footer?: ReactNode;
};

export default memo(function ScheduleCard({ schedule, ...rest }: ScheduleCardProps) {
  return <BlockDocCard spec={SCHEDULE_SPEC} doc={schedule} {...rest} />;
}, (a, b) => (
  a.schedule === b.schedule && a.canEdit === b.canEdit && a.canDelete === b.canDelete
  && a.dateLabel === b.dateLabel && a.timeText === b.timeText
));
