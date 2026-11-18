import { useCallback, useEffect, useRef, useState } from "react";
import { PracticeKeys, PracticeRoom, useReplayMap } from "scplay";
import { Keyboard } from "lucide-react";
import { api, type PracticeBoard, type PracticeBoards, type PracticeRecordIn, type PracticeRecordReply } from "../../api/client";
import { useIsMobile } from "../../hooks/useIsMobile";
import { navigateTo, parseRoute } from "../../utils/route";

/* ★ 연습실(2026-11-17) — 들어오면 **연습 과제 카드**를 고른다(요청: "연습실 들어가면 연습과제 선택창 뜨고 카드로 선택하게 깔끔하게 · 일단 빨무 견제 연습이라고
   하나 만들고 지금 만든거 연결 · 대신 TESTER 에게는 오픈 · 그 외에는 오픈예정 배지 띄우고 비활성화"). 주소: /practice(카드) · /practice/<과제>(놀이).
   놀이 본체는 재생기 패키지(scplay PracticeRoom)다 — 여기서는 빨무 지도(서버가 고른 해시 → 재생기와 같은 지도 받기)만 넘긴다.
   ★ 정식 오픈(2026-11-17, 요청: "미니게임 요소 · 개인별 단축키 설정 기억하기 · 다되면 정식으로 오픈해서 배포") — TESTER 제한을 걷고 누구나 · 카드 아래에
   모드별(초반 · 중반) 기록표(사람마다 최고 · 내 최고와 등수) · 명령 키는 계정에 기억(sg-api /practice/prefs) · 턴이 끝나면 기록을 적는다(전체 최고면 서버가 모두에게 푸시). */
interface PracticeTask { key: string; title: string; desc: string; tags: string[] }
const TASKS: PracticeTask[] = [
  {
    key: "drop", title: "빨무 견제 연습",
    /* 넷째 판(2026-11-17) — 턴제 미니게임: 연습기가 모드 · 종족마다 유닛 · 업그레이드를 준비해 두고(생산 · 연구 없음) 준비 15초 → 드랍 30초 · 점수 기록. */
    desc: "턴제 미니게임 — 연습기가 준비한 유닛(초반 · 중반)으로 준비 1분 · 드랍 1분 안에 한 번 드랍해서 일꾼을 잡아요. 점수 = 잡은 일꾼 × 10 − 잃은 유닛 값 · 수송선을 들키면 일꾼이 12기씩 도망가요.",
    tags: ["빨무", "드랍", "턴제 · 점수", "초반 · 중반"],
  },
];

