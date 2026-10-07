import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Monitor, UserX, ArrowLeftRight, User, UserRoundSearch } from "lucide-react";
import Avatar from "../common/Avatar";
import { BASE_RACES } from "../../constants/races";
import Select from "../common/Select";
import { cx } from "../../utils/format";
import { attachPopover } from "../../utils/popover";
import { isComputerSlot, newComputerSlotId, computerSlotLabel } from "../../constants/computerSlot";
import { isUnregisteredSlot, unregisteredSlotLabel } from "../../constants/unregisteredSlot";
import type { Member, GameResultSlot, Race } from "../../types";

const CHIP_AVATAR = 26;
const CHIP_AVATAR_MAPPING = 20;

const RACE_SELECT_OPTS = BASE_RACES.map((r) => ({ value: r, label: r, shortLabel: r[0] }));

export interface UnresolvedRow {
  key: string;
  rawName: string;
  race: Race | "";
}

interface MemberMultiSelectProps {
  members: Member[];
  addableMembers?: Member[];
  rows: GameResultSlot[];
  setRows: (rows: GameResultSlot[]) => void;
  resolveDefaultRace: (memberId: string) => Race | "";
  unresolved?: UnresolvedRow[];
  unresolvedCandidates?: Member[];
  onResolve?: (key: string, member: Member) => void;
  onUnresolvedRaceChange?: (key: string, race: Race | "") => void;
  onMarkComputer?: (key: string) => void;
  onMarkUnregistered?: (key: string) => void;
  onRemoveUnresolved?: (key: string) => void;
  disabled?: boolean;
  mappingMode?: boolean;
  reassignable?: boolean;
  onReassignMember?: (memberId: string, newMember: Member) => void;
  onReassignComputer?: (memberId: string) => void;
  onReassignUnregistered?: (memberId: string) => void;
  suspectedNames?: Set<string>;
  onMoveToOtherTeam?: (row: GameResultSlot) => void;
  onMoveUnresolvedToOtherTeam?: (rawName: string) => void;
}

interface MemberSearchDropProps {
  dropRef: React.RefObject<HTMLDivElement | null>;
  candidates: Member[];
  highlight: number;
  onHighlight: (i: number) => void;
  onPick: (m: Member) => void;
  header?: React.ReactNode;
  top?: React.ReactNode;
}

function MemberSearchDrop({ dropRef, candidates, highlight, onHighlight, onPick, header, top }: MemberSearchDropProps) {
  return createPortal(
    <div className="scr-select-drop scr-scroll" ref={dropRef}>
      {header}
      {top}
      {candidates.map((m, i) => (
        <div
          key={m.id}
          className={cx("scr-select-opt", i === highlight && "scr-select-opt-active")}
          onMouseEnter={() => onHighlight(i)}
          onClick={() => onPick(m)}
        >
          <Avatar member={m} size={20} />
          <span>{m.nickname}</span>
        </div>
      ))}
      {candidates.length === 0 && <div className="scr-hint" style={{ padding: "8px 10px" }}>결과가 없어요</div>}
    </div>,
    document.body,
  );
}

export interface UnresolvedChipProps {
  entry: UnresolvedRow;
  candidates: Member[];
  onResolve: (member: Member) => void;
  onRaceChange: (race: Race | "") => void;
  onMarkComputer?: () => void;
  onMarkUnregistered?: () => void;
  onRemove?: () => void;
  onMoveToOtherTeam?: () => void;
  disabled?: boolean;
  mappingMode?: boolean;
  suspected?: boolean;
}

