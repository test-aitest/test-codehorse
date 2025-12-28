"use client";

import { useState, useTransition, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  updateRule,
  deleteRule,
} from "@/app/(dashboard)/dashboard/learning/actions";
import type { RuleType, LearningRule } from "@prisma/client";

const RULE_TYPES: { value: RuleType; label: string }[] = [
  { value: "STYLE", label: "Style" },
  { value: "PATTERN", label: "Pattern" },
  { value: "NAMING", label: "Naming" },
  { value: "ARCHITECTURE", label: "Architecture" },
  { value: "SECURITY", label: "Security" },
  { value: "PERFORMANCE", label: "Performance" },
  { value: "TESTING", label: "Testing" },
  { value: "OTHER", label: "Other" },
];

interface EditRuleDialogProps {
  rule: LearningRule;
  open: boolean;
  onClose: () => void;
}

export function EditRuleDialog({ rule, open, onClose }: EditRuleDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Use rule properties to reset form state when rule changes
  const initialValues = useMemo(
    () => ({
      ruleText: rule.ruleText,
      ruleType: rule.ruleType,
      language: rule.language || "",
      category: rule.category || "",
      confidence: Math.round(rule.confidence * 100),
    }),
    [
      rule.ruleText,
      rule.ruleType,
      rule.language,
      rule.category,
      rule.confidence,
    ]
  );

  const [ruleText, setRuleText] = useState(initialValues.ruleText);
  const [ruleType, setRuleType] = useState<RuleType>(initialValues.ruleType);
  const [language, setLanguage] = useState(initialValues.language);
  const [category, setCategory] = useState(initialValues.category);
  const [confidence, setConfidence] = useState(initialValues.confidence);

  // Reset form when rule changes
  const [lastRuleId, setLastRuleId] = useState(rule.id);
  if (rule.id !== lastRuleId) {
    setRuleText(rule.ruleText);
    setRuleType(rule.ruleType);
    setLanguage(rule.language || "");
    setCategory(rule.category || "");
    setConfidence(Math.round(rule.confidence * 100));
    setError(null);
    setLastRuleId(rule.id);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (ruleText.trim().length < 10) {
      setError("Rule text must be at least 10 characters");
      return;
    }

    startTransition(async () => {
      const result = await updateRule(rule.id, {
        ruleText: ruleText.trim(),
        ruleType,
        language: language.trim() || null,
        category: category.trim() || null,
        confidence: confidence / 100,
      });

      if (result.success) {
        onClose();
      } else {
        setError(result.error || "Failed to update rule");
      }
    });
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this rule? This action cannot be undone."
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteRule(rule.id);
      if (result.success) {
        onClose();
      } else {
        setError(result.error || "Failed to delete rule");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-131.25">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Learning Rule</DialogTitle>
            <DialogDescription>
              Modify the rule details. Changes will affect future reviews.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ruleText">Rule Description *</Label>
              <Textarea
                id="ruleText"
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
                rows={3}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ruleType">Rule Type *</Label>
              <select
                id="ruleType"
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value as RuleType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {RULE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="language">Language</Label>
              <Input
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="Leave empty for all languages"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="confidence">Confidence: {confidence}%</Label>
              <input
                type="range"
                id="confidence"
                min="0"
                max="100"
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <p className="text-xs text-muted-foreground">
                Higher confidence = more likely to be applied in reviews
              </p>
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>

          <DialogFooter className="flex justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              Delete
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