export default function PracticeScreen() {
  const [item, setItem] = useState<string | null>(() => parseRoute().item);
  useEffect(() => {
    const onPop = (): void => { if (parseRoute().screen === "practice") setItem(parseRoute().item); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const task = TASKS.find((t) => t.key === item) ?? null;
  const open = (t: PracticeTask): void => { navigateTo(`/practice/${t.key}`, { notify: false }); setItem(t.key); };
  const back = (): void => { navigateTo("/practice", { notify: false }); setItem(null); };
  /* 명령 키 — 계정에 기억(요청: "개인별 단축키 설정 기억하기"). 연습실 첫 화면 · 과제가 **한 상태**를 나눠 쓴다(첫 화면에서 바꾸고 바로 과제를 열어도 그 키) ·
     바꾸면 잠깐 모았다 적는다. 옛: 과제(PracticePlay)가 저 혼자 받고 적었다. */
  const [keys, setKeys] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    api.getPracticePrefs().then((p) => { if (live && p.keys && Object.keys(p.keys).length) setKeys(p.keys); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  const saveT = useRef<number | null>(null);
  const onKeys = useCallback((k: Record<string, string>): void => {
    setKeys(k);
    if (saveT.current !== null) window.clearTimeout(saveT.current);
    saveT.current = window.setTimeout(() => { api.putPracticePrefs(k).catch(() => undefined); }, 600);
  }, []);
  /* 이용 기록(2026-11-18, 요청: "연습실 이용 로그 · access history · 연습실 들어온 거랑 단축키 설정, 어느 연습을 했다 정도까지만") — 접속 기록에 화면 코드 그대로.
     들어옴은 App 의 화면 기록(practice) · prac_play(턴 시작 · "P 중반 BL") · prac_keys(단축키 바꿈). 기록이 안 돼도 놀이는 그대로. */
  const onLog = useCallback((code: string, detail: string): void => { api.pingAccess(code, detail).catch(() => undefined); }, []);
  /* ★ 단축키 창은 연습실 첫 화면에(2026-11-18, 지적: "연습실에 단축키 설정은 연습실 화면에서 안 보이는 것 같아 · 견제연습 설정이 아니라") — 모든 과제 공통 ·
     옛: 견제 연습 설정 판의 '단축키' 줄(걷음 · 놀이 중 위 줄 [단축키]는 남김). */
  const [keysOpen, setKeysOpen] = useState(false);
  if (task) return <PracticePlay task={task} onBack={back} keys={keys} onKeys={onKeys} onLog={onLog} />;
  return (
    <div className="scr-screen">
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">연습실</h1>
          <button type="button" className="scr-compact-rect-btn scr-practice-keys-btn" onClick={() => setKeysOpen(true)} title="모든 연습 공통 — 공통 명령 · 수송선 · 유닛별 명령 카드">
            <Keyboard size={15} aria-hidden /> 단축키 설정
          </button>
        </div>
      </div>
      {keysOpen && <PracticeKeys keys={keys} onKeys={onKeys} onLog={onLog} onClose={() => setKeysOpen(false)} />}
      <div className="scr-practice-cards">
        {TASKS.map((t) => (
          <button key={t.key} type="button" className="scr-practice-card" onClick={() => open(t)} aria-label={`${t.title} 시작`}>
            <span className="scr-practice-card-head">
              <b className="scr-practice-card-title">{t.title}</b>
            </span>
            <span className="scr-practice-card-desc">{t.desc}</span>
            <span className="scr-practice-card-tags">{t.tags.map((g) => <i key={g}>{g}</i>)}</span>
          </button>
        ))}
      </div>
      <PracticeBoardsView />
    </div>
  );
}

const RACE_KO: Record<string, string> = { T: "테란", P: "프로토스", Z: "저그" };
/** 모드별 기록표(요청: "레코드 남겨서 모드별(초반/중반) 점수 기록해서 훈련선택방 아래 표시") — 사람마다 최고 한 줄 · 위에서 열 · 내 최고와 등수. */
function PracticeBoardsView() {
  const [boards, setBoards] = useState<PracticeBoards | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    api.getPracticeRecords().then((b) => { if (live) setBoards(b); }).catch(() => { if (live) setBoards(null); });
    return () => { live = false; };
  }, []);
  if (boards === undefined) return null;
  if (boards === null) return <p className="scr-hint scr-hint-left">기록표를 못 받았어요.</p>;
  const one = (title: string, b: PracticeBoard) => (
    <section className="scr-practice-board">
      <h2 className="scr-practice-board-title">{title}<span>{b.plays}판</span></h2>
      {b.top.length === 0 ? <p className="scr-practice-board-empty">아직 기록이 없어요 — 첫 기록의 주인공이 되어 보세요.</p> : (
        <ol className="scr-practice-board-list">
          {b.top.map((r) => (
            <li key={r.memberId} className={r.rank === 1 ? "is-first" : undefined}>
              <b className="scr-practice-rank">{r.rank}</b>
              <span className="scr-practice-name">{r.nickname}</span>
              <i className="scr-practice-race">{RACE_KO[r.race] ?? r.race}</i>
              <span className="scr-practice-detail">일꾼 {r.kills} · −{r.lostPts}</span>
              <b className="scr-practice-score">{r.score}</b>
            </li>
          ))}
        </ol>
      )}
      {b.mine && <p className="scr-practice-mine">내 최고 <b>{b.mine.best}</b>점 · {b.mine.rank}등 · {b.mine.plays}판</p>}
    </section>
  );
  return (
    <div className="scr-practice-boards">
      {one("빨무 견제 · 초반", boards.early)}
      {one("빨무 견제 · 중반", boards.mid)}
    </div>
  );
}

function PracticePlay({ task, onBack, keys, onKeys, onLog }: {
  task: PracticeTask; onBack: () => void;
  keys: Record<string, string> | null; onKeys: (k: Record<string, string>) => void; onLog: (code: string, detail: string) => void;
}) {
  const [hash, setHash] = useState<string | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const isMobile = useIsMobile();
  useEffect(() => {
    let live = true;
    api.getPracticeMapHash("빨무").then((h) => { if (live) setHash(h); }).catch((e: unknown) => { if (live) { setHash(null); setErr(e instanceof Error ? e.message : "지도를 못 받았어요"); } });
    return () => { live = false; };
  }, []);
  const map = useReplayMap(hash ?? null);
  /* 한 턴 끝 — 기록을 적고 답(내 최고 · 전체 최고 · 갱신)을 놀이판에 돌려준다. 전체 최고면 서버가 모두에게 푸시한다. */
  const onResult = useCallback((r: PracticeRecordIn): Promise<PracticeRecordReply | null> =>
    api.postPracticeRecord(r).catch(() => null), []);
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
        <PracticeRoom map={map ?? null} keys={keys} onKeys={onKeys} onResult={onResult} onLog={onLog} />
      </div>
    </div>
  );
}
