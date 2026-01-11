/**
 * Code Security Scanner
 * 悪意のあるコード（システムコール、ファイル操作等）を事前検出
 */

import type { SupportedLanguage, SecurityScanResult } from "../types";

// 言語別のブロックパターン
const BLOCKED_PATTERNS: Record<SupportedLanguage, { pattern: RegExp; description: string }[]> = {
  python: [
    { pattern: /import\s+os\b/, description: "OS module import (system access)" },
    { pattern: /import\s+subprocess\b/, description: "Subprocess module import (command execution)" },
    { pattern: /import\s+sys\b/, description: "Sys module import" },
    { pattern: /import\s+shutil\b/, description: "Shutil module import (file operations)" },
    { pattern: /import\s+socket\b/, description: "Socket module import (network access)" },
    { pattern: /import\s+requests\b/, description: "Requests module import (HTTP access)" },
    { pattern: /import\s+urllib\b/, description: "Urllib module import (HTTP access)" },
    { pattern: /from\s+os\s+import/, description: "OS module import" },
    { pattern: /from\s+subprocess\s+import/, description: "Subprocess module import" },
    { pattern: /os\.system\s*\(/, description: "System command execution" },
    { pattern: /os\.popen\s*\(/, description: "Popen command execution" },
    { pattern: /os\.exec[lvpe]*\s*\(/, description: "Exec command execution" },
    { pattern: /os\.spawn[lvpe]*\s*\(/, description: "Spawn command execution" },
    { pattern: /subprocess\./, description: "Subprocess call" },
    { pattern: /exec\s*\(/, description: "Dynamic code execution" },
    { pattern: /eval\s*\(/, description: "Dynamic code evaluation" },
    { pattern: /__import__\s*\(/, description: "Dynamic import" },
    { pattern: /compile\s*\(.*,.*,\s*['"]exec['"]/, description: "Code compilation" },
    { pattern: /open\s*\([^)]*['"][wa]/, description: "File write operation" },
    { pattern: /os\.remove\s*\(/, description: "File deletion" },
    { pattern: /os\.unlink\s*\(/, description: "File unlinking" },
    { pattern: /shutil\.rmtree\s*\(/, description: "Directory deletion" },
  ],

  javascript: [
    { pattern: /require\s*\(\s*['"]child_process['"]/, description: "Child process module" },
    { pattern: /require\s*\(\s*['"]fs['"]/, description: "File system module" },
    { pattern: /require\s*\(\s*['"]net['"]/, description: "Network module" },
    { pattern: /require\s*\(\s*['"]http['"]/, description: "HTTP module" },
    { pattern: /require\s*\(\s*['"]https['"]/, description: "HTTPS module" },
    { pattern: /import\s+.*from\s+['"]child_process['"]/, description: "Child process import" },
    { pattern: /import\s+.*from\s+['"]fs['"]/, description: "File system import" },
    { pattern: /process\.exit\s*\(/, description: "Process exit" },
    { pattern: /process\.env\b/, description: "Environment variable access" },
    { pattern: /eval\s*\(/, description: "Dynamic code evaluation" },
    { pattern: /Function\s*\(/, description: "Dynamic function creation" },
    { pattern: /new\s+Function\s*\(/, description: "Dynamic function creation" },
    { pattern: /setTimeout\s*\([^,]*,\s*0\s*\)/, description: "Immediate timeout (potential DoS)" },
    { pattern: /setInterval\s*\(/, description: "Interval timer" },
  ],

  typescript: [
    { pattern: /require\s*\(\s*['"]child_process['"]/, description: "Child process module" },
    { pattern: /require\s*\(\s*['"]fs['"]/, description: "File system module" },
    { pattern: /require\s*\(\s*['"]net['"]/, description: "Network module" },
    { pattern: /import\s+.*from\s+['"]child_process['"]/, description: "Child process import" },
    { pattern: /import\s+.*from\s+['"]fs['"]/, description: "File system import" },
    { pattern: /process\.exit\s*\(/, description: "Process exit" },
    { pattern: /process\.env\b/, description: "Environment variable access" },
    { pattern: /eval\s*\(/, description: "Dynamic code evaluation" },
    { pattern: /Function\s*\(/, description: "Dynamic function creation" },
    { pattern: /new\s+Function\s*\(/, description: "Dynamic function creation" },
  ],

  java: [
    { pattern: /Runtime\.getRuntime\s*\(\s*\)/, description: "Runtime access" },
    { pattern: /ProcessBuilder\b/, description: "Process builder" },
    { pattern: /System\.exit\s*\(/, description: "System exit" },
    { pattern: /FileWriter\b/, description: "File writer" },
    { pattern: /FileOutputStream\b/, description: "File output stream" },
    { pattern: /Files\.delete\s*\(/, description: "File deletion" },
    { pattern: /Files\.write\s*\(/, description: "File write" },
    { pattern: /Socket\b/, description: "Network socket" },
    { pattern: /ServerSocket\b/, description: "Server socket" },
    { pattern: /URL\s*\(/, description: "URL connection" },
    { pattern: /HttpURLConnection\b/, description: "HTTP connection" },
    { pattern: /Class\.forName\s*\(/, description: "Dynamic class loading" },
    { pattern: /\.exec\s*\(/, description: "Command execution" },
  ],

  go: [
    { pattern: /os\/exec/, description: "Exec package import" },
    { pattern: /os\.Remove\s*\(/, description: "File removal" },
    { pattern: /os\.RemoveAll\s*\(/, description: "Directory removal" },
    { pattern: /os\.Create\s*\(/, description: "File creation" },
    { pattern: /os\.OpenFile\s*\(/, description: "File open" },
    { pattern: /ioutil\.WriteFile\s*\(/, description: "File write" },
    { pattern: /syscall\./, description: "Syscall access" },
    { pattern: /net\.Dial\s*\(/, description: "Network dial" },
    { pattern: /net\.Listen\s*\(/, description: "Network listen" },
    { pattern: /http\.Get\s*\(/, description: "HTTP request" },
    { pattern: /http\.Post\s*\(/, description: "HTTP post" },
    { pattern: /exec\.Command\s*\(/, description: "Command execution" },
  ],

  swift: [
    { pattern: /Process\s*\(/, description: "Process execution" },
    { pattern: /FileManager\b/, description: "File manager access" },
    { pattern: /FileHandle\b/, description: "File handle access" },
    { pattern: /URLSession\b/, description: "Network session" },
    { pattern: /URL\s*\(string:/, description: "URL creation" },
    { pattern: /try\s*!\s*FileManager/, description: "Forced file operation" },
    { pattern: /\.write\s*\(toFile:/, description: "File write operation" },
    { pattern: /\.removeItem\s*\(/, description: "File removal" },
    { pattern: /\.createFile\s*\(/, description: "File creation" },
    { pattern: /Shell\s*\(/, description: "Shell execution" },
    { pattern: /NSTask\b/, description: "NS Task (process execution)" },
    { pattern: /dlopen\s*\(/, description: "Dynamic library loading" },
    { pattern: /exit\s*\(/, description: "Process exit" },
  ],
};

// 共通の危険パターン（全言語）
const COMMON_DANGEROUS_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /while\s*\(\s*true\s*\)/, description: "Infinite loop (while true)" },
  { pattern: /while\s*\(\s*1\s*\)/, description: "Infinite loop (while 1)" },
  { pattern: /for\s*\(\s*;\s*;\s*\)/, description: "Infinite loop (for;;)" },
  { pattern: /\brecursion\b.*\bno\s+base\s+case\b/i, description: "Potential infinite recursion" },
];

/**
 * コードのセキュリティスキャンを実行
 */
export function scanCode(code: string, language: SupportedLanguage): SecurityScanResult {
  const blockedPatterns: SecurityScanResult["blockedPatterns"] = [];
  const lines = code.split("\n");

  // 言語固有のパターンをチェック
  const languagePatterns = BLOCKED_PATTERNS[language] || [];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // 言語固有パターン
    for (const { pattern, description } of languagePatterns) {
      if (pattern.test(line)) {
        blockedPatterns.push({
          pattern: pattern.source,
          line: lineNum + 1,
          description,
        });
      }
    }

    // 共通パターン
    for (const { pattern, description } of COMMON_DANGEROUS_PATTERNS) {
      if (pattern.test(line)) {
        blockedPatterns.push({
          pattern: pattern.source,
          line: lineNum + 1,
          description,
        });
      }
    }
  }

  return {
    safe: blockedPatterns.length === 0,
    blockedPatterns,
  };
}

/**
 * セキュリティスキャン結果をフォーマット
 */
export function formatSecurityReport(result: SecurityScanResult): string {
  if (result.safe) {
    return "Security scan passed. No dangerous patterns detected.";
  }

  const lines = [
    "## Security Scan Failed",
    "",
    "The following dangerous patterns were detected:",
    "",
  ];

  for (const { pattern, line, description } of result.blockedPatterns) {
    lines.push(`- **Line ${line}**: ${description}`);
    lines.push(`  - Pattern: \`${pattern}\``);
  }

  lines.push("");
  lines.push("Please remove these patterns and resubmit your solution.");

  return lines.join("\n");
}
