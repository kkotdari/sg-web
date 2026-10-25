import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/global.css";
import "scplay/styles.css";
import "scplay/fonts.css";   // 재생기 글꼴(나눔스퀘어 네오 + AGA Rasheeq) — 재생기 안에서만 쓴다
import App from "./App";
import { markAppUpdatePreloadError } from "./utils/appUpdate";
import { setReplayBgm, setReplayChrome, setReplayMapFetcher, setReplaySpriteAtlas } from "scplay";
import { BGM_TRACKS } from "./utils/bgmTracks";
import Avatar from "./components/common/Avatar";
import { showToast } from "./components/common/Toast";
import { api } from "./api/client";

setReplayMapFetcher((hashes: string[]) => api.getReplayMaps(hashes));
setReplayChrome({ Avatar, toast: (text, opts) => { showToast(text, opts as never); } });
setReplayBgm(BGM_TRACKS);
/* 재생기 서버 아틀라스(미리 구운 모델 그림 · 2026-10-25) — 원본은 scplay 의 spr/ · npm 설치 뒤 postinstall 이 public/spr 로 베낀다(package.json "spr"). 경기에 나오는 종류만 받아 쓴다. */
setReplaySpriteAtlas({ base: "/spr" });

let preloadErrorShown = false;
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  markAppUpdatePreloadError();
  if (preloadErrorShown) return;
  preloadErrorShown = true;
  window.alert("사이트가 새 버전으로 업데이트됐어요. 새로고침한 뒤 다시 시도해 주세요.");
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
