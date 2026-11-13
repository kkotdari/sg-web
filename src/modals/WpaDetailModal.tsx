import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ModalHash from "../utils/modalHash";
import MonthCalendar from "../components/common/MonthCalendar";
import ChipInput, { type ChipOpt } from "../components/common/ChipInput";
import { LoadingMark } from "../components/common/Feedback";
import { api } from "../api/client";
import { useAppStore } from "../store/appStore";
import { useIsMobile } from "../hooks/useIsMobile";
import { useLockBodyScroll } from "../utils/bodyScrollLock";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { memberMatchesTerm, normalizeSearchText } from "../utils/memberSearch";
import { currentMonthValue, MONTH_PERIOD_RE, todayStr } from "../utils/date";
import { cx } from "../utils/format";
import { WpaHelp } from "../pages/stats/StatGrid";
import { combinedTier } from "../pages/stats/StatTrend";
import {
  CLAN_TYPE, MAP_DEFAULT, MAP_TABS, PERIOD_ALL, PERIOD_TODAY, SIZE_TABS, SOLO_TYPE, statRange, useTodayFrom, type MapTab, type SizeTab,
} from "../pages/stats/statQuery";
import type { BaseRace, MemberStats, MemberStatsEntry, TierEntry } from "../types";

/* ★ WPA 상세보기(2026-11-13, 요청: "관리자페이지 데이터 섹션에 WPA 상세보기 만들어주고 팝업에서 통계랑 똑같이 필터 지정가능하게 하고 + 종족필터까지 추가하고 ·
   나오는거는 판수/승률/WPA는 각 5개항목, 전체로 총 6개/APM/EAPM/티어/티어인분 컬럼으로 표시 · 종족은 선택한거만(전체 또는 선택)표시") —
   통계 화면과 같은 요청(sg-api /stats · 기간 · 인원 · 맵 · statQuery)으로 받는다. 종족 탭이 전체면 그 사람의 모든 판(overall · 종합 티어 tier),
   종족을 고르면 그 종족으로 뛴 판(byRace · 종족 티어 tierByRace)만 — 그 판이 없는 사람은 빠진다.
   WPA 항목은 통계 WPA 팝업과 같은 인분(1 = 그 조회 판 평균 · sg-api tier._wpa_inbun) · 전체는 티어에 드는 WPA 배수(cbt · 인분) — 칸에 얹으면 판당 %p.
   ★ 장악은 걷었다(같은 날, 지적: "제어판에서 보니까 장악이 확실히 이상한데 · 약한 사람들이 장악이 높게 나와" → "장악은 그럼 화면과 덤퍼 등에서도 빼야겠네") — 항목 넷 + 전체.
   머리를 누르면 그 칸으로 정렬(한 번 더 누르면 거꾸로) · 처음은 티어인분 높은 순. */

type RaceTab = "all" | BaseRace;
/* ★ 날짜 지정(2026-11-13, 요청: "관리자 wpa 창에서는 날짜를 정확히 지정해서 볼수있게") — 통계의 기간 셋(달 · 전체기간 · 오늘)에 더해 시작 · 끝 날짜(끝 날 포함). */
const PERIOD_CUSTOM = "custom";
const RACE_TABS: { value: RaceTab; label: string }[] = [
  { value: "all", label: "전체" }, { value: "테란", label: "테란" }, { value: "프로토스", label: "프로토스" }, { value: "저그", label: "저그" },
];
/** WPA 항목 넷 — inbun = wpaInbun [방어 · 공격 · 합류 · 정찰] 자리 · pct = wpaParts(%p) [공격 · 생존 · 합류 · 정찰] 자리.
 *  옛 다섯짜리 응답(… · 장악 · 정찰)이면 정찰은 한 칸 뒤(partAt — sg-api 와 배포 때가 어긋나도 정찰 자리가 맞게). */
const PARTS = [
  { label: "방어", inbun: 0, pct: 1, tip: "내 걸 잃으면 내려가요. 덜 잃을수록 좋아요." },
  { label: "공격", inbun: 1, pct: 0, tip: "상대 병력 · 일꾼 · 건물을 잡으면 올라요." },
  { label: "합류", inbun: 2, pct: 2, tip: "우리 편이 머릿수에서 밀려 싸울 때, 비어 있던 내가 안 가면 내려가요." },
  { label: "정찰", inbun: 3, pct: 3, tip: "상대 건물을 보고 있으면 올라요." },
] as const;
const partAt = (arr: number[] | null | undefined, i: number): number | undefined => (arr ? arr[i === 3 && arr.length >= 5 ? 4 : i] : undefined);

