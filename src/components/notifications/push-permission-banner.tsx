"use client";

import { useState, useEffect } from "react";
import { Bell, X, Settings, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getNotificationPermission,
  setupPushNotifications,
} from "@/lib/push/client";

type BannerState = "permission" | "system-settings" | "hidden";

export function PushPermissionBanner() {
  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    console.log("[PushBanner] Checking notification support...");

    // ブラウザがService Workerをサポートしているか確認
    if (!("serviceWorker" in navigator)) {
      console.log("[PushBanner] Service Worker not supported");
      return;
    }

    if (!("Notification" in window)) {
      console.log("[PushBanner] Notification API not supported");
      return;
    }

    const permission = getNotificationPermission();
    console.log("[PushBanner] Current permission:", permission);

    if (permission === "default") {
      // 未許可の場合、バナーを表示
      console.log("[PushBanner] Will show banner in 3 seconds...");
      const timer = setTimeout(() => {
        console.log("[PushBanner] Showing banner now");
        setBannerState("permission");
      }, 3000);
      return () => clearTimeout(timer);
    } else if (permission === "granted") {
      // 許可済みの場合、サブスクリプションを自動登録
      console.log("[PushBanner] Permission granted, auto-registering subscription...");
      setupPushNotifications().then((result) => {
        console.log("[PushBanner] Auto-registration result:", result);
        // macOSでシステム設定が必要な場合、案内バナーを表示
        if (result.success && result.needsSystemSettings) {
          // ローカルストレージで既に表示済みか確認
          const dismissed = localStorage.getItem("push-system-settings-dismissed");
          if (!dismissed) {
            setBannerState("system-settings");
          }
        }
      });
    } else {
      console.log("[PushBanner] Permission denied, not showing banner");
    }
  }, []);

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    try {
      const result = await setupPushNotifications();
      if (result.success) {
        if (result.needsSystemSettings) {
          // macOSの場合、システム設定案内を表示
          setBannerState("system-settings");
        } else {
          setBannerState("hidden");
        }
      }
    } catch (error) {
      console.error("Failed to enable notifications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenSystemSettings = () => {
    // macOSのシステム設定を開く方法を案内
    // 実際にはURLスキームで開くことはできないため、案内のみ
    alert(
      "システム設定を開いて通知を有効にしてください:\n\n" +
      "1. システム設定 を開く\n" +
      "2. 通知 をクリック\n" +
      "3. Chrome（またはお使いのブラウザ）を選択\n" +
      "4. 「通知を許可」をオンにする"
    );
  };

  if (bannerState === "hidden") return null;

  // システム設定案内バナー（macOS用）
  if (bannerState === "system-settings") {
    return (
      <Card className="fixed bottom-4 right-4 w-96 shadow-lg z-50 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900 p-2">
              <Settings className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-amber-900 dark:text-amber-100">
                macOS通知設定を確認してください
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                通知を受け取るには、macOSのシステム設定でブラウザの通知を有効にする必要があります。
              </p>
              <div className="mt-3 p-2 bg-amber-100 dark:bg-amber-900 rounded text-xs text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">設定方法:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>システム設定 → 通知</li>
                  <li>ブラウザ（Chrome等）を選択</li>
                  <li>「通知を許可」をオン</li>
                </ol>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-100"
                  onClick={handleOpenSystemSettings}
                >
                  <Settings className="h-3 w-3 mr-1" />
                  詳細を見る
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-amber-700"
                  onClick={() => {
                    localStorage.setItem("push-system-settings-dismissed", "true");
                    setBannerState("hidden");
                  }}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  設定済み
                </Button>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-amber-600"
              onClick={() => {
                localStorage.setItem("push-system-settings-dismissed", "true");
                setBannerState("hidden");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 通知許可リクエストバナー
  return (
    <Card className="fixed bottom-4 right-4 w-80 shadow-lg z-50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium">Enable Notifications</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Get notified when CodeHorse AI responds to your questions on
              GitHub.
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleEnableNotifications}
                disabled={isLoading}
              >
                {isLoading ? "Enabling..." : "Enable"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setBannerState("hidden")}
              >
                Later
              </Button>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setBannerState("hidden")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
