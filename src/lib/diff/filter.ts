// レビュー対象から除外するファイルパターン
const EXCLUDED_PATTERNS = [
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^bun\.lockb$/,
  /^\.next\//,
  /^dist\//,
  /^build\//,
  /^out\//,
  /^node_modules\//,
  /^\.git\//,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.d\.ts$/, // 型定義ファイル（生成物）
  /^vendor\//,
  /^\.env/, // 環境変数ファイル
  /^\.DS_Store$/,
  /^Thumbs\.db$/,
  /\.pyc$/,
  /^__pycache__\//,
  /\.class$/,
  /^target\//,
  /^\.idea\//,
  /^\.vscode\//,
];

// レビュー対象の拡張子
const REVIEWABLE_EXTENSIONS = [
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
];

/**
 * ファイルをレビュー対象にすべきかチェック
 */
export function shouldReviewFile(filePath: string): boolean {
  // 除外パターンチェック
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(filePath)) {
      return false;
    }
  }

  // 拡張子チェック
  const fileName = filePath.split("/").pop() || "";

  return REVIEWABLE_EXTENSIONS.some(
    (ext) => filePath.endsWith(ext) || fileName === ext
  );
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

  const languageMap: Record<string, string> = {
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

  return languageMap[ext] || "plaintext";
}