function UnresolvedChip({
  entry, candidates, onResolve, onRaceChange, onMarkComputer, onMarkUnregistered, onRemove, onMoveToOtherTeam,
  disabled = false, mappingMode = false, suspected = false,
}: UnresolvedChipProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !anchorRef.current || !dropRef.current) return;
    return attachPopover(anchorRef.current, dropRef.current, { growFromAnchor: true, maxWidth: 220 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = query.toLowerCase();
  const filtered = candidates.filter((m) => m.nickname.toLowerCase().includes(q) || m.battletag.toLowerCase().includes(q));

  const pick = (m: Member) => { onResolve(m); setOpen(false); setQuery(""); };
  const pickUnregistered = () => { onMarkUnregistered?.(); setOpen(false); setQuery(""); };

  const toggleOpen = () => { setOpen((v) => !v); setQuery(""); setHighlight(0); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % filtered.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + filtered.length) % filtered.length); }
    else if (e.key === "Enter") { e.preventDefault(); pick(filtered[Math.min(highlight, filtered.length - 1)]); }
  };

  const resolveButtons = (
    <div className="scr-chip-resolve-icon-group">
      <button
        type="button"
        className={cx("scr-chip-resolve-icon-btn", !disabled && "scr-chip-resolve-pulse")}
        onClick={toggleOpen}
        disabled={disabled}
        title="누구인지 연결"
        aria-label="누구인지 연결"
      >
        <UserRoundSearch size={14} />
      </button>
      {suspected && onRemove && (
        <button
          type="button"
          className={cx("scr-chip-resolve-icon-btn", !disabled && "scr-chip-resolve-pulse")}
          onClick={onRemove}
          disabled={disabled}
          title="관전자로 보고 제거"
          aria-label="관전자로 보고 제거"
        >
          <X size={14} />
        </button>
      )}
      {onMoveToOtherTeam && (
        <button
          type="button"
          className="scr-chip-resolve-icon-btn"
          onClick={onMoveToOtherTeam}
          disabled={disabled}
          title="다른 팀으로 이동"
          aria-label="다른 팀으로 이동"
        >
          <ArrowLeftRight size={14} />
        </button>
      )}
    </div>
  );

  return (
    <div
      className={cx("scr-chip", "scr-chip-unresolved", mappingMode && "scr-chip-unresolved-mapping", suspected && "scr-chip-suspected")}
      ref={anchorRef}
      title={suspected ? "조작량이 적어 실제로 뛰지 않았을 수 있어요 — 관전자면 컴퓨터/비회원 대신 그냥 제거해 주세요." : undefined}
    >
      <Avatar member={undefined} size={mappingMode ? CHIP_AVATAR_MAPPING : CHIP_AVATAR} />
      <span
        className={cx("scr-chip-name", mappingMode && "scr-mono scr-chip-name-mapping")}
        title="배틀태그로 회원을 찾지 못했어요 — 회원을 연결해 주세요."
      >
        {entry.rawName}
      </span>
      {resolveButtons}
      {mappingMode ? (
        entry.race && <span className="scr-chip-race-static">{entry.race[0]}</span>
      ) : (
        <Select
          className="scr-chip-race"
          size="sm"
          value={entry.race}
          placeholder="종족"
          options={RACE_SELECT_OPTS}
          onChange={(v) => onRaceChange(v as Race | "")}
          minDropWidth={100}
          disabled={disabled}
        />
      )}

      {open && (
        <MemberSearchDrop
          dropRef={dropRef}
          candidates={filtered}
          highlight={highlight}
          onHighlight={setHighlight}
          onPick={pick}
          top={(onMarkUnregistered || onMarkComputer) ? (
            <>
              {onMarkUnregistered && (
                <div className="scr-select-opt scr-select-opt-kind" onClick={pickUnregistered}>
                  <UserX size={16} />
                  <span>비회원</span>
                </div>
              )}
              {onMarkComputer && (
                <div
                  className="scr-select-opt scr-select-opt-kind"
                  onClick={() => { onMarkComputer(); setOpen(false); setQuery(""); }}
                >
                  <Monitor size={16} />
                  <span>컴퓨터</span>
                </div>
              )}
            </>
          ) : undefined}
          header={
            <input
              className="scr-slot-search-input scr-chip-resolve-input"
              placeholder="회원 검색"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
              onKeyDown={onKeyDown}
            />
          }
        />
      )}
    </div>
  );
}

interface ReassignableChipProps {
  row: GameResultSlot;
  name: string;
  member: Member | undefined;
  isComputer: boolean;
  isUnregistered: boolean;
  candidates: Member[];
  onReassignMember: (member: Member) => void;
  onReassignComputer: () => void;
  onReassignUnregistered: () => void;
  disabled?: boolean;
}

