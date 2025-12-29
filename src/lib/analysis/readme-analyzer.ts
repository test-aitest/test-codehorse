/**
 * Phase 5: README Analyzer
 *
 * READMEファイルを分析し、不足セクションを検出
 */

// ========================================
// 型定義
// ========================================

export interface ReadmeSection {
  /** セクション名 */
  name: string;
  /** 存在するか */
  exists: boolean;
  /** 内容（存在する場合） */
  content?: string;
  /** 開始行 */
  startLine?: number;
  /** 終了行 */
  endLine?: number;
}

export interface ReadmeAnalysisResult {
  /** ファイルが存在するか */
  exists: boolean;
  /** ファイルパス */
  filePath: string;
  /** 総行数 */
  lineCount: number;
  /** 検出されたセクション */
  sections: ReadmeSection[];
  /** 推奨される不足セクション */
  missingSections: MissingSection[];
  /** 品質スコア (0-100) */
  qualityScore: number;
}

export interface MissingSection {
  /** セクション名 */
  name: string;
  /** 重要度 */
  importance: "required" | "recommended" | "optional";
  /** 説明 */
  description: string;
  /** 推奨テンプレート */
  template?: string;
}

export interface ReadmeAnalysisOptions {
  /** プロジェクトタイプ */
  projectType?: "library" | "application" | "cli" | "api";
  /** 言語 */
  language?: string;
  /** パッケージマネージャー */
  packageManager?: "npm" | "yarn" | "pnpm" | "bun";
}

// ========================================
// 標準セクション定義
// ========================================

