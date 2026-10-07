import { useEffect, useMemo, useState } from "react";
import { UserPlus, X, Monitor, CircleHelp, RotateCcw, ChevronDown, Flame } from "lucide-react";
import Avatar from "../../components/common/Avatar";
import Pagination from "../../components/common/Pagination";
import SearchFilterBar from "../../components/common/SearchFilterBar";
import { useUrlState } from "../../hooks/useUrlState";
import PillTabs from "../../components/common/PillTabs";
import FilterItem from "../../components/common/FilterItem";
import Select from "../../components/common/Select";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { LoadingMark } from "../../components/common/Feedback";
import CreateMemberModal from "../../modals/CreateMemberModal";
import MemberRosterImageField from "./MemberRosterImageField";
import MemberManageFields from "./MemberManageFields";
import { cx } from "../../utils/format";
import { useAppStore } from "../../store/appStore";
import { api } from "../../api/client";
import { ROLE_INFO, isAdminRole } from "../../constants/roles";
import { activeMemberSearchTerms, memberMatchesQuery, splitSearchTerms } from "../../utils/memberSearch";
import type { MemberRole, MemberStatus, ReplayNameMappingEntry, ReplayNameMappingKind } from "../../types";

const PAGE_SIZE = 20;

const ROLE_BADGE_ORDER: MemberRole[] = ["0202"];
const ROLE_BADGE_CLASS: Partial<Record<MemberRole, string>> = {
  "0202": "scr-status-admin",
};

function memberRoleBadges(roles: MemberRole[]): { role: MemberRole; label: string; className: string }[] {
  return ROLE_BADGE_ORDER
    .filter((r) => roles.includes(r))
    .map((r) => ({ role: r, label: ROLE_INFO[r], className: ROLE_BADGE_CLASS[r]! }));
}

type StatusFilter = "all" | MemberStatus;
const FILTER_OPTS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "pending", label: "승인대기" },
  { value: "active", label: "활성" },
  { value: "suspended", label: "정지" },
  { value: "withdrawn", label: "탈퇴" },
];

const STATUS_LABEL: Record<MemberStatus, string> = {
  pending: "승인대기",
  active: "활성",
  suspended: "정지",
  withdrawn: "탈퇴",
};

const FREQUENT_NON_MEMBER_MIN = 3;

const KIND_PICK_OPTS: { value: ReplayNameMappingKind; label: string }[] = [
  { value: "member", label: "회원" },
  { value: "unregistered", label: "비회원" },
  { value: "computer", label: "컴퓨터" },
];

interface PendingAction {
  title: string;
  message: string;
  confirmLabel: string;
  run: () => void;
}

