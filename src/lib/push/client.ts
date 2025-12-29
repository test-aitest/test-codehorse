/**
 * ブラウザ側 Web Push API クライアント
 * Service Workerの登録とPush通知の購読管理
 */

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Service Workerの登録
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    console.warn("[Push] Service Worker not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    console.log("[Push] Service Worker registered:", registration.scope);
    return registration;
  } catch (error) {
    console.error("[Push] Service Worker registration failed:", error);
    return null;
  }
}

/**
 * 通知許可の状態を取得
 */
export function getNotificationPermission(): NotificationPermission {
  if (!("Notification" in window)) {
    return "denied";
  }
  return Notification.permission;
}

/**
 * 通知許可をリクエスト
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    return "denied";
  }
  return Notification.requestPermission();
}

/**
 * Push購読を作成
 */
export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscriptionData | null> {
  try {
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    });

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      console.error("[Push] Invalid subscription data");
      return null;
    }

    return {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    };
  } catch (error) {
    console.error("[Push] Push subscription failed:", error);
    return null;
  }
}

/**
 * 現在のPush購読を取得
 */
export async function getCurrentSubscription(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  return registration.pushManager.getSubscription();
}

/**
 * Push購読を解除
 */
export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration
): Promise<boolean> {
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    return subscription.unsubscribe();
  }
  return true;
}

/**
 * プッシュ通知の購読状態を確認
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription !== null;
}

/**
 * OSがmacOSかどうかを判定
 */
export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/**
 * プッシュ通知をセットアップ（Service Worker登録 → 許可取得 → 購読）
 * @returns { success: boolean, needsSystemSettings: boolean }
 */
export async function setupPushNotifications(): Promise<{
  success: boolean;
  needsSystemSettings: boolean;
}> {
  // Service Worker登録
  const registration = await registerServiceWorker();
  if (!registration) {
    return { success: false, needsSystemSettings: false };
  }

  // 通知許可をリクエスト
  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    console.log("[Push] Notification permission denied");
    return { success: false, needsSystemSettings: false };
  }

  // VAPID公開鍵を取得
  const vapidKeyRes = await fetch("/api/push/vapid-key");
  if (!vapidKeyRes.ok) {
    console.error("[Push] Failed to get VAPID key");
    return { success: false, needsSystemSettings: false };
  }
  const { publicKey } = await vapidKeyRes.json();

  // 購読を作成
  const subscription = await subscribeToPush(registration, publicKey);
  if (!subscription) {
    return { success: false, needsSystemSettings: false };
  }

  // サーバーに登録
  const subscribeRes = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });

  if (!subscribeRes.ok) {
    console.error("[Push] Failed to register subscription");
    return { success: false, needsSystemSettings: false };
  }

  console.log("[Push] Push notifications setup complete");

  // macOSの場合、システム設定の確認が必要な旨を返す
  return { success: true, needsSystemSettings: isMacOS() };
}

// ヘルパー: Base64 URL を Uint8Array に変換
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
