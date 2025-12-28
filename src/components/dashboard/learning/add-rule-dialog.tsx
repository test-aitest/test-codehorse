"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { createRule } from "@/app/(dashboard)/dashboard/learning/actions";
import type { RuleType } from "@prisma/client";

const RULE_TYPES: { value: RuleType; label: string }[] = [
  { value: "STYLE", label: "Style - Code formatting and styling" },
  { value: "PATTERN", label: "Pattern - Design patterns and idioms" },
  { value: "NAMING", label: "Naming - Naming conventions" },
  { value: "ARCHITECTURE", label: "Architecture - Architectural decisions" },
  { value: "SECURITY", label: "Security - Security requirements" },
  { value: "PERFORMANCE", label: "Performance - Performance guidelines" },
  { value: "TESTING", label: "Testing - Testing standards" },
  { value: "OTHER", label: "Other" },
];

const COMMON_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "java",
  "csharp",
  "ruby",
  "php",
];

export function AddRuleDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [ruleText, setRuleText] = useState("");
  const [ruleType, setRuleType] = useState<RuleType>("STYLE");
  const [language, setLanguage] = useState("");
  const [category, setCategory] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (ruleText.trim().length < 10) {
      setError("Rule text must be at least 10 characters");
      return;
    }

    startTransition(async () => {
      const result = await createRule({
        ruleText: ruleText.trim(),
        ruleType,
        language: language.trim() || undefined,
        category: category.trim() || undefined,
      });

      if (result.success) {
        setOpen(false);
        resetForm();
      } else {
        setError(result.error || "Failed to create rule");
      }
    });
  };

  const resetForm = () => {
    setRuleText("");
    setRuleType("STYLE");
    setLanguage("");
    setCategory("");
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-131.25">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Learning Rule</DialogTitle>
            <DialogDescription>
              Create a new rule for AI code reviews. This rule will be used to
              guide future reviews.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ruleText">Rule Description *</Label>
              <Textarea
                id="ruleText"
                placeholder="e.g., Always use const for variables that are not reassigned"
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
                rows={3}
                required
              />
              <p className="text-xs text-muted-foreground">
                Describe the coding rule or preference clearly (min 10
                characters)
              </p>
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
              <Label htmlFor="language">Language (optional)</Label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">All languages</option>
                {COMMON_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Leave empty to apply to all languages
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category">Category (optional)</Label>
              <Input
                id="category"
                placeholder="e.g., error-handling, logging"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
