"use client";

import { useState, useEffect, useCallback } from "react";
import { parse, stringify } from "yaml";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Loader2, FileCode, RotateCcw } from "lucide-react";

// デフォルトの設定テンプレート
const DEFAULT_CONFIG = `# CodeHorse Configuration
# このファイルでAIレビューの動作をカスタマイズできます

# レビュー設定
review:
  # レビューの言語（"ja" または "en"）
  language: "ja"

  # レビューの厳格さ（"strict", "normal", "lenient"）
  strictness: "normal"

  # 自動レビューを有効にする
  auto_review: true

  # 増分レビューを有効にする
  incremental_review: true

# 無視するファイルパターン
ignore:
  - "**/*.min.js"
  - "**/*.min.css"
  - "**/node_modules/**"
  - "**/dist/**"
  - "**/build/**"
  - "**/*.lock"
  - "**/*.log"

# フォーカスするファイルパターン（指定した場合、これらのファイルのみレビュー）
# focus:
#   - "src/**/*.ts"
#   - "src/**/*.tsx"

# カスタムルール
# rules:
#   - name: "No console.log"
#     pattern: "console.log"
#     message: "本番コードでは console.log を使用しないでください"
#     severity: "warning"
`;

interface YamlEditorProps {
  repositoryId: string;
  initialConfig: string | null;
  onSave: (config: string) => Promise<{ success: boolean; error?: string }>;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
  parsed?: unknown;
}

function validateYaml(content: string): ValidationResult {
  if (!content.trim()) {
    return { isValid: true, parsed: null };
  }

  try {
    const parsed = parse(content);
    return { isValid: true, parsed };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "Invalid YAML",
    };
  }
}

export function YamlEditor({ repositoryId, initialConfig, onSave }: YamlEditorProps) {
  const [content, setContent] = useState(initialConfig || DEFAULT_CONFIG);
  const [originalContent, setOriginalContent] = useState(initialConfig || DEFAULT_CONFIG);
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // YAMLをリアルタイムでバリデーション
  useEffect(() => {
    const result = validateYaml(content);
    setValidation(result);
  }, [content]);

  const hasChanges = content !== originalContent;

  const handleSave = useCallback(async () => {
    if (!validation.isValid) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const result = await onSave(content);
      if (result.success) {
        setOriginalContent(content);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(result.error || "Failed to save configuration");
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [content, validation.isValid, onSave]);

  const handleReset = () => {
    setContent(originalContent);
    setSaveError(null);
  };

  const handleUseDefault = () => {
    setContent(DEFAULT_CONFIG);
    setSaveError(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Repository Configuration
            </CardTitle>
            <CardDescription className="mt-1">
              YAML形式でレビュー設定をカスタマイズできます
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {validation.isValid ? (
              <Badge variant="outline" className="gap-1 text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Valid YAML
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Invalid YAML
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Editor */}
        <div className="relative">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="font-mono text-sm min-h-[400px] resize-y"
            placeholder="Enter YAML configuration..."
          />
          {!validation.isValid && validation.error && (
            <div className="mt-2 p-3 rounded-md bg-destructive/10 border border-destructive/50">
              <p className="text-sm text-destructive font-medium">Validation Error</p>
              <p className="text-sm text-destructive/80 mt-1">{validation.error}</p>
            </div>
          )}
        </div>

        {/* Status Messages */}
        {saveError && (
          <div className="p-3 rounded-md bg-destructive/10 border border-destructive/50">
            <p className="text-sm text-destructive">{saveError}</p>
          </div>
        )}
        {saveSuccess && (
          <div className="p-3 rounded-md bg-green-500/10 border border-green-500/50">
            <p className="text-sm text-green-600">Configuration saved successfully!</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleUseDefault}
              disabled={isSaving}
            >
              Use Default Template
            </Button>
            {hasChanges && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={isSaving}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Changes
              </Button>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={!validation.isValid || !hasChanges || isSaving}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Configuration
          </Button>
        </div>

        {/* Help Text */}
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Available settings:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><code>review.language</code>: レビューコメントの言語（ja/en）</li>
            <li><code>review.strictness</code>: レビューの厳格さ（strict/normal/lenient）</li>
            <li><code>review.auto_review</code>: 自動レビューの有効/無効</li>
            <li><code>review.incremental_review</code>: 増分レビューの有効/無効</li>
            <li><code>ignore</code>: 無視するファイルパターン（glob形式）</li>
            <li><code>focus</code>: レビュー対象を限定するパターン</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
