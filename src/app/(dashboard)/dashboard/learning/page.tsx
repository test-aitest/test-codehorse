import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RuleStats } from "@/components/dashboard/learning/rule-stats";
import { RulesTable } from "@/components/dashboard/learning/rules-table";
import { FeedbackTable } from "@/components/dashboard/learning/feedback-table";
import { AddRuleDialog } from "@/components/dashboard/learning/add-rule-dialog";
import { getRules, getRuleStats, getFeedbackHistory } from "./actions";

export default async function LearningPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  const [rules, stats, { feedbacks }] = await Promise.all([
    getRules(),
    getRuleStats(),
    getFeedbackHistory({ limit: 50 }),
  ]);

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Learning Rules"
        description="Manage AI learning rules extracted from your feedback"
      />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <RuleStats stats={stats} />

        <Tabs defaultValue="rules" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
              <TabsTrigger value="feedback">Feedback History</TabsTrigger>
            </TabsList>
            <AddRuleDialog />
          </div>

          <TabsContent value="rules" className="space-y-4">
            <RulesTable rules={rules} />
          </TabsContent>

          <TabsContent value="feedback" className="space-y-4">
            <FeedbackTable feedbacks={feedbacks} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
