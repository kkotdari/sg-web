import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/global.css";
import "scplay/styles.css";
import App from "./App";
import { markAppUpdatePreloadError } from "./utils/appUpdate";
import { setReplayBgm, setReplayChrome, setReplayMapFetcher } from "scplay";
import { BGM_TRACKS } from "./utils/bgmTracks";
import Avatar from "./components/common/Avatar";
import { showToast } from "./components/common/Toast";
import { api } from "./api/client";

setReplayMapFetcher((hashes: string[]) => api.getReplayMaps(hashes));
setReplayChrome({ Avatar, toast: (text, opts) => { showToast(text, opts as never); } });
setReplayBgm(BGM_TRACKS);

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
