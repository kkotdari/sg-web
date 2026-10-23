import { useLayoutEffect, useRef, useState } from "react";

/** ★ 재생기 자리 로딩 판(2026-10-23, 요청: "상세 처음 들어올 때 카드형 스켈레톤 없이 바로 재생기가 뜨면 좋겠어 · 로딩으로") — 게임 · 지도를 받는 동안
 *  옛 흐린 네모(.scr-story-mapwait)·돌림표 대신 **재생기와 같은 꼴**(검은 판 + 띄운 글자 L O A D I N G · scplay 의 .scr-motion-simnote 그대로)을 세운다.
 *  키는 재생기 프레임과 같은 셈(scplay frameMaxH: 창 높이 − 판 위 문서 높이(상한 200) − 숨 쉴 자리 12 · 300~1400)이라 재생기가 들어서도 판이 안 들썩인다. */
export default function PlayerLoadShell() {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = (): void => {
      const above = Math.min(200, Math.max(0, el.getBoundingClientRect().top + window.scrollY));
      setH(Math.round(Math.min(1400, Math.max(300, window.innerHeight - above - 12))));
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return (
    <div ref={ref} className="scr-player-shell" style={h ? { height: h } : undefined}>
      <span className="scr-motion-simnote" role="status" aria-label="로딩 중">
        {"LOADING".split("").map((ch, i) => (
          <span key={i} className="scr-load-ch" style={{ ["--i" as string]: i } as React.CSSProperties} aria-hidden="true">{ch}</span>
        ))}
      </span>
    </div>
  );
}