type ColKey = "name" | "plays" | "rate" | "wpa0" | "wpa1" | "wpa2" | "wpa3" | "wpa" | "apm" | "eapm" | "tier" | "inbun";
interface Row { id: string; name: string; s: MemberStats; t: TierEntry | null }

const num = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const inbunOf = (t: TierEntry | null): number | null => num(t?.stdInbun ?? t?.inbun);
function valueOf(r: Row, k: ColKey): number | string | null {
  switch (k) {
    case "name": return r.name;
    case "plays": return r.s.plays;
    case "rate": return r.s.plays > 0 ? r.s.winRate : null;
    case "wpa": return num(r.t?.cbt);
    case "apm": return num(r.s.avgApm);
    case "eapm": return num(r.s.avgEapm);
    case "tier": return num(r.t?.tier);
    case "inbun": return inbunOf(r.t);
    default: return num(partAt(r.t?.wpaInbun, PARTS[Number(k.slice(3))].inbun));
  }
}
/** 판당 %p 글자(칸에 얹을 때) — 없으면 빈 글자. */
const pctTip = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? `판당 ${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%p` : "";

export default function WpaDetailModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const mobile = useIsMobile();
  const members = useAppStore((s) => s.members);
  const activeMembers = useMemo(() => members.filter((m) => m.status !== "withdrawn" && m.status !== "suspended"), [members]);
  const userOpts = useMemo<ChipOpt[]>(() => activeMembers.map((m) => ({ value: m.nickname, member: m })), [activeMembers]);

  /* 조건 — 통계 화면과 같은 기본값(이번 달 · 팀전 전체 · 맵 전체) · 주소에는 안 남긴다(관리자 팝업). */
  const [period, setPeriod] = useState(currentMonthValue());
  const [size, setSize] = useState<SizeTab>("team");
  const [mapTab, setMapTab] = useState<MapTab>(MAP_DEFAULT);
  const [race, setRace] = useState<RaceTab>("all");
  const [users, setUsers] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: ColKey; asc: boolean }>({ key: "inbun", asc: false });
  const todayFrom = useTodayFrom(period === PERIOD_TODAY);
  const [dFrom, setDFrom] = useState(() => `${todayStr().slice(0, 8)}01`);   // 날짜 지정(위 ★) — 처음은 이번 달 1일 ~ 오늘
  const [dTo, setDTo] = useState(() => todayStr());

  /* 서버엔 늘 클랜원 전부 — 유저 칩 · 종족 탭은 받은 줄을 거르기만 한다(바꿔도 다시 안 불러온다 · 통계 화면과 같은 규칙). */
  const custom = period === PERIOD_CUSTOM;
  const queryKey = JSON.stringify({
    ids: activeMembers.map((m) => m.id).sort(), period, day: period === PERIOD_TODAY ? todayFrom : "", size, map: mapTab,
    from: custom ? dFrom : "", to: custom ? dTo : "",
  });
  const debouncedKey = useDebouncedValue(queryKey, 300);
  const [data, setData] = useState<{ key: string; byId: Record<string, MemberStatsEntry> } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const q = JSON.parse(debouncedKey) as { ids: string[]; period: string; day: string; size: SizeTab; map: MapTab; from: string; to: string };
    if (q.ids.length === 0) { setData({ key: debouncedKey, byId: {} }); return undefined; }
    let cancelled = false;
    setError("");
    const r = q.period === PERIOD_CUSTOM ? { from: q.from, to: q.to } : statRange(q.period, q.day);
    api.getGameResultStats({
      memberIds: q.ids, dateFrom: r.from, dateTo: r.to, race: "all",
      matchType: q.size === "1" ? SOLO_TYPE : CLAN_TYPE,
      teamSize: q.size === "team" ? undefined : Number(q.size),
      mapGroup: q.map === "all" ? undefined : q.map,
      tierByRace: true,
    }).then((res) => {
      if (cancelled) return;
      const byId: Record<string, MemberStatsEntry> = {};
      res.members.forEach((e) => { byId[e.memberId] = e; });
      setData({ key: debouncedKey, byId });
    }).catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "자료를 불러오지 못했어요.");
      setData({ key: debouncedKey, byId: {} });
    });
    return () => { cancelled = true; };
  }, [debouncedKey]);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const terms = users.map((u) => normalizeSearchText(u).trim()).filter(Boolean);
    const out: Row[] = [];
    for (const m of activeMembers) {
      if (terms.length > 0 && !terms.some((t) => memberMatchesTerm(m, t))) continue;
      const e = data.byId[m.id];
      if (!e) continue;
      /* 종족은 고른 것만(위 ★) — 전체면 모든 판 · 종합 티어(없으면 종족 티어를 판 수로 합친 것 · 통계와 같은 combinedTier) · 종족이면 그 종족 판 · 그 종족 티어. */
      const s = race === "all" ? e.overall : e.byRace?.[race];
      const t = race === "all" ? (e.tier ?? combinedTier(e.tierByRace)) : (e.tierByRace?.[race] ?? null);
      if (!s || s.plays <= 0) continue;
      out.push({ id: m.id, name: m.nickname, s, t: t ?? null });
    }
    const { key, asc } = sort;
    const dir = asc ? 1 : -1;
    return out.sort((a, b) => {
      const av = valueOf(a, key); const bv = valueOf(b, key);
      if (av === null || bv === null) {
        if (av !== bv) return av === null ? 1 : -1;   // 값 없는 사람은 늘 뒤로
      } else if (typeof av === "string" || typeof bv === "string") {
        const c = String(av).localeCompare(String(bv));
        if (c) return dir * c;
      } else if (av !== bv) {
        return dir * (av - bv);
      }
      /* 같으면 티어인분 높은 순 → 판 수 많은 순 → 이름 */
      const ai = inbunOf(a.t); const bi = inbunOf(b.t);
      if (ai !== bi) return ai === null ? 1 : bi === null ? -1 : bi - ai;
      return b.s.plays - a.s.plays || a.name.localeCompare(b.name);
    });
  }, [data, users, activeMembers, race, sort]);

  /* 머리 누르기 — 같은 칸이면 거꾸로 · 다른 칸이면 그 칸의 처음 차례(티어는 1티어부터 · 이름은 가나다 · 나머지는 큰 값부터). */
  const pick = (key: ColKey): void => setSort((cur) => (cur.key === key ? { key, asc: !cur.asc } : { key, asc: key === "tier" || key === "name" }));
  const head = (k: ColKey, label: ReactNode, o: { title?: string; className?: string; rowSpan?: number } = {}) => (
    <th key={k} rowSpan={o.rowSpan} className={cx("is-sort", sort.key === k && "is-on", o.className)} title={o.title}
      aria-sort={sort.key === k ? (sort.asc ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => pick(k)}>{label}{sort.key === k && <i aria-hidden>{sort.asc ? "↑" : "↓"}</i>}</button>
    </th>
  );
  const f2 = (v: number | null | undefined): string => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "-");
  const fInt = (v: number | null | undefined): string => (typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString() : "-");
  const loading = data === null || data.key !== debouncedKey || debouncedKey !== queryKey;

  return createPortal(
    <div className="scr-modal-overlay">
      <ModalHash hash="wpa-detail" onClose={onClose} />
      <div className={cx("scr-modal scr-wpad-modal", mobile && "is-full")}>
        <div className="scr-modal-head">
          <span>WPA 상세보기</span>
          <button className="scr-icon-btn" onClick={onClose} aria-label="닫기"><X size={14} /></button>
        </div>
        <div className="scr-modal-body scr-wpad-body">
          {/* 조건 — 통계 화면과 같은 기간 셋(배타) · 인원 탭 · 맵 탭 · 유저 칩 + 종족 탭(위 ★). */}
          <div className="scr-stats-period scr-wpad-period">
            <MonthCalendar
              value={MONTH_PERIOD_RE.test(period) ? period : currentMonthValue()} onChange={setPeriod}
              maxMonth={currentMonthValue()} idle={!MONTH_PERIOD_RE.test(period)} range className="scr-v2-toolbar-month"
            />
            <button type="button" className={cx("scr-compact-rect-btn", period !== PERIOD_ALL && "is-secondary")}
              aria-pressed={period === PERIOD_ALL} onClick={() => setPeriod(PERIOD_ALL)}>전체기간</button>
            <button type="button" className={cx("scr-compact-rect-btn", period !== PERIOD_TODAY && "is-secondary")}
              aria-pressed={period === PERIOD_TODAY} onClick={() => setPeriod(PERIOD_TODAY)} title="정오부터 다음 날 정오 전까지">오늘</button>
            <button type="button" className={cx("scr-compact-rect-btn", !custom && "is-secondary")}
              aria-pressed={custom} onClick={() => setPeriod(PERIOD_CUSTOM)} title="시작 · 끝 날짜를 골라 그 사이(끝 날 포함) 판만">날짜 지정</button>
            {custom && (
              <span className="scr-wpad-dates">
                <input type="date" className="scr-input scr-input-sm" aria-label="시작 날짜" value={dFrom} max={todayStr()}
                  onChange={(e) => { const v = e.target.value; if (v) { setDFrom(v); if (v > dTo) setDTo(v); } }} />
                <span aria-hidden>~</span>
                <input type="date" className="scr-input scr-input-sm" aria-label="끝 날짜" value={dTo} max={todayStr()}
                  onChange={(e) => { const v = e.target.value; if (v) { setDTo(v); if (v < dFrom) setDFrom(v); } }} />
              </span>
            )}
            <WpaHelp />
          </div>
          <div className="scr-line-tabs scr-stats-size-tabs" role="tablist" aria-label="팀 규모">
            {SIZE_TABS.map((t) => (
              <Fragment key={t.value}>
                {t.value === "1" && <span className="scr-line-tab-sep" aria-hidden>|</span>}
                <button type="button" role="tab" aria-selected={t.value === size}
                  className={cx("scr-line-tab-btn", t.value === size && "is-on")} onClick={() => setSize(t.value)}>{t.label}</button>
              </Fragment>
            ))}
          </div>
          <div className="scr-line-tabs scr-stats-size-tabs scr-stats-map-tabs" role="tablist" aria-label="맵">
            {MAP_TABS.map((t) => (
              <button key={t.value} type="button" role="tab" aria-selected={t.value === mapTab}
                className={cx("scr-line-tab-btn", t.value === mapTab && "is-on")} onClick={() => setMapTab(t.value)}>{t.label}</button>
            ))}
          </div>
          <div className="scr-line-tabs scr-stats-size-tabs scr-wpad-race-tabs" role="tablist" aria-label="종족">
            {RACE_TABS.map((t) => (
              <button key={t.value} type="button" role="tab" aria-selected={t.value === race}
                className={cx("scr-line-tab-btn", t.value === race && "is-on")} onClick={() => setRace(t.value)}>{t.label}</button>
            ))}
          </div>
          <div className="scr-stats-search scr-wpad-search">
            <ChipInput values={users} onChange={setUsers} options={userOpts} placeholder="유저 닉네임" />
          </div>

          {error && <div className="scr-err" role="alert">{error}</div>}
          <div className="scr-wpad-meta">{loading && data === null ? "" : `${rows.length}명`}</div>
          <div className={cx("scr-wpad-out", loading && data !== null && "is-busy")}>
            {data === null ? <LoadingMark /> : rows.length === 0 ? (
              loading ? <LoadingMark /> : <div className="scr-empty">결과가 없어요</div>
            ) : (
              <table className="scr-wpad-table">
                {/* 머리 두 줄 — WPA 한 칸 아래 항목 넷 + 전체(위 ★ — 처음 요청은 "각 5개항목, 전체로 총 6개" · 장악을 걷어 넷) · 나머지는 두 줄을 차지한다. */}
                <thead>
                  <tr>
                    {head("name", "이름", { rowSpan: 2, className: "is-name" })}
                    {head("plays", "판수", { rowSpan: 2 })}
                    {head("rate", "승률", { rowSpan: 2 })}
                    <th colSpan={PARTS.length + 1} className="is-group" title="승리 확률 기여 — 항목은 인분(1 = 이 조회 판 평균) · 칸에 얹으면 판당 %p">WPA</th>
                    {head("apm", "APM", { rowSpan: 2 })}
                    {head("eapm", "EAPM", { rowSpan: 2 })}
                    {head("tier", "티어", { rowSpan: 2 })}
                    {head("inbun", "티어인분", { rowSpan: 2, title: "티어의 잣대 — WPA 전체 × 승패 보정(인분)" })}
                  </tr>
                  <tr>
                    {PARTS.map((p, i) => head(`wpa${i}` as ColKey, p.label, { title: `${p.label} — ${p.tip}` }))}
                    {head("wpa", "전체", { title: "WPA 전체 — 티어에 드는 WPA 배수(인분)", className: "is-wpa-total" })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="is-name">{r.name}</td>
                      <td>{r.s.plays.toLocaleString()}</td>
                      <td>{r.s.plays > 0 ? `${r.s.winRate}%` : "-"}</td>
                      {PARTS.map((p) => (
                        <td key={p.label} title={pctTip(partAt(r.t?.wpaParts, p.pct))}>{f2(partAt(r.t?.wpaInbun, p.inbun))}</td>
                      ))}
                      <td className="is-wpa-total" title={pctTip(r.t?.wpa)}>{f2(r.t?.cbt)}</td>
                      <td>{fInt(r.s.avgApm)}</td>
                      <td>{fInt(r.s.avgEapm)}</td>
                      <td>{typeof r.t?.tier === "number" ? <b className={cx("scr-sg-tier", `is-t${Math.min(r.t.tier, 4)}`)}>{r.t.tier}</b> : "-"}</td>
                      <td>{f2(inbunOf(r.t))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
