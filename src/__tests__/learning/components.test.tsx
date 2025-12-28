import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LearningRule, RuleType, RuleSource } from "@prisma/client";

// Mock the server actions
vi.mock("@/app/(dashboard)/dashboard/learning/actions", () => ({
  deleteRule: vi.fn().mockResolvedValue({ success: true }),
  setRulePriority: vi.fn().mockResolvedValue({ success: true }),
  createRule: vi.fn().mockResolvedValue({ success: true, rule: { id: "new-rule" } }),
  updateRule: vi.fn().mockResolvedValue({ success: true }),
}));

import { RuleStats } from "@/components/dashboard/learning/rule-stats";
import { RulesTable } from "@/components/dashboard/learning/rules-table";
import { FeedbackTable } from "@/components/dashboard/learning/feedback-table";
import { AddRuleDialog } from "@/components/dashboard/learning/add-rule-dialog";

// Helper to create mock rules
function createMockRule(overrides: Partial<LearningRule> = {}): LearningRule {
  return {
    id: "rule-1",
    installationId: 123,
    repositoryId: null,
    ruleText: "Always use const for variables that are not reassigned",
    ruleType: "STYLE" as RuleType,
    source: "EXPLICIT" as RuleSource,
    language: "typescript",
    category: "variables",
    confidence: 0.9,
    usageCount: 5,
    lastUsedAt: new Date("2024-01-15"),
    pineconeId: "pinecone-1",
    feedbackId: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-10"),
    ...overrides,
  };
}

