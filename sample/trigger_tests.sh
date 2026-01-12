#!/bin/bash
# 並行テスト実行スクリプト
# 使用方法: ./trigger_tests.sh <github_token> <repo_owner/repo_name>

set -e

GITHUB_TOKEN="$1"
REPO="$2"  # e.g., "test-aitest/test-codehorse"

if [ -z "$GITHUB_TOKEN" ] || [ -z "$REPO" ]; then
    echo "Usage: $0 <github_token> <repo_owner/repo_name>"
    exit 1
fi

# テストケースをBase64エンコード
TEST_CASES_B64=$(cat test_cases.json | base64 | tr -d '\n')

# 各言語のソリューションをBase64エンコードしてワークフローをトリガー
trigger_workflow() {
    local lang=$1
    local file=$2
    local code_b64=$(cat "$file" | base64 | tr -d '\n')
    local eval_id="test-${lang}-$(date +%s)"

    echo "Triggering workflow for $lang..."

    curl -X POST \
        -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com/repos/$REPO/actions/workflows/leetcode-benchmark.yml/dispatches" \
        -d "{
            \"ref\": \"main\",
            \"inputs\": {
                \"evaluation_id\": \"$eval_id\",
                \"language\": \"$lang\",
                \"code\": \"$code_b64\",
                \"test_cases\": \"$TEST_CASES_B64\",
                \"run_count\": \"20\",
                \"callback_url\": \"https://httpbin.org/post\"
            }
        }" &
}

# 全言語を並行でトリガー
trigger_workflow "python" "solution.py"
trigger_workflow "javascript" "solution.js"
trigger_workflow "typescript" "solution.ts"
trigger_workflow "java" "Solution.java"
trigger_workflow "go" "solution.go"
trigger_workflow "swift" "solution.swift"

# 全てのバックグラウンドジョブを待機
wait

echo "All workflows triggered!"
echo "Check GitHub Actions for results."
