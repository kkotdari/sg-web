/* 버전 5 안내 — 재생기 업데이트(2026-10-31, 요청: "버전 업 안내를 글자가 아니라 페이지로 · 5버전은 재생기 업데이트 설명 · 그래픽 업그레이드 전후 비교샷 ·
 * 드래그 줌인아웃 부드러워진 거랑 폰 발열 감소도 · 모바일은 전후를 위아래로").
 * 비교 그림은 scplay scripts/showcase-shot.mjs 로 찍은 같은 장면·같은 순간이다(이전 = 10-29 그래픽 손질 앞 재생기 · 이후 = 지금). */
const IMG = `${import.meta.env.BASE_URL}updates/v5/`;

/** 한 컷 전후(2026-10-31, 요청: "유닛 나열은 필요 없을 듯 · 한 컷" → "플토 본진 · 건물들과 파일런 포톤캐논 · 거기에 저그랑 테란이 쳐들어간 그림"). */
function Compare() {
  return (
    <div className="scr-up-compare">
      {(["before", "after"] as const).map((k) => (
        <figure key={k} className={`scr-up-shot is-${k}`}>
          <img src={`${IMG}tossmain-${k}.webp`} alt={`재생기 ${k === "before" ? "이전" : "이후"} 화면`} loading="lazy" decoding="async" width={1600} height={1490} />
          <figcaption>{k === "before" ? "이전" : "이후"}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function UpdateV5() {
  return (
    <div className="scr-up">
      <div className="scr-up-hero">
        <span className="scr-up-ver">VERSION 5</span>
        <h2>팀전 티어가 생기고, 재생기가 새로워졌어요</h2>
        <p>통계에 팀전 티어를 더하고, 재생기 그래픽을 다시 굽고, 화면 끌기·확대를 부드럽게 다듬고, 폰에서 덜 뜨겁게 했어요.</p>
      </div>

      <section className="scr-up-sec">
        <h3 className="scr-up-sec-title"><span className="scr-up-num">1</span>팀전 티어</h3>
        <ul className="scr-up-list">
          <li>통계에 <b>티어</b> 칸이 생겼어요. 팀전에서 보통 몇 인분을 하는지로 1~4티어를 매겨요.</li>
          <li>인분은 EAPM에 교환비 보정과 승패 보정을 곱해 내요. 1.6인분 이상 1티어 · 1.0 이상 2티어 · 0.8 이상 3티어 · 그 아래 4티어예요.</li>
          <li>티어에 마우스를 얹거나 누르면 달별 변화와 근거값(EAPM · 교환비 보정 · 승패 보정)을 볼 수 있어요.</li>
          <li>팀전 전체 · 맵 전체로 볼 때 나오고, 열 판부터 매겨요.</li>
        </ul>
      </section>

      <section className="scr-up-sec">
        <h3 className="scr-up-sec-title"><span className="scr-up-num">2</span>재생기 그래픽 업그레이드</h3>
        <ul className="scr-up-list">
          <li><b>빛과 그림자</b> 원작처럼 왼쪽 위에서 빛이 들고, 부품 사이에 그림자가 져서 입체감이 살아났어요.</li>
          <li><b>광택</b> 금속과 장갑에 은은한 광택이 돌아요.</li>
          <li><b>색</b> 프로토스 금색과 미네랄 색을 원작에 가깝게 다듬었어요.</li>
          <li><b>폭발</b> 프로토스 건물·기계가 플라즈마 구체로 터져요.</li>
        </ul>
        <Compare />
        <p className="scr-up-note">저그와 테란이 함께 쳐들어간 프로토스 본진 — 같은 장면, 같은 순간이에요.</p>
      </section>

      <section className="scr-up-sec">
        <h3 className="scr-up-sec-title"><span className="scr-up-num">3</span>부드러워진 끌기·확대</h3>
        <ul className="scr-up-list">
          <li>핀치·휠 확대가 계단 없이 이어지고, 손을 떼면 관성으로 자연스럽게 미끄러져요.</li>
          <li>확대·축소하는 동안 지형과 안개가 늦게 따라오거나 튀던 문제를 고쳤어요.</li>
          <li>조금만 움직여도 바로 끌려요.</li>
        </ul>
      </section>

      <section className="scr-up-sec">
        <h3 className="scr-up-sec-title"><span className="scr-up-num">4</span>폰 발열 감소</h3>
        <ul className="scr-up-list">
          <li>유닛·건물 그림을 서버에서 미리 구워 받아요. 폰이 직접 그림을 굽지 않아요.</li>
          <li>폰 성능에 맞춰 그리는 해상도와 빛 번짐 같은 효과를 조절해 그래픽 부담을 줄였어요.</li>
        </ul>
      </section>
    </div>
  );
}
