/* 버전 5.1 안내(2026-11-02, 요청: "버전 5.1 안내팝업 · 1. 가로모드 지원(앱에서만) 내가 준 사진 사용 · 2. 최신버전으로 업데이트한 그래픽 개선 비교샷").
 * 가로 그림 = 받은 앱 가로 전체화면 스크린샷 · 비교 그림 = scplay docs/portfolio/showcase-20261102-518abb5(이전 = 10-29 재생기 · 이후 = 11-02 재질·크립·바닥 판)
 * 의 같은 장면·같은 순간(scripts/showcase-run.mjs). 꼴은 UpdateV5 와 같다(두 줄 + 그림). */
const IMG = `${import.meta.env.BASE_URL}updates/v51/`;

const RACES: [key: string, name: string][] = [["terran", "테란"], ["protoss", "프로토스"], ["zerg", "저그"]];

function Compare() {
  return (
    <>
      {RACES.map(([race, name]) => (
        <section key={race} className="scr-up-race">
          <h4 className="scr-up-race-name">{name}</h4>
          <div className="scr-up-compare">
            {(["before", "after"] as const).map((k) => (
              <figure key={k} className={`scr-up-shot is-${k}`} style={{ aspectRatio: "1400 / 1116" }}>
                <img src={`${IMG}${race}-${k}.webp`} alt={`${name} 재생기 ${k === "before" ? "이전" : "이후"} 화면`} loading="lazy" decoding="async" width={1400} height={1116} />
                <figcaption>{k === "before" ? "이전" : "이후"}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function UpdateV51() {
  return (
    <div className="scr-up">
      <span className="scr-up-ver">VERSION 5.1</span>
      <ol className="scr-up-lines">
        <li><span className="scr-up-num">1</span>재생기 가로 모드를 지원해요(앱에서만)</li>
      </ol>
      <figure className="scr-up-shot scr-up-wide" style={{ aspectRatio: "1600 / 738" }}>
        <img src={`${IMG}landscape.webp`} alt="앱 가로 모드 재생기 화면" loading="lazy" decoding="async" width={1600} height={738} />
      </figure>
      <ol className="scr-up-lines" start={2}>
        <li><span className="scr-up-num">2</span>재생기 그래픽이 더 좋아졌어요</li>
      </ol>
      <Compare />
    </div>
  );
}
