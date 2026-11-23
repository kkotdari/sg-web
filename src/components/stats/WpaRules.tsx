import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ModalHash from "../../utils/modalHash";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { formatAgo, serverMs } from "../../utils/date";
import { cx } from "../../utils/format";

/* ★ WPA 계산 조건 목록(2026-11-16, 요청: "현재 들어가고 있는 조건을 목록화해서 wpa 컬럼 안에 ? 로 누르면 볼 수 있게 ·
   예: 이미 빈사 상태인 사람의 유닛 건물을 잡은 건 점수에 거의 들어가지 않습니다 · 이렇게 하나하나 다 확인해서 부족한 조건을 팀원들이 건의할 수 있게") —
   sg-api 의 지금 셈(wpa.py · tier.py · truthmix.py · service._tier_games)을 하나씩 확인해 쉬운 말로 옮겼다. **서버 셈을 바꾸면 여기도 같이 고친다**
   (번호는 건의에서 "13번" 처럼 가리키는 데 쓴다 — 차례를 바꾸면 번호도 바뀐다). 건의는 sg-api /suggestions(주제 SUGGEST_TOPIC) · 운영자는 제어판 '건의함'.
   ★ 2026-11-16 저녁(요청: "헬프 아이콘 제거 · 내용은 WPA란? 툴팁에 아래 붙여넣기") — 목록은 통계 'WPA란?' 말풍선(StatGrid WpaHelp) 아래에 실리고,
   이 창은 그 말풍선의 '건의하기'가 askOnly 로 연다(건의 칸 · 내가 보낸 건의만). askOnly 가 아니면 옛 모양(목록 + 건의) 그대로.
   ★ 경기 수준(옛 이름 판 수준) 두 줄(같은 날 · sg-api quality.py — "판의 질이 들어가야 할 듯 · 1.2 로 · 운영은 원인이라 개인 점수엔 이중 반영") — 번호가 하나씩 밀린다. */
export const SUGGEST_TOPIC = "wpa-rules";

