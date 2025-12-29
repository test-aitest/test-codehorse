/**
 * CodeHorse Service Worker
 * Web Push通知の受信とクリックハンドリング
 */

// Push通知受信ハンドラー
self.addEventListener("push", (event) => {
  console.log("[SW] Push event received!");

  if (!event.data) {
    console.log("[SW] Push received but no data");
    return;
  }

  let data;
  try {
    data = event.data.json();
    console.log("[SW] Push data:", JSON.stringify(data));
  } catch (e) {
    console.error("[SW] Failed to parse push data:", e);
    return;
  }

  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag: data.tag || "codehorse",
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url,
      timestamp: Date.now(),
    },
    actions: [
      { action: "open", title: "View on GitHub" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "CodeHorse", options)
  );
});

// 通知クリックハンドラー
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url;

  // Dismissアクションの場合は何もしない
  if (event.action === "dismiss" || !url) {
    return;
  }

  // GitHubコメントURLへ遷移
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // 既存のウィンドウがあればフォーカス
        for (const client of clientList) {
          if (client.url === url && "focus" in client) {
            return client.focus();
          }
        }
        // なければ新規ウィンドウで開く
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Service Workerインストール
self.addEventListener("install", () => {
  console.log("[SW] Installing...");
  self.skipWaiting();
});

// Service Workerアクティベート
self.addEventListener("activate", () => {
  console.log("[SW] Activated");
});
