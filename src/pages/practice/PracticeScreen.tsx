import { useEffect, useState } from "react";
import { PracticeRoom, useReplayMap } from "scplay";
import { api } from "../../api/client";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAppStore } from "../../store/appStore";
import { isTesterRole } from "../../constants/roles";
import { navigateTo, parseRoute } from "../../utils/route";
import { cx } from "../../utils/format";

/* ★ 연습실(2026-11-17) — 들어오면 **연습 과제 카드**를 고른다(요청: "연습실 들어가면 연습과제 선택창 뜨고 카드로 선택하게 깔끔하게 · 일단 빨무 견제 연습이라고
   하나 만들고 지금 만든거 연결 · 대신 TESTER 에게는 오픈 · 그 외에는 오픈예정 배지 띄우고 비활성화"). 주소: /practice(카드) · /practice/<과제>(놀이).
   놀이 본체는 재생기 패키지(scplay PracticeRoom)다 — 여기서는 빨무 지도(서버가 고른 해시 → 재생기와 같은 지도 받기)만 넘긴다. */
interface PracticeTask { key: string; title: string; desc: string; tags: string[] }
const TASKS: PracticeTask[] = [
  {
    key: "drop", title: "빨무 견제 연습",
    /* 셋째 판(2026-11-17, 요청: "우리 홈피의 드랍연습도 맵하고 똑같이") — 연습맵 6판과 같은 판: 생산 · 테크가 다 지어진 내 기지에서 직접 뽑아 적 기지 일곱 곳을 드랍. */
    desc: "연습맵과 같은 판 — 생산 · 테크 건물이 다 지어진 내 기지에서 유닛 · 수송선을 직접 뽑아 적 기지 일곱 곳(초반 · 중반 타워 · 일꾼)을 드랍해요. 깃발로 자리 · 톱니로 설정 · Shift+F2~F4 화면 기억 · Ctrl+숫자 부대.",
    tags: ["빨무", "드랍", "생산 · 연구", "초반 · 중반"],
  },
];

export default function PracticeScreen() {
  const isTester = useAppStore((s) => !!s.user && isTesterRole(s.user.roles));
  const [item, setItem] = useState<string | null>(() => parseRoute().item);
  useEffect(() => {
    const onPop = (): void => { if (parseRoute().screen === "practice") setItem(parseRoute().item); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const task = TASKS.find((t) => t.key === item) ?? null;
  const open = (t: PracticeTask): void => { navigateTo(`/practice/${t.key}`, { notify: false }); setItem(t.key); };
  const back = (): void => { navigateTo("/practice", { notify: false }); setItem(null); };
  if (task && isTester) return <PracticePlay task={task} onBack={back} />;
  return (
    <div className="scr-screen">
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">연습실</h1>
        </div>
      </div>
      <div className="scr-practice-cards">
        {TASKS.map((t) => (
          <button key={t.key} type="button" className={cx("scr-practice-card", !isTester && "is-locked")} disabled={!isTester} onClick={() => open(t)}
            aria-label={isTester ? `${t.title} 시작` : `${t.title} — 오픈 예정`}>
            <span className="scr-practice-card-head">
              <b className="scr-practice-card-title">{t.title}</b>
              {!isTester && <span className="scr-practice-card-badge">오픈 예정</span>}
            </span>
            <span className="scr-practice-card-desc">{t.desc}</span>
            <span className="scr-practice-card-tags">{t.tags.map((g) => <i key={g}>{g}</i>)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PracticePlay({ task, onBack }: { task: PracticeTask; onBack: () => void }) {
  const [hash, setHash] = useState<string | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const isMobile = useIsMobile();
  useEffect(() => {
    let live = true;
    api.getPracticeMapHash("빨무").then((h) => { if (live) setHash(h); }).catch((e: unknown) => { if (live) { setHash(null); setErr(e instanceof Error ? e.message : "지도를 못 받았어요"); } });
    return () => { live = false; };
  }, []);
  const map = useReplayMap(hash ?? null);
  return (
    <div className="scr-screen">
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <button type="button" className="scr-compact-rect-btn is-secondary" onClick={onBack}>← 과제</button>
          <h1 className="scr-title scr-v2-toolbar-title">{task.title}</h1>
        </div>
      </div>
      {isMobile && <p className="scr-hint scr-hint-left">마우스 · 키보드로 하는 연습이에요 — PC 에서 열어 주세요.</p>}
      {hash === null && <p className="scr-hint scr-hint-left">{err || "빨무 지도(지형 포함)를 아직 못 찾았어요 — 빨무 판을 한 판 올리면 생겨요."}</p>}
      <div className="scr-practice-host">
        <PracticeRoom map={map ?? null} />
      </div>
    </div>
  );
}
