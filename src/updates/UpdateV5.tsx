/* 버전 5 안내 — 재생기 업데이트(2026-10-31, 요청: "버전 업 안내를 글자가 아니라 페이지로 · 5버전은 재생기 업데이트 설명 · 그래픽 업그레이드 전후 비교샷 ·
 * 드래그 줌인아웃 부드러워진 거랑 폰 발열 감소도 · 모바일은 전후를 위아래로").
 * 비교 그림은 scplay scripts/showcase-shot.mjs 로 찍은 같은 장면·같은 순간이다(이전 = 10-29 그래픽 손질 앞 재생기 · 이후 = 11-01 재질 결 아틀라스 판 · --atlas spr).
 * (11-01 되요청: "건물 넥서스 중심으로 밀집 · 공격 온 유닛 더 많이 · 럴커 파뱃 메딕 베슬 레이스 추가 골리앗 빼기" → "스타게이트 캐리어 뮤탈 다크아칸(기술) 배틀 제거 · 더 클로즈업") — 배율 6.2 클로즈업 1600×1300. */
const IMG = `${import.meta.env.BASE_URL}updates/v5/`;

/** 한 컷 전후(2026-10-31, 요청: "유닛 나열은 필요 없을 듯 · 한 컷" → "플토 본진 · 건물들과 파일런 포톤캐논 · 거기에 저그랑 테란이 쳐들어간 그림"). */
function Compare() {
  return (
    <div className="scr-up-compare">
      {(["before", "after"] as const).map((k) => (
        <figure key={k} className={`scr-up-shot is-${k}`}>
          <img src={`${IMG}tossmain-${k}.webp`} alt={`재생기 ${k === "before" ? "이전" : "이후"} 화면`} loading="lazy" decoding="async" width={1600} height={1300} />
          <figcaption>{k === "before" ? "이전" : "이후"}</figcaption>
        </figure>
      ))}
    </div>
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