export default function MembersScreen() {
  const members = useAppStore((s) => s.members);
  const currentUser = useAppStore((s) => s.user);
  const [filterRaw, setFilterRaw] = useUrlState("st", "all");
  const filter = filterRaw as StatusFilter;
  const setFilter = setFilterRaw as (v: StatusFilter) => void;
  const [query, setQuery] = useUrlState("u");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const isAdmin = !!currentUser && isAdminRole(currentUser.roles);
  const suggestions = useMemo(() => activeMemberSearchTerms(members), [members]);

  const [entries, setEntries] = useState<ReplayNameMappingEntry[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listReplayNameMappings()
      .then(setEntries)
      .catch((e) => setMapError(e instanceof Error ? e.message : "게임아이디 목록을 불러오지 못했어요."))
      .finally(() => setMapLoading(false));
  }, []);

  const rows = useMemo(() => {
    const list = members.filter((m) =>
      (filter === "all" || m.status === filter) &&
      memberMatchesQuery(m, query));
    return [...list].sort((a, b) => {
      const aTime = filter === "all" ? a.createdAt : a.updatedAt;
      const bTime = filter === "all" ? b.createdAt : b.updatedAt;
      return bTime.localeCompare(aTime);
    });
  }, [members, filter, query]);

  useEffect(() => { setPage(1); setExpandedIds(new Set()); }, [filter, query]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const idsByMember = useMemo(() => {
    const map = new Map<string, ReplayNameMappingEntry[]>();
    for (const e of entries) {
      if (e.kind !== "member" || !e.member) continue;
      const list = map.get(e.member.id) ?? [];
      list.push(e);
      map.set(e.member.id, list);
    }
    for (const list of map.values()) list.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
    return map;
  }, [entries]);

  const byRecency = (a: ReplayNameMappingEntry, b: ReplayNameMappingEntry) =>
    (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "");

  const rawNameMatches = (rawName: string) => {
    const terms = splitSearchTerms(query);
    if (terms.length === 0) return true;
    return terms.some((t) => rawName.toLowerCase().includes(t));
  };
  const [unresolvedSort, setUnresolvedSort] = useState<"recent" | "count">("recent");
  const unresolvedRows = useMemo(() => {
    const list = entries.filter((e) => e.kind === "unresolved" && rawNameMatches(e.rawName));
    if (unresolvedSort === "count") {
      return [...list].sort((a, b) =>
        (b.appearances ?? 0) - (a.appearances ?? 0) || byRecency(a, b));
    }
    return [...list].sort(byRecency);
  }, [entries, query, unresolvedSort]);
  const nonMemberRows = useMemo(() => {
    return entries.filter((e) => e.kind === "unregistered" && rawNameMatches(e.rawName)).sort(byRecency);
  }, [entries, query]);
  const frequentNonMemberRows = useMemo(
    () => nonMemberRows.filter((e) => (e.appearances ?? 0) >= FREQUENT_NON_MEMBER_MIN),
    [nonMemberRows],
  );
  const computerRows = useMemo(
    () => entries.filter((e) => e.kind === "computer" && rawNameMatches(e.rawName)).sort(byRecency),
    [entries, query],
  );

  const memberOptions = useMemo(
    () => members
      .filter((m) => m.status === "active")
      .map((m) => ({ value: m.id, label: `${m.nickname} (${m.battletag})` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [members],
  );

  const applyMapping = async (rawName: string, kind: ReplayNameMappingKind, memberId?: string) => {
    setMapError("");
    setBusy(true);
    try {
      const saved = await api.setReplayNameMapping(rawName, kind, memberId);
      setEntries((prev) => prev.map((p) => (p.rawName === saved.rawName ? saved : p)));
    } catch (e) {
      setMapError(e instanceof Error ? e.message : "저장에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  const memberLabel = (id: string) => memberOptions.find((o) => o.value === id)?.label ?? "회원";

  const nonMemberRowOf = (e: ReplayNameMappingEntry) => (
    <NonMemberRow
      key={e.rawName}
      entry={e}
      isAdmin={isAdmin}
      busy={busy}
      memberOptions={memberOptions}
      memberLabel={memberLabel}
      onPick={(kind, memberId) => setPending({
        title: "연결 확인",
        message: `"${e.rawName}"을(를) "${kind === "member" && memberId ? memberLabel(memberId) : kind === "computer" ? "컴퓨터" : "비회원"}"(으)로 연결할까요?`,
        confirmLabel: "연결",
        run: () => void applyMapping(e.rawName, kind, memberId),
      })}
      onRevert={() => setPending({
        title: "매핑 되돌리기",
        message: `"${e.rawName}" 연결을 지우고 미지정으로 되돌릴까요?`,
        confirmLabel: "되돌리기",
        run: () => void applyMapping(e.rawName, "unresolved"),
      })}
    />
  );

  return (
    <div className="scr-screen scr-members-screen-v2">
      <div className="scr-v2-toolbar scr-members-toolbar">
        <h1 className="scr-title scr-v2-toolbar-title">회원</h1>
      </div>

      {isAdmin && (
        <div className="scr-v2-primary-row">
          <button type="button" className="scr-btn scr-btn-primary scr-btn-primary-solid scr-btn-sm" onClick={() => setCreating(true)}>
            <UserPlus size={14} /> 생성
          </button>
        </div>
      )}

      <SearchFilterBar
        count={rows.length}
        countLabel="명"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="유저 입력 또는 @로 목록 띄우기"
        suggestions={suggestions}
        showSearch={false}
        filterPanel={
          <FilterItem label="상태">
            <PillTabs options={FILTER_OPTS} value={filter} onChange={setFilter} aria-label="회원 상태" />
          </FilterItem>
        }
      />

      <div className="scr-members-list-v2">
        {rows.length === 0 && <div className="scr-empty">회원이 없어요</div>}

        <div className="scr-member-rows">
          {pageRows.map((m) => {
            const ids = idsByMember.get(m.id) ?? [];
            const expanded = expandedIds.has(m.id);
            return (
              <div key={m.id} className={cx("scr-member-row-wrap", expanded && "scr-member-row-wrap-open")}>
                <button type="button" className="scr-member-row" onClick={() => toggleExpanded(m.id)}>
                  <span className="scr-member-row-cluster">
                    <Avatar member={m} size={36} />
                    <div className="scr-member-row-main">
                      <span className="scr-member-row-name">{m.nickname}</span>
                      <span className="scr-member-row-tag scr-mono">{m.battletag}</span>
                    </div>
                    {memberRoleBadges(m.roles).map((badge) => (
                      <span key={badge.role} className={cx("scr-status-badge", badge.className)}>{badge.label}</span>
                    ))}
                    <span className={cx("scr-status-badge", `scr-status-${m.status}`)}>{STATUS_LABEL[m.status]}</span>
                    <ChevronDown size={14} className={cx("scr-member-row-chevron", expanded && "scr-member-row-chevron-open")} />
                  </span>
                </button>

                <div className={cx("scr-member-gameids-clip", expanded && "scr-member-gameids-clip-open")} aria-hidden={!expanded}>
                  <div className="scr-member-gameids-clip-inner">
                  <div className="scr-member-gameids">
                    {isAdmin && expanded && <MemberManageFields member={m} />}
                    {isAdmin && expanded && <MemberRosterImageField member={m} />}
                    <div className="scr-member-gameids-head">
                      <span>게임아이디 {ids.length > 0 && <b>{ids.length}</b>}</span>
                    </div>
                    {mapLoading ? (
                      <LoadingMark />
                    ) : ids.length === 0 ? (
                      <div className="scr-member-gameids-empty">게임아이디가 없어요</div>
                    ) : (
                      ids.map((e) => (
                        <div key={e.rawName} className="scr-member-gameid-item">
                          <span className="scr-mono scr-member-gameid-name">{e.rawName}</span>
                          {isAdmin && (
                            <button
                              type="button" className="scr-icon-btn scr-member-gameid-unlink"
                              disabled={busy}
                              onClick={() => setPending({
                                title: "연결 해제",
                                message: `"${e.rawName}"을(를) ${m.nickname}에게서 떼어 미지정으로 되돌릴까요?`,
                                confirmLabel: "해제",
                                run: () => void applyMapping(e.rawName, "unresolved"),
                              })}
                              aria-label="연결 해제" title="연결 해제 (미지정으로)"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                    {isAdmin && (unresolvedRows.length > 0 || nonMemberRows.length > 0) && (
                      <div className="scr-member-gameid-add">
                        <Select
                          size="sm" className="scr-member-gameid-add-select"
                          value="" placeholder="+ 아이디 연결"
                          options={[...unresolvedRows, ...nonMemberRows].map((e) => ({ value: e.rawName, label: e.rawName }))}
                          onChange={(rawName) => setPending({
                            title: "연결 확인",
                            message: `"${rawName}"을(를) "${m.nickname}"에게 연결할까요?`,
                            confirmLabel: "연결",
                            run: () => void applyMapping(rawName, "member", m.id),
                          })}
                          disabled={busy}
                          minDropWidth={220}
                        />
                      </div>
                    )}
                  </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {mapError && <div className="scr-err">{mapError}</div>}

      {!mapLoading && unresolvedRows.length > 0 && (
        <div className="scr-members-sublist">
          <div className="scr-members-sublist-head">
            <CircleHelp size={13} /> 미매핑 게임아이디 <span className="scr-members-sublist-count">{unresolvedRows.length}</span>
            <span className="scr-members-sublist-sort">
              {([["recent", "최근 등장순"], ["count", "등장횟수순"]] as const).map(([v, label]) => (
                <button
                  key={v} type="button"
                  className={cx("scr-btn scr-btn-sm", unresolvedSort === v ? "scr-btn-primary" : "scr-btn-ghost")}
                  onClick={() => setUnresolvedSort(v)}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
          <div className="scr-member-rows">
            {unresolvedRows.map((e) => (
              <NonMemberRow
                key={e.rawName}
                entry={e}
                isAdmin={isAdmin}
                busy={busy}
                memberOptions={memberOptions}
                memberLabel={memberLabel}
                onPick={(kind, memberId) => setPending({
                  title: "연결 확인",
                  message: `"${e.rawName}"을(를) "${kind === "member" && memberId ? memberLabel(memberId) : kind === "computer" ? "컴퓨터" : "비회원"}"(으)로 연결할까요?`,
                  confirmLabel: "연결",
                  run: () => void applyMapping(e.rawName, kind, memberId),
                })}
                onRevert={() => setPending({
                  title: "매핑 되돌리기",
                  message: `"${e.rawName}" 연결을 지우고 미지정으로 되돌릴까요?`,
                  confirmLabel: "되돌리기",
                  run: () => void applyMapping(e.rawName, "unresolved"),
                })}
              />
            ))}
          </div>
        </div>
      )}

      {!mapLoading && frequentNonMemberRows.length > 0 && (
        <div className="scr-members-sublist">
          <div className="scr-members-sublist-head">
            <Flame size={13} /> {FREQUENT_NON_MEMBER_MIN}판 이상 뛴 비회원 <span className="scr-members-sublist-count">{frequentNonMemberRows.length}</span>
            <span className="scr-members-sublist-note">최근 플레이순</span>
          </div>
          <div className="scr-member-rows">
            {frequentNonMemberRows.map(nonMemberRowOf)}
          </div>
        </div>
      )}

      {!mapLoading && nonMemberRows.length > 0 && (
        <div className="scr-members-sublist">
          <div className="scr-members-sublist-head">
            <CircleHelp size={13} /> 비회원 플레이어 <span className="scr-members-sublist-count">{nonMemberRows.length}</span>
          </div>
          <div className="scr-member-rows">
            {nonMemberRows.map(nonMemberRowOf)}
          </div>
        </div>
      )}

      {!mapLoading && computerRows.length > 0 && (
        <div className="scr-members-sublist">
          <div className="scr-members-sublist-head">
            <Monitor size={13} /> 컴퓨터 플레이어 <span className="scr-members-sublist-count">{computerRows.length}</span>
          </div>
          <div className="scr-member-rows">
            {computerRows.map((e) => (
              <div key={e.rawName} className="scr-member-row scr-member-row-static">
                <span className="scr-member-row-cluster">
                  <span className="scr-mono scr-member-gameid-name">{e.rawName}</span>
                  {isAdmin && (
                    <button
                      type="button" className="scr-icon-btn scr-member-gameid-unlink"
                      disabled={busy}
                      onClick={() => setPending({
                        title: "미지정으로 되돌리기",
                        message: `"${e.rawName}"은(는) 컴퓨터가 아닌가요? 미지정으로 되돌릴까요?`,
                        confirmLabel: "되돌리기",
                        run: () => void applyMapping(e.rawName, "unresolved"),
                      })}
                      title="컴퓨터 아님 — 미지정으로 되돌리기" aria-label="미지정으로 되돌리기"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.title}
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          onConfirm={() => { const { run } = pending; setPending(null); run(); }}
          onCancel={() => setPending(null)}
        />
      )}

      {creating && <CreateMemberModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NonMemberRow({ entry, isAdmin, busy, memberOptions, onPick, onRevert }: {
  entry: ReplayNameMappingEntry;
  isAdmin: boolean;
  busy: boolean;
  memberOptions: { value: string; label: string }[];
  memberLabel: (id: string) => string;
  onPick: (kind: ReplayNameMappingKind, memberId?: string) => void;
  onRevert: () => void;
}) {
  const [showMemberSelect, setShowMemberSelect] = useState(false);
  return (
    <div className="scr-member-row scr-member-row-static">
      <span className="scr-member-row-cluster">
        <span className="scr-mono scr-member-gameid-name">{entry.rawName}</span>
        <span className={cx("scr-status-badge", entry.kind === "unresolved" ? "scr-status-pending" : "scr-status-suspended")}>
          {entry.kind === "unresolved" ? "미지정" : "비회원"}
        </span>
        {entry.appearances != null && (
          <span className="scr-member-gameid-meta">
            {entry.appearances}경기{entry.lastSeen ? ` · ${entry.lastSeen.slice(5).replace("-", ".")}` : ""}
          </span>
        )}
        {isAdmin && (
          showMemberSelect ? (
            <span className="scr-member-row-mapctl">
              <Select
                size="sm" className="scr-member-gameid-add-select"
                value="" options={memberOptions} placeholder="회원 선택"
                onChange={(id) => { setShowMemberSelect(false); onPick("member", id); }}
                disabled={busy} minDropWidth={280}
              />
              <button
                type="button" className="scr-icon-btn scr-member-gameid-unlink" disabled={busy}
                onClick={() => setShowMemberSelect(false)} aria-label="취소" title="취소"
              >
                <X size={13} />
              </button>
            </span>
          ) : (
            <span className="scr-member-row-mapctl">
              <Select
                size="sm" className="scr-member-gameid-kind-select"
                value="" options={KIND_PICK_OPTS} placeholder="연결"
                onChange={(v) => {
                  if (v === "member") setShowMemberSelect(true);
                  else onPick(v as ReplayNameMappingKind);
                }}
                disabled={busy}
              />
              {entry.kind !== "unresolved" && (
                <button
                  type="button" className="scr-icon-btn scr-member-gameid-unlink" disabled={busy}
                  onClick={onRevert} aria-label="미지정으로 되돌리기" title="미지정으로 되돌리기"
                >
                  <RotateCcw size={13} />
                </button>
              )}
            </span>
          )
        )}
      </span>
    </div>
  );
}
