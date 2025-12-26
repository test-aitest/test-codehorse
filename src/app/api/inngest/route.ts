import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  reviewPR,
  reviewPRIncremental,
  indexRepositoryJob,
  incrementalIndexJob,
  indexOnInstallJob,
  deleteIndexJob,
  chatResponseJob,
} from "@/inngest/functions";

// Inngest サーバーハンドラーを作成
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    reviewPR,
    reviewPRIncremental,
    indexRepositoryJob,
    incrementalIndexJob,
    indexOnInstallJob,
    deleteIndexJob,
    chatResponseJob,
  ],
});