function ReassignableChip({
  row, name, member, isComputer, isUnregistered, candidates,
  onReassignMember, onReassignComputer, onReassignUnregistered, disabled = false,
}: ReassignableChipProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !anchorRef.current || !dropRef.current) return;
    return attachPopover(anchorRef.current, dropRef.current, { growFromAnchor: true, maxWidth: 220 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = query.toLowerCase();
  const filtered = candidates.filter((m) => m.nickname.toLowerCase().includes(q) || m.battletag.toLowerCase().includes(q));

  const pick = (m: Member) => { onReassignMember(m); setOpen(false); setQuery(""); };
  const toggleOpen = () => { if (disabled) return; setOpen((v) => !v); setQuery(""); setHighlight(0); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % filtered.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + filtered.length) % filtered.length); }
    else if (e.key === "Enter") { e.preventDefault(); pick(filtered[Math.min(highlight, filtered.length - 1)]); }
  };

  return (
    <div className={cx("scr-chip", "scr-chip-reassign", isComputer && "scr-chip-computer", isUnregistered && "scr-chip-unregistered")} ref={anchorRef}>
      {isComputer
        ? <Avatar icon={<Monitor size={16} className="scr-chip-computer-icon" />} size={26} />
        : isUnregistered
          ? <Avatar icon={<User size={16} className="scr-chip-computer-icon" />} size={26} />
          : <Avatar member={member} size={26} />}
      <span className="scr-chip-name">{name}</span>
      <div className="scr-chip-resolve-icon-group">
        <button
          type="button"
          className="scr-chip-resolve-icon-btn"
          onClick={toggleOpen} disabled={disabled}
          title="누구인지 바꾸기" aria-label="누구인지 바꾸기"
        >
          <UserRoundSearch size={14} />
        </button>
      </div>
      {!isComputer && row.race && <span className="scr-chip-race-static">{row.race[0]}</span>}

      {open && (
        <MemberSearchDrop
          dropRef={dropRef}
          candidates={filtered}
          highlight={highlight}
          onHighlight={setHighlight}
          onPick={pick}
          top={
            <>
              <div
                className={cx("scr-select-opt", "scr-select-opt-kind", isUnregistered && "scr-select-opt-active")}
                onClick={() => { if (!isUnregistered) onReassignUnregistered(); setOpen(false); }}
              >
                <UserX size={16} />
                <span>비회원</span>
              </div>
              <div
                className={cx("scr-select-opt", "scr-select-opt-kind", isComputer && "scr-select-opt-active")}
                onClick={() => { if (!isComputer) onReassignComputer(); setOpen(false); }}
              >
                <Monitor size={16} />
                <span>컴퓨터</span>
              </div>
            </>
          }
          header={
            <input
              className="scr-slot-search-input scr-chip-resolve-input"
              placeholder="회원 검색"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
              onKeyDown={onKeyDown}
            />
          }
        />
      )}
    </div>
  );
}

