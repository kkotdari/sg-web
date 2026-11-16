/* ★ 설문 공통 양식(2026-11-16, 요청: "설문 결과 보는 창 제어판에 추가해줘 · 앞으로 설문조사 다양하게 생길 수 있으니 공통 양식으로") —
   설문 하나 = 아래 PollDef 한 줄. 답 받기(components/polls/PollSheet — 아래쪽에 뜨는 판)와 결과 보기(modals/PollResultsModal — 제어판 '설문 결과')가
   같은 정의를 읽는다. 서버(sg-api /polls)는 열쇠 · 고른 번호(1 ~ 10) · 의견만 쥔다 — 문항 · 고르기 글은 여기에만 있다.
   새 설문: POLLS 맨 앞에 한 줄 더하고 띄울 화면에 <PollSheet def={pollDef("열쇠")} /> 를 둔다(열쇠를 새로 — 옛 답은 그대로 남고 결과 창에서 계속 보인다).
   한 사람에 한 번(서버가 안다) · 닫기는 이번 방문만 숨긴다. */
export interface PollDef {
  /** 서버 열쇠 — 영문 · 숫자 · `_.-` 40자까지(바꾸면 새 설문이다). */
  readonly key: string;
  /** 결과 창 목록에 보일 짧은 이름. */
  readonly title: string;
  /** 문항 — `**낱말**` 은 굵게. */
  readonly question: string;
  /** 문항 아래 강조 한 줄(없어도 된다). */
  readonly emphasis?: string;
  /** 고르기 글 — 1번부터(2 ~ 10개). */
  readonly choices: readonly string[];
  /** 의견 칸 안내 글 — 없으면 의견 칸을 안 둔다. */
  readonly commentHint?: string;
  /** 고르기가 한 줄 눈금(1 = 한쪽 끝 ~ N = 다른 끝)이면 결과 창이 평균을 보인다. */
  readonly scale?: boolean;
  /** 어디에 뜨나(결과 창 설명용). */
  readonly where: string;
  /** 시작한 날("YYYY-MM-DD"). */
  readonly since: string;
}

export const POLLS: readonly PollDef[] = [
  {
    key: "wpa-order-2026-11",
    title: "11월 실력(WPA) 순서",
    question: "11월 실력(WPA)의 **순서**가 맞다고 생각하시나요?",
    emphasis: "티어가 아닌 순서만 봐주세요!",
    choices: ["대부분 맞다", "반 이상 맞다", "반 정도 맞다", "반 이상 틀리다", "대부분 틀리다"],
    commentHint: "틀리다면 어느 부분이 틀린지 적어주세요",
    scale: true,
    where: "통계 화면 아래쪽",
    since: "2026-11-15",
  },
];

const BY_KEY = new Map(POLLS.map((p) => [p.key, p]));
/** 열쇠로 정의 찾기 — 없으면 null(정의를 지운 옛 설문 · 결과 창은 번호로 보인다). */
export function pollDef(key: string): PollDef | null {
  return BY_KEY.get(key) ?? null;
}

/** 문항의 `**굵게**` 를 조각으로 — 짝수 자리는 보통 글, 홀수 자리는 굵게. */
export function questionParts(q: string): string[] {
  return q.split("**");
}
