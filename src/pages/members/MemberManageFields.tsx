import { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import Select from "../../components/common/Select";
import PhotoViewer from "../../components/common/PhotoViewer";
import { Spinner } from "../../components/common/Feedback";
import { useAppStore } from "../../store/appStore";
import { ROLE_INFO, ASSIGNABLE_ROLES } from "../../constants/roles";
import type { Member, MemberRole } from "../../types";

const STATUS_LABEL: Record<Member["status"], string> = {
  pending: "승인 대기",
  active: "활성",
  suspended: "정지",
  withdrawn: "탈퇴",
};

export default function MemberManageFields({ member }: { member: Member }) {
  const currentUser = useAppStore((s) => s.user);
  const updateMemberStatus = useAppStore((s) => s.updateMemberStatus);
  const updateMemberRoles = useAppStore((s) => s.updateMemberRoles);
  const reprocessMemberAvatar = useAppStore((s) => s.reprocessMemberAvatar);
  const [pendingRoles, setPendingRoles] = useState<MemberRole[]>(member.roles);
  const [pendingStatus, setPendingStatus] = useState<Member["status"]>(member.status);
  const [saving, setSaving] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setPendingRoles(member.roles);
    setPendingStatus(member.status);
  }, [member.roles, member.status, member.updatedAt]);

  const isSelf = currentUser?.id === member.id;
  const rolesChanged = pendingRoles.length !== member.roles.length
    || pendingRoles.some((r) => !member.roles.includes(r));
  const statusChanged = pendingStatus !== member.status;
  const anyChanged = rolesChanged || statusChanged;

  const statusTarget: "active" | "suspended" | null =
    member.status === "active" ? (isSelf ? null : "suspended") : "active";
  const statusOptions = [
    { value: member.status, label: STATUS_LABEL[member.status] },
    ...(statusTarget ? [{ value: statusTarget, label: STATUS_LABEL[statusTarget] }] : []),
  ];

  const toggleRole = (role: MemberRole, checked: boolean) => {
    setErr("");
    setPendingRoles((prev) => (checked ? [...prev, role] : prev.filter((r) => r !== role)));
  };

  const saveAll = async () => {
    if (!anyChanged) return;
    if (rolesChanged && pendingRoles.length === 0) { setErr("최소 하나 이상의 역할이 필요합니다."); return; }
    setErr("");
    setSaving(true);
    try {
      if (rolesChanged) await updateMemberRoles(member.id, pendingRoles);
      if (statusChanged) await updateMemberStatus(member.id, pendingStatus as "active" | "suspended");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "처리에 실패했어요.");
    } finally {
      setSaving(false);
    }
  };

  const doResize = async () => {
    setErr("");
    setResizing(true);
    try {
      await reprocessMemberAvatar(member.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "사진 재처리에 실패했어요.");
    } finally {
      setResizing(false);
    }
  };

  return (
    <div className="scr-member-section">
      <div className="scr-member-gameids-head">
        <span>회원 정보</span>
        <button
          type="button" className="scr-compact-rect-btn"
          onClick={saveAll} disabled={saving || !anyChanged}
          title={anyChanged ? "바뀐 권한·상태를 저장합니다" : "바뀐 게 없어요"}
        >
          {saving ? <Spinner size={12} /> : <Save size={13} />} 저장
        </button>
      </div>
      <dl className="scr-detail-list scr-member-info">
        <div className="scr-detail-row"><dt>인스타</dt><dd>{member.insta || "—"}</dd></div>
        <div className="scr-detail-row"><dt>가입일</dt><dd>{member.createdAt.slice(0, 10)}</dd></div>
        {member.avatar && (
          <div className="scr-detail-row">
            <dt>프사</dt>
            <dd className="scr-member-info-links">
              <button type="button" className="scr-link-btn" onClick={() => setPhotoOpen(true)}>크게 보기</button>
              <button type="button" className="scr-link-btn scr-member-info-resize" onClick={doResize} disabled={resizing}>
                <RefreshCw size={11} className={resizing ? "scr-spin" : undefined} /> 재처리(화질 개선)
              </button>
            </dd>
          </div>
        )}
        <div className="scr-detail-row scr-member-info-center">
          <dt>권한</dt>
          <dd className="scr-member-info-roles">
            {ASSIGNABLE_ROLES.map((role) => (
              <label key={role} className="scr-checkbox-field">
                <input
                  type="checkbox"
                  checked={pendingRoles.includes(role)}
                  disabled={saving}
                  onChange={(e) => toggleRole(role, e.target.checked)}
                />
                {ROLE_INFO[role]}
              </label>
            ))}
          </dd>
        </div>
        <div className="scr-detail-row scr-member-info-center">
          <dt>상태</dt>
          <dd className="scr-member-info-status">
            {statusOptions.length > 1 ? (
              <Select
                className="scr-status-edit-select"
                size="sm"
                value={pendingStatus}
                options={statusOptions}
                onChange={(v) => setPendingStatus(v as Member["status"])}
                minDropWidth={140}
                disabled={saving}
              />
            ) : STATUS_LABEL[member.status]}
            {isSelf && member.status === "active" && (
              <span className="scr-member-info-note">본인 계정은 정지할 수 없어요</span>
            )}
          </dd>
        </div>
      </dl>
      {err && <div className="scr-err">{err}</div>}

      {photoOpen && member.avatar && (
        <PhotoViewer src={member.avatar} alt={member.nickname} onClose={() => setPhotoOpen(false)} />
      )}
    </div>
  );
}
