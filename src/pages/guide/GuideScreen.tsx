import { X } from "lucide-react";
import { navigateTo, wasPushed } from "../../utils/route";

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="scr-guide-qrow">
      <span className="scr-guide-qin">{q}</span>
      <span className="scr-guide-qout">{children}</span>
    </div>
  );
}

export default function GuideScreen({ onClose }: { onClose?: () => void } = {}) {
  const closeGuide = (): void => {
    if (onClose) { onClose(); return; }
    if (wasPushed()) { window.history.back(); return; }
    navigateTo("/games", { replace: true });
  };
  return (
    <div className="scr-screen scr-guide">
      <header className="scr-guide-top">
        <button
          type="button" className="scr-guide-close"
          onClick={closeGuide}
          aria-label="사용법 닫기" title="닫기"
        >
          <X size={18} />
        </button>
        <span className="scr-guide-eyebrow">사용법</span>
        <h1 className="scr-title">찾고, 보고, 손에 익히기</h1>
        <p className="scr-guide-deck">
          검색창에 무엇을 치면 무엇이 나오는지 — 경기를 <b>찾는 법</b>입니다.
          재생 화면의 도구·단축키는 재생 화면 안의 사용법이 말합니다.
        </p>
      </header>

      <section id="guide-search" className="scr-guide-sec">
        <h2 className="scr-guide-h2">경기 찾기</h2>
        <p className="scr-guide-lede">
          검색창에 치는 것은 <strong>그 판에 무엇이 있었나</strong>입니다 — 누가 뛰었나,
          어느 맵이었나, 무엇이 나왔나.
        </p>

        <div className="scr-guide-q">
          <Q q="팍규"><b>팍규</b>가 뛴 경기 전부</Q>
          <Q q="팍규 Rex">둘이 <b>같이 있었던</b> 경기 — 띄어쓰기는 <b>‘그리고’</b>입니다(같은 편인지는 안 가립니다)</Q>
          <Q q="기수 조조 정구">셋이 다 있었던 경기</Q>
          <Q q="미친마법사 캐리어">미친마법사가 있고 <b>캐리어가 나온</b> 경기 — 한 기라도 떴으면 걸립니다</Q>
          <Q q="크리스 투혼">크리스가 <b>투혼</b>에서 뛴 경기</Q>
          <Q q="Carrier">원어로 쳐도 같습니다 — 자동완성도 <b>carr</b>만 치면 뜹니다</Q>
          <Q q="저그">그 판에 <b>저그를 고른 사람</b>이 있었던 경기 — 종족도 그냥 칩니다</Q>
        </div>

        <h3 className="scr-guide-h3">한 사람에게 몰아 묻기 — <b>붙여 씁니다</b></h3>
        <p className="scr-guide-sub">
          띄어 쓰면 <strong>그 판에 있었나</strong>까지만 묻습니다. <strong>붙여 쓰면</strong> 한
          걸음 더 갑니다 — <strong>그 사람이 직접 했나</strong>입니다. 띄어쓰기 전까지가
          <b> 한 조건</b>이고, 그 안에 사람 이름이 섞여 있으면 나머지는 전부 그 사람 이야기가
          됩니다. 이름이 앞이든 뒤든 상관없습니다.
        </p>
        <div className="scr-guide-q">
          <Q q="기수테란">기수가 <b>테란으로</b> 한 경기</Q>
          <Q q="저그기수">같은 말입니다 — <b>기수가 저그로</b> 한 경기(이름이 뒤에 와도 됩니다)</Q>
          <Q q="팍규프로토스캐리어">팍규가 <b>프로토스로 캐리어까지</b> 뽑은 경기 — 얼마든지 이어 붙입니다</Q>
          <Q q="팍규캐리어 타센저그">띄어 쓰면 <b>사람마다</b> 따로 겁니다 — 둘 다 맞는 경기</Q>
          <Q q="태섭벌처테란 드라군 저그기수">세 조건을 <b>모두</b> 만족하는 경기</Q>
        </div>
        <div className="scr-guide-note">
          <b>치는 대로 자동완성이 끊어 줍니다.</b> <kbd>엔터</kbd>나 <kbd>탭</kbd>은 고른 낱말을{" "}
          <b>같은 조건에 이어 붙이고</b>, <kbd>스페이스</kbd>는 붙인 뒤 <b>조건을 끊습니다</b>.
          찾는 것은 후보 목록이 닫힌 뒤의 <kbd>엔터</kbd>입니다 — 한 조건이 낱말 여럿이라,
          첫 낱말에서 바로 찾아 버리면 아직 반도 안 친 조건으로 목록이 뒤집힙니다.
        </div>
        <div className="scr-guide-note">
          <b><code>팍규 캐리어</code>와 <code>팍규캐리어</code>는 다릅니다.</b> 앞은 팍규가
          있고 <i>누군가</i> 캐리어를 뽑은 경기(상대가 뽑았어도 걸립니다), 뒤는 <b>팍규가</b>
          뽑은 경기입니다. 상대의 캐리어를 상대한 판을 찾고 싶다면 앞쪽이 맞습니다.
        </div>

      </section>

      <div className="scr-guide-back">
        <button type="button" className="scr-btn scr-btn-secondary" onClick={closeGuide}>
          닫기
        </button>
      </div>
    </div>
  );
}
