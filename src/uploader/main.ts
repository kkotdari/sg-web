import { api } from "../api/client";
import type { Member } from "../types";
import { registerReplayFile, resetMembersCache, type UploadOutcome } from "./register";
import type { UploadJob } from "./bridge";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const bridge = window.stargateUploader ?? null;
const RETRY_MS = 60_000;

function say(text: string, tone: "" | "ok" | "err" = ""): void {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${tone}`;
}

function showLogin(show: boolean): void {
  $("login").hidden = !show;
  if (show) $("id").focus();
}

async function whoAmI(): Promise<Member | null> {
  if (!api.hasToken()) return null;
  try {
    return await api.me();
  } catch (e) {
    if (!api.hasToken()) return null;
    throw e;
  }
}

async function boot(): Promise<void> {
  for (;;) {
    try {
      const user = await whoAmI();
      if (user) {
        say(`${user.nickname}님으로 로그인됨 — 등록기가 이 창을 통해 리플레이를 올려요.`, "ok");
        showLogin(false);
        bridge?.emit("ready", { user });
      } else {
        say("스타게이트 아이디로 로그인해 주세요.");
        showLogin(true);
        bridge?.emit("ready", { user: null });
      }
      return;
    } catch (e) {
      say(`서버에 연결하지 못했어요 — 잠시 뒤 다시 시도해요. (${e instanceof Error ? e.message : String(e)})`, "err");
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
}

$("login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = $<HTMLInputElement>("id").value.trim();
  const pw = $<HTMLInputElement>("pw").value;
  if (!id || !pw) { say("아이디와 비밀번호를 넣어 주세요.", "err"); return; }
  const btn = $<HTMLButtonElement>("btn");
  btn.disabled = true;
  try {
    const { user } = await api.login(id, pw);
    resetMembersCache();
    $<HTMLInputElement>("pw").value = "";
    showLogin(false);
    say(`${user.nickname}님, 로그인됐어요. 등록기가 트레이에서 계속 돌아가요.`, "ok");
    bridge?.emit("login-ok", { user });
  } catch (e) {
    say(e instanceof Error ? e.message : String(e), "err");
  } finally {
    btn.disabled = false;
  }
});

function fileOf(job: UploadJob): File {
  const bin = atob(job.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], job.name);
}

if (bridge) {
  bridge.onJob(async (job) => {
    try {
      return await registerReplayFile(fileOf(job));
    } catch (e) {
      if (!api.hasToken()) {
        showLogin(true);
        say("세션이 끝났어요 — 다시 로그인해 주세요.", "err");
        bridge.emit("needs-login", { why: e instanceof Error ? e.message : String(e) });
      }
      throw e;
    }
  });
  bridge.onLogout(async () => {
    await api.logout();
    resetMembersCache();
    say("다른 계정으로 로그인해 주세요.");
    showLogin(true);
  });
} else {
  $("browser").hidden = false;
  const input = $<HTMLInputElement>("files");
  const out = $("results");
  const line = (o: UploadOutcome, name: string): string => {
    switch (o.kind) {
      case "registered": return `✔ 등록 ${o.matchNo} · ${name} · ${o.summary}`;
      case "merged": return `↻ 기존 경기 갱신 · ${name} · ${o.summary}`;
      case "duplicate": return `= 이미 등록됨 · ${name} · ${o.summary}`;
      case "skipped": return `– 건너뜀(${o.reason}) · ${name} · ${o.summary}`;
    }
  };
  input.addEventListener("change", async () => {
    const files = Array.from(input.files ?? []);
    input.value = "";
    for (const f of files) {
      const li = document.createElement("li");
      li.textContent = `… ${f.name}`;
      out.prepend(li);
      try {
        li.textContent = line(await registerReplayFile(f), f.name);
      } catch (e) {
        li.textContent = `✖ 실패 · ${f.name} · ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  });
}

void boot();
