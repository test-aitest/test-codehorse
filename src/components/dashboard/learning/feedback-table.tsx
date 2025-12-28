"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Pencil, Clock } from "lucide-react";

interface FeedbackItem {
  id: string;
  type: string;
  userAction: string;
  aiSuggestion: string | null;
  userCode: string | null;
  filePath: string;
  language: string | null;
  createdAt: Date;
  processedAt: Date | null;
  extractedRules: Array<{ id: string; ruleText: string }>;
}

interface FeedbackTableProps {
  feedbacks: FeedbackItem[];
}

const ACTION_CONFIG = {
  ACCEPTED: {
    icon: CheckCircle,
    label: "Accepted",
    color: "bg-green-100 text-green-800",
  },
  REJECTED: {
    icon: XCircle,
    label: "Rejected",
    color: "bg-red-100 text-red-800",
  },
  MODIFIED: {
    icon: Pencil,
    label: "Modified",
    color: "bg-blue-100 text-blue-800",
  },
  IGNORED: {
    icon: Clock,
    label: "Ignored",
    color: "bg-gray-100 text-gray-800",
  },
} as const;

export function FeedbackTable({ feedbacks }: FeedbackTableProps) {
  if (feedbacks.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No feedback recorded yet.</p>
        <p className="text-sm mt-2">
          Feedback is collected when you accept, reject, or modify AI review suggestions.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>File</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Language</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Extracted Rules</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {feedbacks.map((feedback) => {
            const actionConfig = ACTION_CONFIG[feedback.userAction as keyof typeof ACTION_CONFIG];
            const ActionIcon = actionConfig?.icon || Clock;

            return (
              <TableRow key={feedback.id}>
                <TableCell className="whitespace-nowrap">
                  {feedback.createdAt.toLocaleDateString()}
                </TableCell>
                <TableCell className="max-w-[200px] truncate font-mono text-sm">
                  {feedback.filePath}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={actionConfig?.color || "bg-gray-100"}
                  >
                    <ActionIcon className="h-3 w-3 mr-1" />
                    {actionConfig?.label || feedback.userAction}
                  </Badge>
                </TableCell>
                <TableCell>
                  {feedback.language ? (
                    <Badge variant="outline">{feedback.language}</Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {feedback.processedAt ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      Processed
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                      Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {feedback.extractedRules.length > 0 ? (
                    <span className="text-sm">
                      {feedback.extractedRules.length} rule(s)
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