describe("RuleStats Component", () => {
  it("should render all stat cards", () => {
    const stats = {
      totalRules: 25,
      activeRules: 20,
      lowConfidenceRules: 3,
      recentlyUsedRules: 15,
    };

    render(<RuleStats stats={stats} />);

    expect(screen.getByText("Total Rules")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("Active Rules")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("Low Confidence")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Recently Used")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("should render zero stats correctly", () => {
    const stats = {
      totalRules: 0,
      activeRules: 0,
      lowConfidenceRules: 0,
      recentlyUsedRules: 0,
    };

    render(<RuleStats stats={stats} />);

    const zeros = screen.getAllByText("0");
    expect(zeros).toHaveLength(4);
  });
});

describe("RulesTable Component", () => {
  it("should render empty state when no rules", () => {
    render(<RulesTable rules={[]} />);

    expect(screen.getByText("No learning rules yet.")).toBeInTheDocument();
  });

  it("should render rules in table", () => {
    const rules = [
      createMockRule({ id: "rule-1", ruleText: "Rule one" }),
      createMockRule({ id: "rule-2", ruleText: "Rule two", ruleType: "SECURITY" }),
    ];

    render(<RulesTable rules={rules} />);

    expect(screen.getByText("Rule one")).toBeInTheDocument();
    expect(screen.getByText("Rule two")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });

  it("should display confidence as percentage", () => {
    const rules = [createMockRule({ confidence: 0.85 })];

    render(<RulesTable rules={rules} />);

    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("should display language badge when set", () => {
    const rules = [createMockRule({ language: "typescript" })];

    render(<RulesTable rules={rules} />);

    expect(screen.getByText("typescript")).toBeInTheDocument();
  });

  it("should display usage count", () => {
    const rules = [createMockRule({ usageCount: 10 })];

    render(<RulesTable rules={rules} />);

    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("should expand row on chevron click", async () => {
    const rules = [createMockRule({ category: "test-category" })];

    render(<RulesTable rules={rules} />);

    // Initially category should not be visible in the main row
    expect(screen.queryByText("Category:")).not.toBeInTheDocument();

    // Click expand button
    const expandButtons = screen.getAllByRole("button");
    const expandButton = expandButtons.find(btn =>
      btn.querySelector('svg.lucide-chevron-down')
    );
    if (expandButton) {
      await userEvent.click(expandButton);
    }

    // Now expanded details should be visible
    await waitFor(() => {
      expect(screen.getByText("Full Rule:")).toBeInTheDocument();
    });
  });

  it("should show delete confirmation on delete click", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const rules = [createMockRule()];

    render(<RulesTable rules={rules} />);

    // Find the trash button by looking for svg with lucide-trash-2 class
    const buttons = screen.getAllByRole("button");
    const trashButton = buttons.find(btn =>
      btn.querySelector('svg.lucide-trash-2')
    );

    expect(trashButton).toBeDefined();
    if (trashButton) {
      await userEvent.click(trashButton);
    }

    expect(confirmSpy).toHaveBeenCalledWith(
      "Are you sure you want to delete this rule?"
    );

    confirmSpy.mockRestore();
  });
});

describe("FeedbackTable Component", () => {
  it("should render empty state when no feedbacks", () => {
    render(<FeedbackTable feedbacks={[]} />);

    expect(screen.getByText("No feedback recorded yet.")).toBeInTheDocument();
  });

  it("should render feedback items", () => {
    const feedbacks = [
      {
        id: "feedback-1",
        type: "INLINE_COMMENT",
        userAction: "REJECTED",
        aiSuggestion: "Use let instead",
        userCode: null,
        filePath: "src/index.ts",
        language: "typescript",
        createdAt: new Date("2024-01-15"),
        processedAt: new Date("2024-01-16"),
        extractedRules: [{ id: "rule-1", ruleText: "Prefer const" }],
      },
    ];

    render(<FeedbackTable feedbacks={feedbacks} />);

    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("Processed")).toBeInTheDocument();
    expect(screen.getByText("1 rule(s)")).toBeInTheDocument();
  });

  it("should show Pending status when not processed", () => {
    const feedbacks = [
      {
        id: "feedback-1",
        type: "INLINE_COMMENT",
        userAction: "MODIFIED",
        aiSuggestion: "Original suggestion",
        userCode: "Modified code",
        filePath: "src/app.ts",
        language: "typescript",
        createdAt: new Date("2024-01-15"),
        processedAt: null,
        extractedRules: [],
      },
    ];

    render(<FeedbackTable feedbacks={feedbacks} />);

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Modified")).toBeInTheDocument();
  });

  it("should show different action badges", () => {
    const feedbacks = [
      {
        id: "f1",
        type: "INLINE_COMMENT",
        userAction: "ACCEPTED",
        aiSuggestion: null,
        userCode: null,
        filePath: "a.ts",
        language: null,
        createdAt: new Date(),
        processedAt: null,
        extractedRules: [],
      },
      {
        id: "f2",
        type: "INLINE_COMMENT",
        userAction: "IGNORED",
        aiSuggestion: null,
        userCode: null,
        filePath: "b.ts",
        language: null,
        createdAt: new Date(),
        processedAt: null,
        extractedRules: [],
      },
    ];

    render(<FeedbackTable feedbacks={feedbacks} />);

    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Ignored")).toBeInTheDocument();
  });
});

describe("AddRuleDialog Component", () => {
  it("should render add button", () => {
    render(<AddRuleDialog />);

    expect(screen.getByRole("button", { name: /add rule/i })).toBeInTheDocument();
  });

  it("should open dialog on button click", async () => {
    render(<AddRuleDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));

    await waitFor(() => {
      expect(screen.getByText("Add Learning Rule")).toBeInTheDocument();
    });
  });

  it("should have required form fields", async () => {
    render(<AddRuleDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/rule description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/rule type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/language/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    });
  });

  it("should show validation error for short rule text", async () => {
    render(<AddRuleDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));

    await waitFor(() => {
      expect(screen.getByText("Add Learning Rule")).toBeInTheDocument();
    });

    // Enter short text
    const textarea = screen.getByLabelText(/rule description/i);
    await userEvent.type(textarea, "short");

    // Click create
    await userEvent.click(screen.getByRole("button", { name: /create rule/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();
    });
  });

  it("should have language select with options", async () => {
    render(<AddRuleDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));

    await waitFor(() => {
      const languageSelect = screen.getByLabelText(/language/i);
      expect(languageSelect).toBeInTheDocument();
      expect(languageSelect.tagName).toBe("SELECT");
    });

    // Check for language options
    const languageSelect = screen.getByLabelText(/language/i);
    expect(languageSelect).toContainHTML("typescript");
    expect(languageSelect).toContainHTML("python");
  });

  it("should have rule type select with all options", async () => {
    render(<AddRuleDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add rule/i }));

    await waitFor(() => {
      const typeSelect = screen.getByLabelText(/rule type/i);
      expect(typeSelect).toBeInTheDocument();
    });

    const typeSelect = screen.getByLabelText(/rule type/i);
    expect(typeSelect).toContainHTML("Style");
    expect(typeSelect).toContainHTML("Security");
    expect(typeSelect).toContainHTML("Performance");
  });
});
