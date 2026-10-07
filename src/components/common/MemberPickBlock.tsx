import { useState } from "react";
import { X, UserPlus } from "lucide-react";
import Select from "./Select";
import Avatar from "./Avatar";
import type { Member } from "../../types";

export default function MemberPickBlock({
  label, hint, ids, setIds, max, options, memberById, addLabel, addAriaLabel, locked = false, required = false, addTone,
}: {
  label: string;
  addTone?: "blue" | "red" | "lit" | "ghost";
  hint?: string;
  required?: boolean;
  ids: string[];
  setIds: (next: string[]) => void;
  max: number;
  options: { value: string; label: string; avatar?: React.ReactNode }[];
  memberById: Map<string, Member>;
  addLabel: string;
  addAriaLabel: string;
  locked?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const pick = (id: string) => { setIds([...ids, id]); setPicking(false); };
  const remove = (id: string) => setIds(ids.filter((v) => v !== id));

  const canAdd = !locked && ids.length < max;
  return (
    <div className="scr-field">
      <div className="scr-challenge-pick-head">
        <span className="scr-label">
          {label}
          {required && <span className="scr-req-mark" aria-hidden="true">*</span>}
          {hint && <span className="scr-hint">{hint}</span>}
        </span>
        {canAdd && !picking && (
          <button
            type="button"
            className={`scr-challenge-add-target scr-challenge-add-target-inline${addTone ? ` scr-challenge-add-target-${addTone}` : ""}`}
            onClick={() => setPicking(true)} aria-label={addAriaLabel}
          >
            <UserPlus size={15} />{addLabel}
          </button>
        )}
      </div>
      {(ids.length > 0 || picking) && (
        <div className="scr-challenge-target-slots">
          {ids.map((id) => {
            const m = memberById.get(id);
            return (
              <div key={id} className="scr-challenge-target-picked">
                {m && <Avatar member={m} size={20} />}
                <span className="scr-challenge-target-picked-name">{m?.nickname ?? id}</span>
                {!locked && (
                  <button
                    type="button" className="scr-icon-btn scr-challenge-target-remove"
                    onClick={() => remove(id)} aria-label="지목 취소"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })}
          {picking && (
            <div className="scr-challenge-target-slot">
              <Select
                value="" options={options} onChange={pick}
                placeholder="유저 선택"
                className="scr-challenge-target-select"
                defaultOpen
                onOpenChange={(open) => { if (!open) setPicking(false); }}
              />
              <button
                type="button" className="scr-icon-btn scr-challenge-target-remove"
                onClick={() => setPicking(false)} aria-label="추가 취소"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
