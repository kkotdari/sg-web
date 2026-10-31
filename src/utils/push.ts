/* ★ 푸시 알림 켜기·끄기(2026-10-31, 요청: "안드는 apk 아이폰은 pwa · 두 쪽 다 푸시 알림" · "앱 설정 메뉴에서 알림 추가" · "알림은 그냥 통째로 켜고 끄기만 설명 X").
   두 길:
   · 안드 앱(Capacitor · 사이트를 웹뷰로 연다) — 웹뷰엔 Web Push 가 없어 FCM(@capacitor/push-notifications) 토큰을 서버에 건다.
   · 브라우저·아이폰 홈 화면 PWA(iOS 16.4+) — 서비스워커(public/sw.js) + Web Push(VAPID 키는 서버 /api/push/config).
   켬 뜻은 이 기기 localStorage(WANT_KEY)에 둔다 — 로그아웃은 서버 구독만 걷고(남이 이 기기로 로그인해도 앞사람 알림이 안 오게)
   다시 로그인하면 조용히 다시 건다(ensurePush). 토큰이 바뀌는 일(FCM 갱신·브라우저 키 교체)도 그때 맞춰진다. */
import { api } from "../api/client";
import { navigateTo } from "./route";

const WANT_KEY = "scr-push-want";
const EP_KEY = "scr-push-endpoint";   // 서버에 건 endpoint(웹 · FCM 토큰) — 끌 때·로그아웃 때 이것으로 지운다

type CapWin = { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } };

export function isNativeApp(): boolean {
  return !!(window as unknown as CapWin).Capacitor?.isNativePlatform?.();
}

function webPushAvailable(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** 안드 앱이 Firebase 설정(google-services.json)을 품고 구워졌나 — 없이 구운 판은 FCM 등록에서 앱이 죽는다(MainActivity ScrApp.fcm). */
function nativeFcmReady(): boolean {
  try { return !!(window as unknown as { ScrApp?: { fcm?: () => boolean } }).ScrApp?.fcm?.(); } catch { return false; }
}

export function pushSupported(): boolean {
  return isNativeApp() ? nativeFcmReady() : webPushAvailable();
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const ls = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null): void => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 없음 */ } },
};

export function pushWanted(): boolean {
  return ls.get(WANT_KEY) === "1";
}

function b64uToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i += 1) out[i] = b.charCodeAt(i);
  return out;
}

async function swReg(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

/* ── 웹(브라우저 · 아이폰 PWA) ── */
async function webSubscribe(ask: boolean): Promise<void> {
  if (Notification.permission !== "granted") {
    if (!ask) throw new Error("permission");
    if ((await Notification.requestPermission()) !== "granted") throw new Error("permission");
  }
  const { webPushKey } = await api.pushConfig();
  if (!webPushKey) throw new Error("server");
  const reg = await swReg();
  let sub = await reg.pushManager.getSubscription();
  const key = b64uToBytes(webPushKey);
  if (sub && sub.options.applicationServerKey) {
    const old = new Uint8Array(sub.options.applicationServerKey);
    if (old.length !== key.length || old.some((v, i) => v !== key[i])) { await sub.unsubscribe(); sub = null; }   // 서버 키가 바뀌었다
  }
  sub = sub ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const j = sub.toJSON();
  await api.pushSubscribe({ kind: "web", endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth });
  ls.set(EP_KEY, sub.endpoint);
}

/* ── 안드 앱(FCM) ── */
async function nativeToken(ask: boolean): Promise<string> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive !== "granted") {
    if (!ask) throw new Error("permission");
    perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") throw new Error("permission");
  }
  return new Promise<string>((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; void ok.then((h) => h.remove()); void bad.then((h) => h.remove()); fn(); };
    const ok = PushNotifications.addListener("registration", (t) => finish(() => resolve(t.value)));
    const bad = PushNotifications.addListener("registrationError", (e) => finish(() => reject(new Error(e.error || "fcm"))));
    window.setTimeout(() => finish(() => reject(new Error("fcm-timeout"))), 15000);
    void PushNotifications.register();
  });
}

async function nativeSubscribe(ask: boolean): Promise<void> {
  const token = await nativeToken(ask);
  const prev = ls.get(EP_KEY);
  if (prev && prev !== token) await api.pushUnsubscribe(prev);
  await api.pushSubscribe({ kind: "fcm", endpoint: token });
  ls.set(EP_KEY, token);
}

/** 켜기 — 권한을 묻는다. 실패하면 던진다(message: permission · server · …). */
export async function enablePush(): Promise<void> {
  if (isNativeApp()) { if (!nativeFcmReady()) throw new Error("unsupported"); await nativeSubscribe(true); }
  else if (webPushAvailable()) await webSubscribe(true);
  else throw new Error("unsupported");
  ls.set(WANT_KEY, "1");
}

/** 끄기 — 서버 구독을 걷고 이 기기 뜻도 지운다. */
export async function disablePush(): Promise<void> {
  ls.set(WANT_KEY, null);
  const ep = ls.get(EP_KEY);
  ls.set(EP_KEY, null);
  if (ep) await api.pushUnsubscribe(ep);
  if (!isNativeApp() && webPushAvailable()) {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe().catch(() => false);
  }
}

/** 지금 켜져 있나(이 기기 뜻 + 서버에 이 회원 몫으로 걸려 있나). */
export async function pushIsOn(): Promise<boolean> {
  if (!pushWanted()) return false;
  const ep = ls.get(EP_KEY);
  if (!ep) return false;
  try { return await api.pushState(ep); } catch { return false; }
}

/** 로그인한 채 앱이 뜰 때 — 켬 뜻이 있고 권한이 살아 있으면 조용히 다시 건다(토큰 갱신 · 다른 회원으로 바뀐 기기). */
export async function ensurePush(): Promise<void> {
  if (!pushWanted()) return;
  try {
    if (isNativeApp()) { if (nativeFcmReady()) await nativeSubscribe(false); }
    else if (webPushAvailable()) await webSubscribe(false);
  } catch { /* 권한이 사라졌으면 그대로 둔다 — 앱 설정에서 다시 켠다 */ }
}

/** 로그아웃 — 서버 구독만 걷는다(켬 뜻은 남겨 다음 로그인에 다시 건다). */
export function pushOnLogout(): void {
  const ep = ls.get(EP_KEY);
  if (ep) void api.pushUnsubscribe(ep);
}

/** 알림을 눌러 들어온 길 — 서비스워커가 보낸 주소(웹) · FCM 탭(앱)으로 화면을 옮긴다. 앱이 한 번 부른다. */
export function installPushOpenHandlers(): void {
  const open = (url: unknown) => {
    if (typeof url !== "string" || !url.startsWith("/")) return;
    navigateTo(url.split("?")[0], { search: url.includes("?") ? url.split("?")[1] : "" });
  };
  if (isNativeApp()) {
    void import("@capacitor/push-notifications").then(({ PushNotifications }) => {
      void PushNotifications.addListener("pushNotificationActionPerformed", (a) => open(a.notification.data?.url));
    });
  } else if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      const d = e.data as { type?: string; url?: string } | null;
      if (d?.type === "scr-push-open") open(d.url);
    });
  }
}
