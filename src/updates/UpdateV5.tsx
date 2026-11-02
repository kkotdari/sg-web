/* 버전 5 안내 — 재생기 업데이트(2026-10-31, 요청: "버전 업 안내를 글자가 아니라 페이지로 · 5버전은 재생기 업데이트 설명 · 그래픽 업그레이드 전후 비교샷 ·
 * 드래그 줌인아웃 부드러워진 거랑 폰 발열 감소도 · 모바일은 전후를 위아래로").
 * 비교 그림은 scplay scripts/showcase-shot.mjs 로 찍은 같은 장면·같은 순간이다(이전 = 10-29 그래픽 손질 앞 재생기 · 이후 = 11-02 재질 판).
 * (11-01 플토 본진 전투 한 컷 → 11-02 "비교샷은 전투샷을 취소하고 각 종족별 비포 애프터로" — 아래 Compare 의 종족 셋으로 갈았다.) */
const IMG = `${import.meta.env.BASE_URL}updates/v5/`;

/** ★ 종족별 전후(2026-11-02, 요청: "비교샷은 전투샷을 취소하고 각 종족별 비포 애프터로 · 배율은 8배 · 충분히 집약해서") — 테란·프로토스·저그 본진 클로즈업
 *  (scplay showcase-shot 테란8·토스8·저그8 · 이전 = 10-29 그래픽 손질 앞 재생기 · 이후 = 11-02 재질 판). 종족마다 [이전 | 이후](좁으면 위아래). */
const RACES: [key: string, name: string][] = [["terran", "테란"], ["protoss", "프로토스"], ["zerg", "저그"]];
function Compare() {
  return (
    <>
      {RACES.map(([race, name]) => (
        <section key={race} className="scr-up-race">
          <h4 className="scr-up-race-name">{name}</h4>
          <div className="scr-up-compare">
            {(["before", "after"] as const).map((k) => (
              <figure key={k} className={`scr-up-shot is-${k}`}>
                <img src={`${IMG}${race}-${k}.webp`} alt={`${name} 재생기 ${k === "before" ? "이전" : "이후"} 화면`} loading="lazy" decoding="async" width={1400} height={1191} />
                <figcaption>{k === "before" ? "이전" : "이후"}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/* (2026-10-31 되요청: "글자는 간단히 딱 두 줄만 · 1. 통계에 팀전 티어가 추가됐어요 · 2. 재생기 그래픽이 개선되고 드래그 줌이 가벼워졌어요") — 두 줄 + 전후 한 컷. */
export default function UpdateV5() {
  return (
    <div className="scr-up">
      <span className="scr-up-ver">VERSION 5</span>
      <ol className="scr-up-lines">
        <li><span className="scr-up-num">1</span>통계에 팀전 티어가 추가됐어요</li>
        <li><span className="scr-up-num">2</span>재생기 그래픽이 개선되고 드래그·줌이 가벼워졌어요</li>
      </ol>
      <Compare />
    </div>
  );
}
