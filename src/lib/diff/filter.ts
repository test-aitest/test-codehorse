// レビュー対象から除外するファイルパターン（単一の正規表現に統合）
const EXCLUDED_PATTERN = new RegExp(
  [
    "^package-lock\\.json$",
    "^yarn\\.lock$",
    "^pnpm-lock\\.yaml$",
    "^bun\\.lockb$",
    "^\\.next/",
    "^dist/",
    "^build/",
    "^out/",
    "^node_modules/",
    "^\\.git/",
    "\\.min\\.(js|css)$",
    "\\.map$",
    "\\.d\\.ts$", // 型定義ファイル（生成物）
    "^vendor/",
    "^\\.env", // 環境変数ファイル
    "^\\.DS_Store$",
    "^Thumbs\\.db$",
    "\\.pyc$",
    "^__pycache__/",
    "\\.class$",
    "^target/",
    "^\\.idea/",
    "^\\.vscode/",
  ].join("|")
);

// レビュー対象の拡張子（SetでO(1)検索）
const REVIEWABLE_EXTENSIONS = new Set([
  // JavaScript/TypeScript
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  // Python
  ".py",
  // Go
  ".go",
  // Rust
  ".rs",
  // Ruby
  ".rb",
  // Java/Kotlin
  ".java",
  ".kt",
  // Swift
  ".swift",
  // C/C++
  ".c",
  ".cpp",
  ".cc",
  ".h",
  ".hpp",
  // C#
  ".cs",
  // PHP
  ".php",
  // Styles
  ".css",
  ".scss",
  ".sass",
  ".less",
  // HTML/Templates
  ".html",
  ".vue",
  ".svelte",
  ".astro",
  // Config
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  // Documentation
  ".md",
  ".mdx",
  // SQL
  ".sql",
  // Shell
  ".sh",
  ".bash",
  ".zsh",
  // Docker
  ".dockerfile",
  "Dockerfile",
]);

// 言語マッピング（モジュールレベルで1回だけ生成）
const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".vue": "vue",
  ".svelte": "svelte",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".md": "markdown",
  ".sql": "sql",
  ".sh": "bash",
};

/**
 * ファイルをレビュー対象にすべきかチェック
 */
export function shouldReviewFile(filePath: string): boolean {
  // 除外パターンチェック（単一の正規表現で高速）
  if (EXCLUDED_PATTERN.test(filePath)) {
    return false;
  }

  // 拡張子チェック（Setで O(1) 検索）
  const fileName = filePath.split("/").pop() || "";
  const ext = filePath.substring(filePath.lastIndexOf("."));

  return REVIEWABLE_EXTENSIONS.has(ext) || REVIEWABLE_EXTENSIONS.has(fileName);
}

/**
 * レビュー対象のファイルのみをフィルタリング
 */
export function filterReviewableFiles<T extends { newPath: string }>(
  files: T[]
): T[] {
  return files.filter((file) => shouldReviewFile(file.newPath));
}

/**
 * ファイルの言語を推定
 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return LANGUAGE_MAP[ext] || "plaintext";
}
