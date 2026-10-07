import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import RosterFace from "./RosterFace";
import { playMagicRise } from "../../utils/sfx";
import type { LeaguePoolMember } from "../../types";

const IN_MS = 520;
const HOLD_MS = 1700;
const FLY_MS = 620;
const HOLD_SCALE = 1.05;

const wait = (ms: number) => new Promise<void>((r) => { window.setTimeout(r, ms); });

export default function RosterIntro({ member, targetSelector, onDone }: {
  member: LeaguePoolMember;
  targetSelector: string;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let cancelled = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reduced) playMagicRise();

    const run = async () => {
      const anim = (frames: Keyframe[], duration: number, easing: string) =>
        el.animate(frames, { duration, easing, fill: "both" }).finished.catch(() => {});

      await anim(
        [
          { opacity: 0, transform: "translate(-50%, -50%) scale(0.78)" },
          { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
        ],
        reduced ? 1 : IN_MS, "cubic-bezier(.2,.8,.2,1)",
      );
      if (cancelled) return;
      if (reduced) {
        await wait(400);
      } else {
        await anim(
          [
            { transform: "translate(-50%, -50%) scale(1)" },
            { transform: "translate(-50%, -50%) scale(1.05)" },
          ],
          HOLD_MS, "linear",
        );
      }
      if (cancelled) return;

      const target = document.querySelector(targetSelector);
      if (target && !reduced) {
        const from = el.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const scale = (to.width / from.width) * HOLD_SCALE;
        const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
        const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
        await anim(
          [
            { opacity: 1, transform: `translate(-50%, -50%) scale(${HOLD_SCALE})` },
            {
              opacity: 1,
              transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`,
            },
          ],
          FLY_MS, "cubic-bezier(.4,0,.2,1)",
        );
      } else {
        await anim([{ opacity: 1 }, { opacity: 0 }], reduced ? 200 : 240, "ease-out");
      }
      if (!cancelled) doneRef.current();
    };
    void run();
    return () => { cancelled = true; };
  }, [targetSelector]);

  return createPortal(
    <div className="scr-league-rintro" aria-hidden>
      <div className="scr-league-rintro-card" ref={ref}>
        <RosterFace member={member} avatarSize={120} iconSize={56} />
      </div>
    </div>,
    document.body,
  );
}