interface RuleSection { title: string; items: readonly string[] }
export const WPA_RULES: readonly RuleSection[] = [
  {
    title: "이길 확률을 재는 법",
    items: [
      "매 분마다 두 편의 상태로 이길 확률을 잽니다 — 병력(자원값) · 일꾼 수 · 지금까지 주고받은 피해 · 본진(처음 홀)이 남은 수 · 상대 건물을 본 정도. 누가 했는지는 보지 않고 상태만 봅니다.",
      "확률 모형은 그 달 판에 앞 달 판을 반씩 줄여 더해(한 달 전 ×0.5 · 두 달 전 ×0.25 …) 만들고, 내 판을 뺀 모형으로 잽니다. 내 판 결과가 내 점수에 새지 않게요.",
      "같은 상태라도 초반 · 중반 · 후반마다 무게가 다릅니다.",
      "WPA는 내 플레이로 우리 편 이길 확률이 오르내린 만큼의 합입니다. 한 판에서 한 편이 얻은 만큼 다른 편이 잃습니다.",
    ],
  },
  {
    title: "싸움 — 공격 · 방어",
    items: [
      "상대 병력 · 일꾼 · 건물을 잡으면 +(공격)입니다. 같이 때렸으면 때린 양의 비율로 나눕니다.",
      "내 병력 · 일꾼 · 건물을 잃으면 −(방어)입니다. 같이 잃었으면 잃은 양의 비율로 나눕니다.",
      "팽팽할 때 잡고 잃은 것일수록 크게, 승부가 이미 기운 뒤의 것은 거의 0입니다. 판을 가른 한타가 가장 큽니다.",
      "병력은 인구가 아니라 자원값으로 셉니다. 인구 1의 값이 유닛마다 달라서예요(질럿 50 · 히드라 100).",
      "상대 본진(처음 홀)을 깨면 크게 +입니다. 빨무처럼 자원에 붙은 자리는 다시 지을 수 없어서요.",
      "이미 빈사 상태인 사람의 유닛 · 건물을 잡은 건 점수에 들어가지 않습니다 — 잡은 쪽 +도, 잃은 쪽 −도 없어요. 무너지는 그 순간의 싸움은 셉니다.",
      "빈사 = 일꾼 0, 또는 본진이 없고 다시 지을 돈(해처리 300 · 그 외 400)도 없음, 또는 캐는 자원이 최고 때의 1/3 아래로 줄고 돈도 없음 — 이 상태가 1분 넘게 이어질 때입니다.",
      "빈사 상태인 사람이 남은 방어로 상대를 잡은 건 셉니다(실제로 상대가 약해졌으니까요).",
    ],
  },
  {
    title: "합류",
    items: [
      "싸움에 온 우리 편 머릿수가 상대보다 적으면(몰매) 그 손실을 '상대 한 명 평균만큼 못 싸운 만큼' 나눠 집니다 — 안 온 동료는 합류 −, 왔지만 덜 싸운 사람도 모자란 만큼, 잘 싸운 사람은 0.",
      "그때 다른 곳에서 싸우던 동료, 이미 빈사인 동료는 합류 감점이 없습니다(올 수 없었으니까요).",
      "머릿수가 같거나 많은 싸움은 합류 감점이 없습니다.",
      "'싸움에 왔다'는 그 싸움에서 잃거나 입힌 자원값이 50 이상일 때입니다.",
    ],
  },
  {
    title: "정찰",
    items: [
      "상대 건물을 보고 있으면(최근 3분 안에 본 상대 건물 비율) 이길 확률이 오른 만큼 +입니다. 그 달 판에서 정찰이 실제로 승패를 가른 만큼만 크게 쳐요. 상대 편은 같은 만큼 −입니다.",
      "상대 유닛 위치 파악(유닛 정찰)은 기록만 하고 아직 점수에 넣지 않았습니다.",
    ],
  },
  {
    title: "점수에 안 들어가는 것",
    items: [
      "뽑기만 하고 싸우지 않은 병력(생산 자체) — 싸움에 들어가 잡거나 잃을 때 반영돼요.",
      "이기고 진 것 자체 — 진 판에서도 잘하면 +, 이긴 판에서도 못하면 −입니다.",
      "종족 — 같은 사람이라도 종족에 따라 나온 차이를 따로 보정하지 않습니다.",
      "APM · EAPM.",
      "자리 지키기(장악) — 넣어 봤다가 실력과 안 맞아 뺐습니다.",
      "내 운영(채취 · 자원 쓰기) · 내 EAPM — 이미 싸움 결과(WPA)에 들어 있어 내 점수에 따로 더하지 않습니다. 경기 수준(모두 같은 배수)에만 씁니다.",
    ],
  },
  {
    title: "판 점수 → 인분 · 티어",
    items: [
      "판 점수는 WPA에 편 인원을 곱해 2:2와 4:4를 같은 눈금으로 맞추고, 한 판이 너무 크게 튀지 않게 상한을 둡니다.",
      "인분은 판 점수 평균을 1인분(평균)에 견준 값입니다. 판이 적으면 1인분 쪽으로 당깁니다(그 사람 전체 판 수 ÷ (판 수 + 6)만큼만 믿어요). 종족 칸은 그 종족 판이 적을수록 그 사람 전체 실력 쪽으로 당깁니다.",
      "종합의 주종 티어는 주종족(그 기간 판의 30% 이상 종족 · 없으면 가장 많이 한 종족) 판만 합칩니다 — 부종족 판은 안 들어가고, 주종족 판이 10판 이상일 때 티어가 붙습니다. 옆의 WPA/티어는 모든 종족 판을 합친 값입니다.",
      "동료가 세거나 상대가 약해서 쉽게 오른 점수는 그만큼 뺍니다.",
      "월 조회는 앞 달(최대 4달)을 줄여 함께 셉니다 — 한 달 전 ×0.75, 두 달 전 ×0.56…",
      "경기 수준: 그 기간 모든 판의 초반(2~10분) 운영(분당 채취 · 쥔 돈)과 EAPM을 반씩 섞어 2026년 7월(= 100%)과 견주고, 모두의 인분에 같은 비율로 곱합니다. 7월보다 20% 좋으면 ×1.2, 나쁘면 그만큼 내려요 — 다 같이 늘면 다 같이 오릅니다.",
      "티어 문턱: 1.8인분 이상 1티어 · 1.0 이상 2티어 · 0.7 이상 3티어 · 그 아래 4티어. 한 달 10판 이상이어야 티어가 붙습니다.",
    ],
  },
  {
    title: "빠지는 판",
    items: [
      "2분 미만 판 · 1:1 · 회원이 아닌 사람이 낀 판 · 리플레이 분석 기록이 없는 판.",
    ],
  },
];

