import { api } from "../../api/client";
import { buildReplayDrafts, resolveUnmatchedAsUnregistered, validateReplayDraft } from "../../utils/replayDraft";
import { payloadOf } from "../../uploader/register";
import type { Member } from "../../types";

/* ★ 명예의 전당 손 넣기(2026-11-06, 요청: "명예의 전당에 수동으로 리플레이 추가 가능하게 · 회원 없는 경기도 들어갈 수 있게") — 운영자가 고른 리플레이를
   검토 창 없이 바로 서버로(fame) 보낸다. 등록 규칙(회원 수 · 짧은 판 · 이미 있는 판)은 안 본다 — 못 맞춘 이름은 미등록으로 채우고, 이미 있는 판은 서버가 머지하며
   표식만 단다. 마감한 달도 된다(서버). 분석 실패 · 편을 못 세운 판만 건너뛴다. */
export async function addFameReplays(files: File[], members: Member[]): Promise<{ done: number; failed: string[] }> {
  const drafts = await buildReplayDrafts(files, members);
  let done = 0;
  const failed: string[] = [];
  for (let i = 0; i < drafts.length; i += 1) {
    const d = drafts[i];
    const name = files[i]?.name ?? `파일 ${i + 1}`;
    if (d.parseError) { failed.push(`${name}: 분석 실패`); continue; }
    const r = resolveUnmatchedAsUnregistered(d);
    const problem = validateReplayDraft(r);
    if (problem) { failed.push(`${name}: ${problem}`); continue; }
    try {
      const { deleted } = await api.createGameResult({ ...payloadOf(r), fame: true });
      if (deleted) failed.push(`${name}: 삭제된 경기`);
      else done += 1;
    } catch (e) {
      failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { done, failed };
}