export default function MemberMultiSelect({
  members, addableMembers, rows, setRows, resolveDefaultRace,
  unresolved, unresolvedCandidates, onResolve, onUnresolvedRaceChange, onMarkComputer, onMarkUnregistered,
  onRemoveUnresolved,
  disabled = false, mappingMode = false,
  reassignable = false, onReassignMember, onReassignComputer, onReassignUnregistered,
  suspectedNames, onMoveToOtherTeam, onMoveUnresolvedToOtherTeam,
}: MemberMultiSelectProps) {
  const [adding, setAdding] = useState(false);
  const [searchOpened, setSearchOpened] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!adding || !searchOpened || !searchRef.current || !dropRef.current) return;
    return attachPopover(searchRef.current, dropRef.current, { matchAnchor: true });
  }, [adding, searchOpened]);

  useEffect(() => {
    if (!adding) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (searchRef.current?.contains(t)) return;
      if (dropRef.current?.contains(t)) return;
      setAdding(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [adding]);

  const chosenIds = rows.map((r) => r.memberId);
  const q = query.toLowerCase();
  const filtered = (addableMembers ?? members).filter((m) =>
    !chosenIds.includes(m.id) &&
    (m.nickname.toLowerCase().includes(q) ||
      m.battletag.toLowerCase().includes(q)),
  );

  const startAdding = () => { setAdding(true); setSearchOpened(true); setQuery(""); setHighlight(0); };

  const addMember = (id: string) => {
    if (chosenIds.includes(id)) return;
    setRows([...rows, {
      memberId: id, race: resolveDefaultRace(id),
      apm: null, eapm: null, cmdCount: null, effectiveCmdCount: null, buildCount: null,
    }]);
    setAdding(false);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setAdding(false);
      return;
    }
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      addMember(filtered[Math.min(highlight, filtered.length - 1)].id);
    }
  };
  const removeMember = (id: string) => setRows(rows.filter((r) => r.memberId !== id));
  const setRace = (id: string, race: Race | "") =>
    setRows(rows.map((r) => (r.memberId === id ? { ...r, race } : r)));

  const addComputerSlot = () => {
    setRows([...rows, {
      memberId: newComputerSlotId(), race: "",
      apm: null, eapm: null, cmdCount: null, effectiveCmdCount: null, buildCount: null,
    }]);
  };

  const memberOf = (id: string): Member | undefined => members.find((m) => m.id === id);

  const usedInTeam = new Set(rows.map((r) => r.memberId));

  return (
    <div className="scr-team-col">
      <div className="scr-team-slots">
        {rows.map((row) => {
          const isComputer = isComputerSlot(row.memberId);
          const isUnregistered = isUnregisteredSlot(row.memberId);
          const m = isComputer || isUnregistered ? undefined : memberOf(row.memberId);
          const name = isComputer
            ? (mappingMode || reassignable ? (row.race || "컴퓨터") : (row.rawName || computerSlotLabel(rows, row.memberId)))
            : isUnregistered
              ? (row.rawName || unregisteredSlotLabel(rows, row.memberId))
              : (m?.nickname ?? row.memberId);

          if (reassignable) {
            const reassignCandidates = (addableMembers ?? members).filter(
              (cand) => !usedInTeam.has(cand.id) || cand.id === row.memberId,
            );
            return (
              <ReassignableChip
                key={row.memberId}
                row={row}
                name={name}
                member={m}
                isComputer={isComputer}
                isUnregistered={isUnregistered}
                candidates={reassignCandidates}
                onReassignMember={(newMember) => onReassignMember?.(row.memberId, newMember)}
                onReassignComputer={() => onReassignComputer?.(row.memberId)}
                onReassignUnregistered={() => onReassignUnregistered?.(row.memberId)}
                disabled={disabled}
              />
            );
          }

          const suspected = !!row.rawName && suspectedNames?.has(row.rawName);
          return (
            <div
              key={row.memberId}
              className={cx(
                "scr-chip",
                isComputer && "scr-chip-computer",
                isUnregistered && "scr-chip-unregistered",
                (!isComputer && (!row.race || row.race === "랜덤")) && "scr-chip-warn",
                suspected && "scr-chip-suspected",
              )}
              title={suspected ? "조작량이 적어 실제로 뛰지 않았을 수 있어요 — 관전자면 제거해 주세요." : undefined}
            >
              {(() => {
                const av = mappingMode ? CHIP_AVATAR_MAPPING : CHIP_AVATAR;
                const ic = mappingMode ? 13 : 16;
                return isComputer
                  ? <Avatar icon={<Monitor size={ic} className="scr-chip-computer-icon" />} size={av} />
                  : isUnregistered
                    ? <Avatar icon={<User size={ic} className="scr-chip-computer-icon" />} size={av} />
                    : <Avatar member={m} size={av} />;
              })()}
              <span className="scr-chip-name">{name}</span>
              {!isComputer && (
                mappingMode ? (
                  row.race && <span className="scr-chip-race-static">{row.race[0]}</span>
                ) : (
                  <Select
                    className="scr-chip-race"
                    size="sm"
                    value={row.race}
                    placeholder="종족"
                    options={RACE_SELECT_OPTS}
                    onChange={(v) => setRace(row.memberId, v as Race | "")}
                    minDropWidth={100}
                    disabled={disabled}
                  />
                )
              )}
              {(!mappingMode || suspected) && (
                <button
                  type="button" className="scr-chip-x" onClick={() => removeMember(row.memberId)}
                  aria-label="관전자로 보고 제거" title={mappingMode ? "관전자로 보고 제거" : "제거"} disabled={disabled}>
                  <X size={12} />
                </button>
              )}
              {onMoveToOtherTeam && (
                <button
                  type="button" className="scr-chip-x" onClick={() => onMoveToOtherTeam(row)}
                  aria-label="다른 팀으로 이동" title="다른 팀으로 이동" disabled={disabled}
                >
                  <ArrowLeftRight size={12} />
                </button>
              )}
            </div>
          );
        })}

        {unresolved?.map((entry) => (
          <UnresolvedChip
            key={entry.key}
            entry={entry}
            candidates={unresolvedCandidates ?? []}
            onResolve={(m) => onResolve?.(entry.key, m)}
            onRaceChange={(race) => onUnresolvedRaceChange?.(entry.key, race)}
            onMarkComputer={onMarkComputer ? () => onMarkComputer(entry.key) : undefined}
            onMarkUnregistered={onMarkUnregistered ? () => onMarkUnregistered(entry.key) : undefined}
            onRemove={onRemoveUnresolved ? () => onRemoveUnresolved(entry.key) : undefined}
            onMoveToOtherTeam={onMoveUnresolvedToOtherTeam ? () => onMoveUnresolvedToOtherTeam(entry.key) : undefined}
            disabled={disabled}
            mappingMode={mappingMode}
            suspected={suspectedNames?.has(entry.rawName)}
          />
        ))}

        {mappingMode ? null : adding ? (
          <div className="scr-team-slot scr-team-slot-search" ref={searchRef}>
            <input
              className="scr-slot-search-input"
              placeholder="유저 검색"
              value={query}
              onFocus={() => setSearchOpened(true)}
              onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
              onKeyDown={onSearchKeyDown}
            />
            {searchOpened && (
              <MemberSearchDrop
                dropRef={dropRef}
                candidates={filtered}
                highlight={highlight}
                onHighlight={setHighlight}
                onPick={(m) => addMember(m.id)}
              />
            )}
          </div>
        ) : (
          <div className="scr-team-slot-add-row">
            <button type="button" className="scr-team-slot scr-team-slot-add" onClick={startAdding} aria-label="참가자 추가" disabled={disabled}>
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="scr-team-slot scr-team-slot-add-computer"
              onClick={addComputerSlot}
              aria-label="컴퓨터 추가"
              title="컴퓨터 추가"
              disabled={disabled}
            >
              <Monitor size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