interface Mine { id: number; text: string; createdAt: string }

export default function WpaRulesModal({ onClose, askOnly = false }: { onClose: () => void; askOnly?: boolean }) {
  useLockBodyScroll();
  const user = useAppStore((s) => s.user);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mine, setMine] = useState<Mine[] | null>(null);
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    api.getMySuggestions(SUGGEST_TOPIC).then((r) => { if (alive) setMine(r); }).catch(() => { if (alive) setMine([]); });
    return () => { alive = false; };
  }, [user]);
  const send = async (): Promise<void> => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setMsg(null);
    try {
      await api.addSuggestion(SUGGEST_TOPIC, t);
      setText("");
      setMsg({ ok: true, text: "건의가 들어갔어요. 고마워요!" });
      setMine(await api.getMySuggestions(SUGGEST_TOPIC).catch(() => mine ?? []));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "보내지 못했어요. 잠시 뒤 다시 눌러 주세요." });
    } finally {
      setBusy(false);
    }
  };
  let no = 0;
  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="wpa-rules" onClose={onClose} />
      <div className="scr-modal scr-modal-md scr-wpar" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={askOnly ? "WPA 계산 조건 건의" : "WPA 계산 조건"}>
        <div className="scr-modal-head">
          <span>{askOnly ? "WPA 계산 조건 건의" : "WPA 계산 조건"}</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body scr-wpar-body">
          {askOnly ? (
            <p className="scr-wpar-lead">빠졌거나 이상한 조건을 알려 주세요. 'WPA란?'의 계산 조건 번호로 가리켜도 돼요.</p>
          ) : (
            <p className="scr-wpar-lead">지금 점수에 들어가는 규칙이에요. 빠졌거나 이상한 조건이 있으면 맨 아래에 건의해 주세요(번호로 가리켜도 돼요).</p>
          )}
          {!askOnly && WPA_RULES.map((sec) => (
            <section key={sec.title} className="scr-wpar-sec">
              <h3 className="scr-wpar-title">{sec.title}</h3>
              <ol className="scr-wpar-list">
                {sec.items.map((it) => { no += 1; return <li key={no} value={no}>{it}</li>; })}
              </ol>
            </section>
          ))}
          <section className="scr-wpar-sec scr-wpar-ask">
            <h3 className="scr-wpar-title">건의하기</h3>
            {user ? (
              <>
                <textarea className="scr-poll-text scr-wpar-text" value={text} maxLength={1000} rows={3}
                  placeholder="예: 드랍을 막아 낸 것도 점수에 넣어 주세요 / 7번 조건은 이런 경우에 이상해요"
                  onChange={(e) => setText(e.target.value)} />
                <div className="scr-wpar-send-row">
                  {msg && <span className={cx("scr-wpar-msg", msg.ok ? "is-ok" : "is-err")}>{msg.text}</span>}
                  <button type="button" className="scr-rect-btn scr-poll-send" disabled={!text.trim() || busy} onClick={() => void send()}>
                    {busy ? "보내는 중…" : "건의 보내기"}
                  </button>
                </div>
                {mine && mine.length > 0 && (
                  <details className="scr-wpar-mine">
                    <summary>내가 보낸 건의 {mine.length}개</summary>
                    <ul>
                      {mine.map((s) => (
                        <li key={s.id}><span>{s.text}</span><em>{formatAgo(serverMs(s.createdAt))}</em></li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <p className="scr-wpar-lead">로그인하면 건의할 수 있어요.</p>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
