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
          검색 조건의 칸마다 무엇을 넣으면 무엇이 나오는지 — 경기를 <b>찾는 법</b>입니다.
          재생 화면의 도구·단축키는 재생 화면 안의 사용법이 말합니다.
        </p>
      </header>

      {/* 경기 찾기 — 검색폼(GameSearchForm · 2026-10-20) 판으로 고쳐 썼다(요청: "사용법 수정"). 옛 한 줄 검색(띄어쓰기·붙여 쓰기) 설명은 걷었다 —
          옛 검색어가 담긴 고리로 들어오면 폼이 알아서 칸으로 나눈다. */}
      <section id="guide-search" className="scr-guide-sec">
        <h2 className="scr-guide-h2">경기 찾기</h2>
        <p className="scr-guide-lede">
          게임 목록 위 <strong>검색 조건</strong>을 눌러 펼치고, 칸마다 원하는 것을 넣은 뒤 <b>검색</b>을 누릅니다.
          칸끼리는 <strong>모두 맞는</strong> 경기만 남습니다.
        </p>

        <h3 className="scr-guide-h3">칸마다 하는 일</h3>
        <div className="scr-guide-q">
          <Q q="선수">넣은 사람이 <b>모두 뛴</b> 경기 — <code>팍규</code> <code>Rex</code>를 넣으면 둘이 같이 있었던 판(같은 편인지는 안 가립니다)</Q>
          <Q q="맵">넣은 맵 <b>중 한 곳</b>에서 한 경기 — <code>투혼</code> <code>빨무</code>는 둘 중 아무 데나</Q>
          <Q q="종족">고른 종족이 <b>그 판에 있었던</b> 경기 — 여럿 고르면 그 종족들이 다 있었던 판</Q>
          <Q q="유형">팀 인원 — <code>2:3</code>은 <b>3:2</b>도 함께 걸립니다(개인전은 빠집니다)</Q>
          <Q q="유닛·건물·스킬">넣은 것이 <b>모두 나온</b> 경기 — 한 기라도 떴으면 걸립니다 · 원어(<code>Carrier</code>)도 됩니다</Q>
          <Q q="게임번호">넣은 번호 <b>중 하나</b> — 번호는 시작 시각 <code>년월일시분초</code> 12자리(<code>261019213105</code> = 26년 10월 19일 21:31:05)라 <b>앞자리만</b> 넣어도 됩니다(<code>261019</code> → 그날 경기 전부)</Q>
        </div>

        <h3 className="scr-guide-h3">한 사람에게 몰아 묻기 — <b>한 사람이 직접</b></h3>
        <p className="scr-guide-sub">
          위 칸들은 <strong>그 판에 있었나</strong>까지만 묻습니다. <b>한 사람이 직접</b> 줄은 한 걸음 더 갑니다 —
          <strong> 그 사람이 그 종족으로, 그 유닛을 직접</strong> 했나입니다. <b>조건 추가</b>로 사람마다 줄을 더합니다.
        </p>
        <div className="scr-guide-q">
          <Q q="기수 · 테란">기수가 <b>테란으로</b> 한 경기</Q>
          <Q q="팍규 · 프로토스 · 캐리어">팍규가 <b>프로토스로 캐리어까지</b> 뽑은 경기</Q>
          <Q q="팍규 · 캐리어 / 타센 · 저그">줄마다 <b>사람마다</b> 따로 겁니다 — 둘 다 맞는 경기</Q>
        </div>
        <div className="scr-guide-note">
          <b>선수 칸의 <code>팍규</code> + 유닛 칸의 <code>캐리어</code>와, 한 사람 줄의 <code>팍규 · 캐리어</code>는 다릅니다.</b> 앞은 팍규가
          있고 <i>누군가</i> 캐리어를 뽑은 경기(상대가 뽑았어도 걸립니다), 뒤는 <b>팍규가</b> 뽑은 경기입니다.
        </div>
        <div className="scr-guide-note">
          <b>띄어쓰기는 칸마다 다릅니다.</b> <b>선수</b>·<b>게임번호</b> 칸은 띄어쓰기도 값을 끊습니다 —
          <code>팍규 Rex</code>는 두 사람입니다. <b>맵</b>·<b>유닛·건물·스킬</b> 칸은 이름에 띄어쓰기가 있어
          (<code>Fighting Spirit</code> · <code>사이오닉 스톰</code>) <b>쉼표로만</b> 끊습니다. 어느 칸이든 <kbd>,</kbd>로 끊으면 됩니다.
        </div>
        <div className="scr-guide-note">
          칸에 치면 자동완성이 뜹니다 — <kbd>엔터</kbd>·<kbd>탭</kbd>·<kbd>,</kbd>로 값을 칩으로 담고, 빈 칸에서 <kbd>엔터</kbd>를 한 번 더 치면 찾습니다.
          고른 조건은 접힌 줄에 칩으로 남고, 칩의 <kbd>×</kbd>로 그 조건만 바로 뺄 수 있습니다.
        </div>
      </section>

      <div className="scr-guide-back">
        <button type="button" className="scr-rect-btn" onClick={closeGuide}>
          닫기
        </button>
      </div>
    </div>
  );
}