const REQUIRED_SECTIONS = [
  { pattern: /^#\s+.*$/m, name: "Title", importance: "required" as const },
  {
    pattern: /^##?\s*(description|about|概要)/im,
    name: "Description",
    importance: "required" as const,
  },
  {
    pattern: /^##?\s*(install|installation|インストール|セットアップ)/im,
    name: "Installation",
    importance: "required" as const,
  },
  {
    pattern: /^##?\s*(usage|使い方|使用方法|getting started)/im,
    name: "Usage",
    importance: "required" as const,
  },
];

const RECOMMENDED_SECTIONS = [
  {
    pattern: /^##?\s*(feature|features|機能)/im,
    name: "Features",
    importance: "recommended" as const,
  },
  {
    pattern: /^##?\s*(api|reference|リファレンス)/im,
    name: "API Reference",
    importance: "recommended" as const,
  },
  {
    pattern: /^##?\s*(example|examples|サンプル|例)/im,
    name: "Examples",
    importance: "recommended" as const,
  },
  {
    pattern: /^##?\s*(config|configuration|設定)/im,
    name: "Configuration",
    importance: "recommended" as const,
  },
  {
    pattern: /^##?\s*(contributing|コントリビュート|貢献)/im,
    name: "Contributing",
    importance: "recommended" as const,
  },
  {
    pattern: /^##?\s*(license|ライセンス)/im,
    name: "License",
    importance: "recommended" as const,
  },
];

const OPTIONAL_SECTIONS = [
  {
    pattern: /^##?\s*(changelog|変更履歴)/im,
    name: "Changelog",
    importance: "optional" as const,
  },
  {
    pattern: /^##?\s*(roadmap|ロードマップ)/im,
    name: "Roadmap",
    importance: "optional" as const,
  },
  {
    pattern: /^##?\s*(faq|よくある質問)/im,
    name: "FAQ",
    importance: "optional" as const,
  },
  {
    pattern: /^##?\s*(troubleshoot|トラブルシューティング)/im,
    name: "Troubleshooting",
    importance: "optional" as const,
  },
  {
    pattern: /^##?\s*(acknowledgement|謝辞)/im,
    name: "Acknowledgements",
    importance: "optional" as const,
  },
];

// ========================================
// メイン関数
// ========================================

/**
 * READMEファイルを分析
 */
export function analyzeReadme(
  content: string,
  filePath: string = "README.md",
  options: ReadmeAnalysisOptions = {}
): ReadmeAnalysisResult {
  const lines = content.split("\n");
  const sections = detectSections(content);
  const missingSections = detectMissingSections(sections, options);
  const qualityScore = calculateReadmeQuality(content, sections);

  return {
    exists: true,
    filePath,
    lineCount: lines.length,
    sections,
    missingSections,
    qualityScore,
  };
}

/**
 * READMEが存在しない場合の結果を生成
 */
export function createMissingReadmeResult(
  filePath: string = "README.md"
): ReadmeAnalysisResult {
  return {
    exists: false,
    filePath,
    lineCount: 0,
    sections: [],
    missingSections: getAllRequiredSections(),
    qualityScore: 0,
  };
}

// ========================================
// セクション検出
// ========================================

function detectSections(content: string): ReadmeSection[] {
  const sections: ReadmeSection[] = [];
  const allPatterns = [
    ...REQUIRED_SECTIONS,
    ...RECOMMENDED_SECTIONS,
    ...OPTIONAL_SECTIONS,
  ];

  for (const { pattern, name } of allPatterns) {
    const match = content.match(pattern);
    if (match) {
      const startLine = content.substring(0, match.index).split("\n").length;
      sections.push({
        name,
        exists: true,
        content: extractSectionContent(content, match.index || 0),
        startLine,
      });
    } else {
      sections.push({
        name,
        exists: false,
      });
    }
  }

  // タイトルの特別処理（最初の # で始まる行）
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    const existingTitle = sections.find((s) => s.name === "Title");
    if (existingTitle) {
      existingTitle.exists = true;
      existingTitle.content = titleMatch[1];
      existingTitle.startLine = 1;
    }
  }

  // 説明の特別処理（タイトル直後の段落）
  const descSection = sections.find((s) => s.name === "Description");
  if (descSection && !descSection.exists) {
    const descMatch = content.match(/^#\s+.+\n\n([^#]+)/m);
    if (descMatch && descMatch[1].trim().length > 20) {
      descSection.exists = true;
      descSection.content = descMatch[1].trim();
      descSection.startLine = 3;
    }
  }

  return sections;
}

function extractSectionContent(content: string, startIndex: number): string {
  // 次の同レベル以上の見出しまでを取得
  const fromStart = content.substring(startIndex);
  const nextHeadingMatch = fromStart.match(/\n##?\s+/);

  if (nextHeadingMatch && nextHeadingMatch.index) {
    return fromStart.substring(0, nextHeadingMatch.index).trim();
  }

  return fromStart.trim();
}

// ========================================
// 不足セクション検出
// ========================================

function detectMissingSections(
  existingSections: ReadmeSection[],
  options: ReadmeAnalysisOptions
): MissingSection[] {
  const missing: MissingSection[] = [];

  // 必須セクション
  for (const { name } of REQUIRED_SECTIONS) {
    const section = existingSections.find((s) => s.name === name);
    if (!section?.exists) {
      missing.push({
        name,
        importance: "required",
        description: getMissingSectionDescription(name),
        template: getSectionTemplate(name, options),
      });
    }
  }

  // 推奨セクション
  for (const { name } of RECOMMENDED_SECTIONS) {
    const section = existingSections.find((s) => s.name === name);
    if (!section?.exists) {
      missing.push({
        name,
        importance: "recommended",
        description: getMissingSectionDescription(name),
        template: getSectionTemplate(name, options),
      });
    }
  }

  return missing;
}

function getAllRequiredSections(): MissingSection[] {
  return [
    ...REQUIRED_SECTIONS.map((s) => ({
      name: s.name,
      importance: "required" as const,
      description: getMissingSectionDescription(s.name),
      template: getSectionTemplate(s.name, {}),
    })),
    ...RECOMMENDED_SECTIONS.map((s) => ({
      name: s.name,
      importance: "recommended" as const,
      description: getMissingSectionDescription(s.name),
      template: getSectionTemplate(s.name, {}),
    })),
  ];
}

function getMissingSectionDescription(name: string): string {
  const descriptions: Record<string, string> = {
    Title: "プロジェクト名を示すタイトルが必要です",
    Description: "プロジェクトの概要説明が必要です",
    Installation: "インストール手順の説明が必要です",
    Usage: "基本的な使い方の説明が必要です",
    Features: "主要機能のリストを追加することを推奨します",
    "API Reference": "APIリファレンスを追加することを推奨します",
    Examples: "使用例を追加することを推奨します",
    Configuration: "設定オプションの説明を追加することを推奨します",
    Contributing: "コントリビューションガイドを追加することを推奨します",
    License: "ライセンス情報を追加することを推奨します",
  };
  return descriptions[name] || `${name} セクションが不足しています`;
}

function getSectionTemplate(
  name: string,
  options: ReadmeAnalysisOptions
): string {
  const pm = options.packageManager || "npm";

  const templates: Record<string, string> = {
    Title: "# Project Name\n\n簡潔なプロジェクトの説明をここに記載します。",
    Description: "## 概要\n\nこのプロジェクトは〇〇のためのツールです。",
    Installation: `## インストール

\`\`\`bash
${pm} install package-name
\`\`\``,
    Usage: `## 使い方

\`\`\`typescript
import { something } from 'package-name';

// 基本的な使用例
const result = something();
\`\`\``,
    Features: `## 機能

- ✨ 機能1の説明
- 🚀 機能2の説明
- 🔧 機能3の説明`,
    "API Reference": `## API リファレンス

### \`functionName(options)\`

説明...

**パラメータ:**
- \`options\` - オプションオブジェクト

**戻り値:** 結果の説明`,
    Examples: `## 例

### 基本的な使用例

\`\`\`typescript
// コード例をここに
\`\`\``,
    Configuration: `## 設定

設定ファイル \`.config.json\` を作成してカスタマイズできます：

\`\`\`json
{
  "option1": "value1"
}
\`\`\``,
    Contributing: `## コントリビューション

1. このリポジトリをフォーク
2. 機能ブランチを作成 (\`git checkout -b feature/amazing-feature\`)
3. 変更をコミット (\`git commit -m 'Add amazing feature'\`)
4. ブランチをプッシュ (\`git push origin feature/amazing-feature\`)
5. プルリクエストを作成`,
    License:
      "## ライセンス\n\nMIT License - 詳細は [LICENSE](LICENSE) を参照してください。",
  };

  return templates[name] || `## ${name}\n\n内容をここに記載`;
}

// ========================================
// 品質スコア計算
// ========================================

function calculateReadmeQuality(
  content: string,
  sections: ReadmeSection[]
): number {
  let score = 0;

  // 基本スコア（READMEが存在する）
  if (content.length > 0) score += 10;

  // 必須セクションのスコア
  const requiredSections = sections.filter((s) =>
    REQUIRED_SECTIONS.some((r) => r.name === s.name)
  );
  const requiredExists = requiredSections.filter((s) => s.exists).length;
  score += (requiredExists / REQUIRED_SECTIONS.length) * 40;

  // 推奨セクションのスコア
  const recommendedSections = sections.filter((s) =>
    RECOMMENDED_SECTIONS.some((r) => r.name === s.name)
  );
  const recommendedExists = recommendedSections.filter((s) => s.exists).length;
  score += (recommendedExists / RECOMMENDED_SECTIONS.length) * 20;

  // 内容の充実度
  if (content.length > 500) score += 10;
  if (content.length > 1000) score += 5;
  if (content.length > 2000) score += 5;

  // コードブロックの存在
  if (content.includes("```")) score += 5;

  // リンクの存在
  if (content.includes("](")) score += 5;

  return Math.min(Math.round(score), 100);
}

// ========================================
// フォーマット関数
// ========================================

/**
 * README分析結果をMarkdown形式で出力
 */
export function formatReadmeAnalysisMarkdown(
  result: ReadmeAnalysisResult
): string {
  const lines: string[] = [];

  lines.push("## 📖 README分析レポート");
  lines.push("");

  if (!result.exists) {
    lines.push("⚠️ **READMEファイルが見つかりません**");
    lines.push("");
    lines.push("READMEファイルを作成することを強く推奨します。");
    return lines.join("\n");
  }

  // サマリー
  lines.push(`- **ファイル**: ${result.filePath}`);
  lines.push(`- **行数**: ${result.lineCount}`);
  lines.push(`- **品質スコア**: ${result.qualityScore}/100`);
  lines.push("");

  // 既存セクション
  const existingSections = result.sections.filter((s) => s.exists);
  if (existingSections.length > 0) {
    lines.push("### ✅ 既存セクション");
    lines.push("");
    for (const section of existingSections) {
      lines.push(`- ${section.name}`);
    }
    lines.push("");
  }

  // 不足セクション
  if (result.missingSections.length > 0) {
    lines.push("### ⚠️ 不足セクション");
    lines.push("");

    const required = result.missingSections.filter(
      (s) => s.importance === "required"
    );
    const recommended = result.missingSections.filter(
      (s) => s.importance === "recommended"
    );

    if (required.length > 0) {
      lines.push("**必須:**");
      for (const section of required) {
        lines.push(`- 🔴 ${section.name} - ${section.description}`);
      }
      lines.push("");
    }

    if (recommended.length > 0) {
      lines.push("**推奨:**");
      for (const section of recommended) {
        lines.push(`- 🟡 ${section.name} - ${section.description}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * 不足セクションのテンプレートを生成
 */
export function generateMissingSectionsTemplate(
  missingSections: MissingSection[],
  options: ReadmeAnalysisOptions = {}
): string {
  const lines: string[] = [];

  for (const section of missingSections) {
    // optionsが指定されている場合は再生成、そうでなければ既存テンプレートを使用
    const template = options.packageManager
      ? getSectionTemplate(section.name, options)
      : section.template;

    if (template) {
      lines.push(template);
      lines.push("");
    }
  }

  return lines.join("\n");
}
