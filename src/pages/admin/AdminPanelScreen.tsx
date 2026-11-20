import { useState } from "react";
import { X } from "lucide-react";
import { Spinner } from "../../components/common/Feedback";
import Select from "../../components/common/Select";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import VersionManageModal from "../../modals/VersionManageModal";
import ExtShareManageModal from "../../modals/ExtShareManageModal";
import SqlConsoleModal from "../../modals/SqlConsoleModal";
import PollResultsModal from "../../modals/PollResultsModal";
import SuggestionsModal from "../../modals/SuggestionsModal";
import { useAppStore } from "../../store/appStore";
import { showAlert } from "../../components/common/AlertDialog";
import { versionNumber } from "../../utils/appVersion";
import { useLockBodyScroll } from "../../utils/bodyScrollLock";
import { cx } from "../../utils/format";

interface AdminPanelScreenProps {
  isAdmin: boolean;
}

export default function AdminPanelScreen({ isAdmin }: AdminPanelScreenProps) {
  const appVersion = useAppStore((s) => s.appVersion);
  const appVersions = useAppStore((s) => s.appVersions);
  const setAppVersion = useAppStore((s) => s.setAppVersion);
  const noticeEnabled = useAppStore((s) => s.noticeEnabled);
  const setNoticeEnabled = useAppStore((s) => s.setNoticeEnabled);

  const [busy, setBusy] = useState(false);
  const [versionManageOpen, setVersionManageOpen] = useState(false);
  const [extShareOpen, setExtShareOpen] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);   // 설문 결과(PollResultsModal ★)
  const [suggOpen, setSuggOpen] = useState(false);   // 건의함(SuggestionsModal ★)
  const [togglingNotice, setTogglingNotice] = useState(false);
  const currentNumber = versionNumber(appVersion);

  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  useLockBodyScroll(versionPickerOpen, () => setVersionPickerOpen(false));
  const [confirmSetVersion, setConfirmSetVersion] = useState<string | null>(null);
  const [pickValue, setPickValue] = useState("");

  const pickableVersions = appVersions
    .filter((v) => versionNumber(v.number) !== currentNumber)
    .reverse();

  const openVersionPicker = () => {
    setPickValue(pickableVersions[0]?.number ?? "");
    setVersionPickerOpen(true);
  };

  const setVersion = async (number: string) => {
    setBusy(true);
    try {
      await setAppVersion(number);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "버전 설정에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  const toggleNotice = async () => {
    setTogglingNotice(true);
    try {
      await setNoticeEnabled(!noticeEnabled);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "설정을 바꾸지 못했어요.");
    } finally {
      setTogglingNotice(false);
    }
  };

  return (
    <div className="scr-screen scr-admin-screen">
      <div className="scr-v2-toolbar">
        <h1 className="scr-title scr-v2-toolbar-title">제어판</h1>
      </div>

      <div className="scr-admin-panel-body">

        {!isAdmin && (
          <div className="scr-adm-card">
            <p className="scr-adm-note">관리 기능은 운영자만 사용할 수 있어요.</p>
          </div>
        )}

        {isAdmin && (
          <>
            <section className="scr-adm-card">
              <div className="scr-adm-card-head">
                <h2 className="scr-adm-card-title">버전</h2>
                <span className="scr-adm-card-meta">현재 {currentNumber}</span>
              </div>
              <div className="scr-adm-rows">
                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">현재 버전 바꾸기</span>
                    <span className="scr-adm-row-desc">
                      등록된 버전 중 하나를 모두에게 적용합니다. 바꾸면 회원들은 다음 접속 때 안내를 다시 봅니다.
                    </span>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={openVersionPicker} disabled={busy}
                  >
                    {busy ? <Spinner /> : "바꾸기"}
                  </button>
                </div>

                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">버전 목록</span>
                    <span className="scr-adm-row-desc">버전을 더하거나 지우고, 버전마다의 안내 글을 씁니다.</span>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={() => setVersionManageOpen(true)}
                  >
                    열기
                  </button>
                </div>

                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">버전 안내 표시</span>
                    <span className="scr-adm-row-desc">
                      {noticeEnabled ? "새 버전으로 처음 들어올 때 안내를 띄웁니다." : "안내를 띄우지 않습니다."}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={noticeEnabled}
                    aria-label="버전 안내 표시"
                    className={cx("scr-notice-switch scr-adm-row-switch", noticeEnabled && "scr-notice-switch-on")}
                    onClick={() => void toggleNotice()}
                    disabled={togglingNotice}
                  >
                    <span className="scr-notice-switch-knob" />
                  </button>
                </div>
              </div>
            </section>

            <section className="scr-adm-card">
              <div className="scr-adm-card-head">
                <h2 className="scr-adm-card-title">외부 공개</h2>
              </div>
              <div className="scr-adm-rows">
                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">게임 관리</span>
                    <span className="scr-adm-row-desc">
                      손님에게 보일 재생 목록을 만들고 이름·비밀번호를 정합니다(비우면 잠금 없음).
                      담을 게임은 게임 목록에서 골라 '공개'로 담습니다.
                    </span>
                  </div>
                  <button
                    type="button" className="scr-rect-btn scr-adm-row-btn"
                    onClick={() => setExtShareOpen(true)}
                  >
                    열기
                  </button>
                </div>
              </div>
            </section>

            {/* ★ 설문 결과(2026-11-16, 요청: "설문 결과 보는 창 제어판에 추가해줘 · 공통 양식으로" — PollResultsModal ★ · 정의는 polls/defs). */}
            <section className="scr-adm-card">
              <div className="scr-adm-card-head">
                <h2 className="scr-adm-card-title">설문</h2>
              </div>
              <div className="scr-adm-rows">
                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">설문 결과</span>
                    <span className="scr-adm-row-desc">
                      설문마다 고르기별 인원·비율과 답(닉네임·의견)을 봅니다. 막대를 누르면 그 답만, md 복사로 표와 의견을 한 번에 옮겨요.
                    </span>
                  </div>
                  <button type="button" className="scr-rect-btn scr-adm-row-btn" onClick={() => setPollOpen(true)}>
                    열기
                  </button>
                </div>
                {/* ★ 건의함(2026-11-16 · SuggestionsModal ★ — 통계 WPA 칸 머리 '?' 의 계산 조건 창에서 보낸 건의). */}
                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">건의함</span>
                    <span className="scr-adm-row-desc">
                      팀원이 보낸 건의를 봅니다(지금은 WPA 계산 조건). md 복사로 한 번에 옮겨요.
                    </span>
                  </div>
                  <button type="button" className="scr-rect-btn scr-adm-row-btn" onClick={() => setSuggOpen(true)}>
                    열기
                  </button>
                </div>
              </div>
            </section>

            <section className="scr-adm-card">
              <div className="scr-adm-card-head">
                <h2 className="scr-adm-card-title">콘솔</h2>
              </div>
              <div className="scr-adm-rows">
                <div className="scr-adm-row">
                  <div className="scr-adm-row-text">
                    <span className="scr-adm-row-title">DB SQL 콘솔</span>
                    <span className="scr-adm-row-desc">
                      SQL 을 돌려 결과를 md 표로 봅니다. 기본은 읽기 전용 — '쓰기 허용'을 켜야 고친 것이 남아요.
                    </span>
                  </div>
                  <button type="button" className="scr-rect-btn scr-adm-row-btn" onClick={() => setSqlOpen(true)}>
                    열기
                  </button>
                </div>
              </div>
            </section>

          </>
        )}
      </div>

      {confirmSetVersion && (
        <ConfirmDialog
          title={`현재 버전을 ${confirmSetVersion}(으)로 바꿀까요?`}
          message="모든 사용자에게 즉시 반영되고, 회원들은 다음 접속 시 버전 안내를 다시 보게 됩니다."
          confirmLabel="설정"
          onConfirm={() => {
            const next = confirmSetVersion;
            setConfirmSetVersion(null);
            void setVersion(next);
          }}
          onCancel={() => setConfirmSetVersion(null)}
        />
      )}

      {versionManageOpen && (
        <VersionManageModal onClose={() => setVersionManageOpen(false)} />
      )}

      {sqlOpen && <SqlConsoleModal onClose={() => setSqlOpen(false)} />}
      {pollOpen && <PollResultsModal onClose={() => setPollOpen(false)} />}
      {suggOpen && <SuggestionsModal onClose={() => setSuggOpen(false)} />}
      {extShareOpen && (
        <ExtShareManageModal onClose={() => setExtShareOpen(false)} />
      )}

      {versionPickerOpen && (
        <div className="scr-modal-overlay" onClick={() => setVersionPickerOpen(false)}>
          <div
            className="scr-modal scr-modal-sm scr-admin-panel-version-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scr-modal-head">
              <span>현재 버전 설정</span>
              <button className="scr-icon-btn" onClick={() => setVersionPickerOpen(false)} aria-label="닫기"><X size={14} /></button>
            </div>
            <div className="scr-modal-body">
              {pickableVersions.length === 0 ? (
                <div className="scr-version-pick-empty">버전이 없어요</div>
              ) : (
                <>
                  <Select
                    value={pickValue}
                    options={pickableVersions.map((v) => ({ value: v.number, label: `${v.number} 버전` }))}
                    onChange={setPickValue}
                    className="scr-version-pick-select"
                  />
                  <button
                    type="button"
                    className="scr-rect-btn scr-version-pick-confirm"
                    onClick={() => { setConfirmSetVersion(pickValue); setVersionPickerOpen(false); }}
                    disabled={!pickValue}
                  >
                    설정
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
