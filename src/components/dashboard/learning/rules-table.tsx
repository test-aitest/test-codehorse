"use client";

import React, { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { LearningRule, RuleType, RuleSource } from "@prisma/client";
import {
  deleteRule,
  setRulePriority,
  type Priority,
} from "@/app/(dashboard)/dashboard/learning/actions";
import { EditRuleDialog } from "./edit-rule-dialog";

interface RulesTableProps {
  rules: LearningRule[];
}

// ルールタイプの表示名とカラー
const RULE_TYPE_CONFIG: Record<RuleType, { label: string; color: string }> = {
  STYLE: { label: "Style", color: "bg-purple-100 text-purple-800" },
  PATTERN: { label: "Pattern", color: "bg-blue-100 text-blue-800" },
  NAMING: { label: "Naming", color: "bg-green-100 text-green-800" },
  ARCHITECTURE: {
    label: "Architecture",
    color: "bg-orange-100 text-orange-800",
  },
  SECURITY: { label: "Security", color: "bg-red-100 text-red-800" },
  PERFORMANCE: { label: "Performance", color: "bg-yellow-100 text-yellow-800" },
  TESTING: { label: "Testing", color: "bg-cyan-100 text-cyan-800" },
  OTHER: { label: "Other", color: "bg-gray-100 text-gray-800" },
};

// ソースの表示名
const SOURCE_LABELS: Record<RuleSource, string> = {
  IMPLICIT: "Learned",
  EXPLICIT: "Manual",
  SPECIFICATION: "Spec",
};

// 信頼度に応じたバッジカラー
function getConfidenceBadgeColor(confidence: number): string {
  if (confidence >= 0.8) return "bg-green-100 text-green-800";
  if (confidence >= 0.5) return "bg-yellow-100 text-yellow-800";
  if (confidence >= 0.3) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

export function RulesTable({ rules }: RulesTableProps) {
  const [isPending, startTransition] = useTransition();
  const [editingRule, setEditingRule] = useState<LearningRule | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (ruleId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;

    startTransition(async () => {
      const result = await deleteRule(ruleId);
      if (!result.success) {
        alert(`Failed to delete rule: ${result.error}`);
      }
    });
  };

  const handlePriorityChange = async (ruleId: string, priority: Priority) => {
    startTransition(async () => {
      const result = await setRulePriority(ruleId, priority);
      if (!result.success) {
        alert(`Failed to update priority: ${result.error}`);
      }
    });
  };

  if (rules.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No learning rules yet.</p>
        <p className="text-sm mt-2">
          Rules are automatically extracted from your feedback on AI reviews.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Rule</TableHead>
              <TableHead className="w-25">Type</TableHead>
              <TableHead className="w-20">Source</TableHead>
              <TableHead className="w-20">Language</TableHead>
              <TableHead className="w-25">Confidence</TableHead>
              <TableHead className="w-20">Uses</TableHead>
              <TableHead className="w-25">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <React.Fragment key={rule.id}>
                <TableRow
                  className={isPending ? "opacity-50" : ""}
                >
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => toggleRow(rule.id)}
                    >
                      {expandedRows.has(rule.id) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium max-w-75 truncate">
                    {rule.ruleText}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={RULE_TYPE_CONFIG[rule.ruleType].color}
                    >
                      {RULE_TYPE_CONFIG[rule.ruleType].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {SOURCE_LABELS[rule.source]}
                    </span>
                  </TableCell>
                  <TableCell>
                    {rule.language ? (
                      <Badge variant="outline">{rule.language}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={getConfidenceBadgeColor(rule.confidence)}
                    >
                      {Math.round(rule.confidence * 100)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {rule.usageCount}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setEditingRule(rule)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(rule.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedRows.has(rule.id) && (
                  <TableRow key={`${rule.id}-expanded`}>
                    <TableCell colSpan={8} className="bg-muted/50">
                      <div className="p-4 space-y-3">
                        <div>
                          <span className="text-sm font-medium">
                            Full Rule:
                          </span>
                          <p className="text-sm mt-1">{rule.ruleText}</p>
                        </div>
                        {rule.category && (
                          <div>
                            <span className="text-sm font-medium">
                              Category:{" "}
                            </span>
                            <span className="text-sm">{rule.category}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-sm font-medium">Created: </span>
                          <span className="text-sm">
                            {rule.createdAt.toLocaleDateString()}
                          </span>
                        </div>
                        {rule.lastUsedAt && (
                          <div>
                            <span className="text-sm font-medium">
                              Last Used:{" "}
                            </span>
                            <span className="text-sm">
                              {rule.lastUsedAt.toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        <div className="flex gap-2 pt-2">
                          <span className="text-sm font-medium mr-2">
                            Priority:
                          </span>
                          <Button
                            size="sm"
                            variant={
                              rule.confidence >= 0.9 ? "default" : "outline"
                            }
                            onClick={() =>
                              handlePriorityChange(rule.id, "high")
                            }
                            disabled={isPending}
                          >
                            High
                          </Button>
                          <Button
                            size="sm"
                            variant={
                              rule.confidence >= 0.6 && rule.confidence < 0.9
                                ? "default"
                                : "outline"
                            }
                            onClick={() =>
                              handlePriorityChange(rule.id, "normal")
                            }
                            disabled={isPending}
                          >
                            Normal
                          </Button>
                          <Button
                            size="sm"
                            variant={
                              rule.confidence < 0.6 ? "default" : "outline"
                            }
                            onClick={() => handlePriorityChange(rule.id, "low")}
                            disabled={isPending}
                          >
                            Low
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {editingRule && (
        <EditRuleDialog
          rule={editingRule}
          open={!!editingRule}
          onClose={() => setEditingRule(null)}
        />
      )}
    </>
  );
}
