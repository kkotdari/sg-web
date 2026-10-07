import { Fragment, type ReactNode } from "react";
import Avatar from "../common/Avatar";
import { cx } from "../../utils/format";
import { formatWhen, scheduledInstantMs, serverMs } from "../../utils/date";
import type { Challenge } from "../../types";

const RESPONSE_LABEL: Record<string, string> = {
  accepted: "수락", rejected: "거절", discarded: "버림", pending: "대기",
};

export type LetterPerson = {
  id: string;
  nickname: string;
  avatar: string | null;
  response?: string;
};

export function PartySide({ tag, members, highlight }: {
  tag: "From." | "To.";
  members: LetterPerson[];
  highlight?: Set<string>;
}) {
  if (members.length === 0) return null;
  return (
    <div className={`scr-challenge-party scr-challenge-party-${tag === "From." ? "from" : "to"}`}>
      <span className="scr-challenge-party-tag">{tag}</span>
      <div className="scr-challenge-party-who">
        <div className="scr-challenge-party-stack">
          {members.map((m) => {
            const mark = m.response ? RESPONSE_LABEL[m.response] : undefined;
            return (
              <span key={m.id} className="scr-challenge-party-slot">
                <Avatar size={44} className="scr-challenge-party-av" member={m} />
                {mark && (
                  <span className={`scr-challenge-party-badge scr-challenge-party-badge-${m.response}`}>
                    {mark}
                  </span>
                )}
              </span>
            );
          })}
        </div>
        <span className="scr-challenge-party-names">
          {members.map((m, i) => (
            <Fragment key={m.id}>
              {i > 0 && ", "}
              <span className={cx(highlight?.has(m.id) && "scr-roster-hit")}>{m.nickname}</span>
            </Fragment>
          ))}
        </span>
      </div>
    </div>
  );
}

export function ChallengeWords({ from, message }: { from: string; message: string }) {
  const mine = message.trim();
  if (!mine) return null;
  return (
    <div className="scr-challenge-words">
      <div className="scr-challenge-word scr-challenge-word-call">
        <p className="scr-challenge-word-text">{mine}</p>
        <div className="scr-challenge-word-who">— {from}</div>
      </div>
    </div>
  );
}

export function ChallengeWhen({ challenge }: { challenge: Challenge }) {
  const note = challenge.scheduledTimeNote.trim();
  return (
    <div className="scr-challenge-when">
      <span className="scr-challenge-when-value">
        {formatWhen(challenge.scheduledDate, { empty: "일정 미정" })}
      </span>
      {note && (
        <>
          <span className="scr-challenge-when-sep" aria-hidden>·</span>
          <span className="scr-challenge-when-value">{note}</span>
        </>
      )}
    </div>
  );
}

export function ChallengeReplies({ targets }: { targets: Challenge["targets"] }) {
  const said = targets.filter((t) => t.responseMessage.trim() !== "");
  if (said.length === 0) return null;
  return (
    <div className="scr-challenge-words scr-challenge-words-reply">
      {said.map((t) => (
        <div key={t.memberId} className="scr-challenge-word scr-challenge-word-reply">
          <p className="scr-challenge-word-text">{t.responseMessage}</p>
          <div className="scr-challenge-word-who">— {t.nickname}</div>
        </div>
      ))}
    </div>
  );
}

export function challengeOutcome(c: Challenge): { text: string; tone: string } {
  if (c.resultWinnerSide === "draw") return { text: "무승부", tone: "draw" };
  if (c.resultWinnerSide === "not_held") return { text: "미실시", tone: "expired" };
  if (c.resultWinnerSide === "creator" || c.resultWinnerSide === "target") {
    const won = c.resultWinnerSide === "creator"
      ? [c.createdBy.nickname, ...c.ownMembers.map((m) => m.nickname)]
      : c.targets.map((t) => t.nickname);
    return { text: `${won.join(", ")} 승`, tone: "win" };
  }
  if (c.status === "pending") return { text: "응답 기다리는 중", tone: "pending" };
  if (c.status === "confirmed") return { text: "준비중", tone: "accepted" };
  if (c.canceledBy) return { text: "취소", tone: "canceled" };
  if (c.targets.every((t) => t.response === "pending")) return { text: "만료", tone: "expired" };
  return { text: "성사 안 됨", tone: "rejected" };
}

const CHALLENGE_EXPIRE_MS = 24 * 60 * 60 * 1000;

function deadlineLeft(c: Challenge): string | null {
  if (c.status !== "pending") return null;
  const base = serverMs(c.createdAt) + CHALLENGE_EXPIRE_MS;
  const scheduled = scheduledInstantMs(c);
  const remain = (scheduled !== null ? Math.min(base, scheduled) : base) - Date.now();
  if (remain <= 0) return null;
  const minutes = Math.floor(remain / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간` : `${Math.max(1, minutes)}분`;
}

export function ChallengeOutcome({ challenge }: { challenge: Challenge }) {
  const { text, tone } = challengeOutcome(challenge);
  const left = deadlineLeft(challenge);
  return (
    <div className={`scr-challenge-outcome scr-challenge-outcome-${tone}`}>
      {text}
      {left && <span className="scr-challenge-outcome-deadline">{left} 후 마감</span>}
    </div>
  );
}

export function ChallengeLetter({
  challenge, schedule, when, foot, highlight,
}: {
  challenge: Challenge;
  schedule?: ReactNode;
  when?: ReactNode;
  foot?: ReactNode;
  highlight?: Set<string>;
}) {
  const fromSide: LetterPerson[] = [
    { id: challenge.createdBy.id, nickname: challenge.createdBy.nickname, avatar: challenge.createdBy.avatar },
    ...challenge.ownMembers.map((m) => ({ id: m.memberId, nickname: m.nickname, avatar: m.avatar })),
  ];
  const toSide: LetterPerson[] = challenge.targets.map((t) => ({
    id: t.memberId, nickname: t.nickname, avatar: t.avatar, response: t.response,
  }));
  const names = toSide.map((m) => m.nickname);
  const title = names.length > 0 ? `${names.join(", ")} 너 나와!` : "너 나와!";
  const hasReplies = challenge.targets.some((t) => t.responseMessage.trim() !== "");
  const rule = <div className="scr-challenge-rule" aria-hidden />;

  return (
    <>
      <div className="scr-modal-body scr-challenge-inbox-body">
        <div className="scr-challenge-title-row">
          <div className="scr-challenge-inbox-title">{title}</div>
          {when}
        </div>
        <PartySide tag="From." members={fromSide} highlight={highlight} />
        <ChallengeWords from={challenge.createdBy.nickname} message={challenge.message} />
        {schedule}
        {(hasReplies || toSide.length > 0) && rule}
        <ChallengeReplies targets={challenge.targets} />
        <PartySide tag="To." members={toSide} highlight={highlight} />
        {foot}
        {rule}
        <ChallengeOutcome challenge={challenge} />
      </div>
    </>
  );
}
