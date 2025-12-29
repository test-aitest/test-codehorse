/**
 * Phase 5: README Analyzer Tests
 */

import { describe, it, expect } from "vitest";
import {
  analyzeReadme,
  createMissingReadmeResult,
  formatReadmeAnalysisMarkdown,
  generateMissingSectionsTemplate,
} from "../readme-analyzer";

describe("analyzeReadme", () => {
  describe("セクション検出", () => {
    it("タイトルを検出", () => {
      const content = `# My Project

This is a project description.
      `;

      const result = analyzeReadme(content);

      const titleSection = result.sections.find(s => s.name === "Title");
      expect(titleSection?.exists).toBe(true);
    });

    it("説明セクションを検出", () => {
      const content = `# My Project

## 概要

これはプロジェクトの説明です。
      `;

      const result = analyzeReadme(content);

      const descSection = result.sections.find(s => s.name === "Description");
      expect(descSection?.exists).toBe(true);
    });

    it("インストールセクションを検出", () => {
      const content = `# My Project

## Installation

\`\`\`bash
npm install my-project
\`\`\`
      `;

      const result = analyzeReadme(content);

      const installSection = result.sections.find(s => s.name === "Installation");
      expect(installSection?.exists).toBe(true);
    });

    it("使い方セクションを検出", () => {
      const content = `# My Project

## Usage

\`\`\`javascript
import { myFunc } from 'my-project';
myFunc();
\`\`\`
      `;

      const result = analyzeReadme(content);

      const usageSection = result.sections.find(s => s.name === "Usage");
      expect(usageSection?.exists).toBe(true);
    });

    it("日本語セクション名も検出", () => {
      const content = `# My Project

## インストール

\`\`\`bash
npm install my-project
\`\`\`

## 使い方

基本的な使い方...
      `;

      const result = analyzeReadme(content);

      const installSection = result.sections.find(s => s.name === "Installation");
      expect(installSection?.exists).toBe(true);

      const usageSection = result.sections.find(s => s.name === "Usage");
      expect(usageSection?.exists).toBe(true);
    });
  });

  describe("不足セクションの検出", () => {
    it("必須セクションの欠落を検出", () => {
      const content = `# My Project

Some description here.
      `;

      const result = analyzeReadme(content);

      // Installation, Usageが不足しているはず
      const missingRequired = result.missingSections.filter(s => s.importance === "required");
      expect(missingRequired.length).toBeGreaterThan(0);
    });

    it("推奨セクションの欠落を検出", () => {
      const content = `# Complete Project

## Description

A complete project.

## Installation

npm install

## Usage

Use it.
      `;

      const result = analyzeReadme(content);

      // 推奨セクション（Features, Contributing, License等）が不足しているはず
      const missingRecommended = result.missingSections.filter(s => s.importance === "recommended");
      expect(missingRecommended.length).toBeGreaterThan(0);
    });
  });

  describe("品質スコア計算", () => {
    it("最小限のREADMEは低スコア", () => {
      const content = `# Project`;

      const result = analyzeReadme(content);

      expect(result.qualityScore).toBeLessThan(50);
    });

    it("完全なREADMEは中程度以上のスコア", () => {
      const content = `# Complete Project

This is a comprehensive description of the project.

## Features

- Feature 1
- Feature 2

## Installation

\`\`\`bash
npm install complete-project
\`\`\`

## Usage

\`\`\`javascript
import { something } from 'complete-project';
something();
\`\`\`

## API Reference

### function something()

Does something.

## Contributing

Please read CONTRIBUTING.md

## License

MIT
      `;

      const result = analyzeReadme(content);

      // 完全なREADMEは60以上のスコア
      expect(result.qualityScore).toBeGreaterThan(60);
    });

    it("コードブロックがあるとスコアアップ", () => {
      const minimalContent = `# Project

Description.

## Installation

Install it.
      `;

      const withCodeBlocks = `# Project

Description.

## Installation

\`\`\`bash
npm install
\`\`\`
      `;

      const minimalResult = analyzeReadme(minimalContent);
      const withCodeResult = analyzeReadme(withCodeBlocks);

      expect(withCodeResult.qualityScore).toBeGreaterThan(minimalResult.qualityScore);
    });

    it("リンクがあるとスコアアップ", () => {
      const withoutLinks = `# Project

Description here.
      `;

      const withLinks = `# Project

See [documentation](https://example.com) for more info.
      `;

      const withoutLinksResult = analyzeReadme(withoutLinks);
      const withLinksResult = analyzeReadme(withLinks);

      expect(withLinksResult.qualityScore).toBeGreaterThan(withoutLinksResult.qualityScore);
    });
  });

  describe("オプション", () => {
    it("プロジェクトタイプを指定", () => {
      const content = `# My Library`;

      const result = analyzeReadme(content, "README.md", {
        projectType: "library",
      });

      expect(result).toBeDefined();
    });
  });
});

describe("createMissingReadmeResult", () => {
  it("READMEがない場合の結果を生成", () => {
    const result = createMissingReadmeResult();

    expect(result.exists).toBe(false);
    expect(result.qualityScore).toBe(0);
    expect(result.missingSections.length).toBeGreaterThan(0);
  });

  it("カスタムパスを指定", () => {
    const result = createMissingReadmeResult("docs/README.md");

    expect(result.filePath).toBe("docs/README.md");
  });
});

describe("formatReadmeAnalysisMarkdown", () => {
  it("分析結果をMarkdownで出力", () => {
    const content = `# My Project

Description.
      `;

    const result = analyzeReadme(content);
    const markdown = formatReadmeAnalysisMarkdown(result);

    expect(markdown).toContain("README");
    expect(markdown).toContain("品質スコア");
  });

  it("READMEがない場合の警告", () => {
    const result = createMissingReadmeResult();
    const markdown = formatReadmeAnalysisMarkdown(result);

    expect(markdown).toContain("READMEファイルが見つかりません");
  });
});

describe("generateMissingSectionsTemplate", () => {
  it("不足セクションのテンプレートを生成", () => {
    const content = `# Project`;
    const result = analyzeReadme(content);

    const template = generateMissingSectionsTemplate(result.missingSections);

    // インストールセクションのテンプレートが含まれる
    expect(template).toContain("インストール");
  });

  it("パッケージマネージャーを指定", () => {
    const content = `# Project`;
    const result = analyzeReadme(content);

    const template = generateMissingSectionsTemplate(result.missingSections, {
      packageManager: "yarn",
    });

    // テンプレートにインストールセクションが含まれる
    expect(template).toContain("インストール");
  });
});
