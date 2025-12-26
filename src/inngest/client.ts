import { Inngest, EventSchemas } from "inngest";
import type { Events } from "./events";

// Inngestクライアントを作成
export const inngest = new Inngest({
  id: "codehorse",
  schemas: new EventSchemas().fromRecord<Events>(),
});
