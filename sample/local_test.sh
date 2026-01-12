#!/bin/bash
# ローカルDockerテストスクリプト
# 使用方法: ./local_test.sh [language]
# language: python, javascript, typescript, java, go, swift, all

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_IMAGE="leetcode-runner"

# Dockerイメージをビルド
build_image() {
    echo "Building Docker image..."
    docker build -t "$DOCKER_IMAGE" "$PROJECT_DIR/.github/leetcode-runner/"
}

# 単一言語のテスト実行
run_test() {
    local lang=$1
    local ext=$2
    local file="$SCRIPT_DIR/solution.$ext"

    # Javaの場合はファイル名を修正
    if [ "$lang" == "java" ]; then
        file="$SCRIPT_DIR/solution.java"
    fi

    if [ ! -f "$file" ]; then
        echo "SKIP: $file not found"
        return
    fi

    echo ""
    echo "=========================================="
    echo "Testing $lang..."
    echo "=========================================="

    # 作業ディレクトリ作成
    local work_dir="/tmp/leetcode_test_$lang"
    rm -rf "$work_dir"
    mkdir -p "$work_dir/results"
    chmod 777 "$work_dir/results"

    # ファイルコピー
    cp "$file" "$work_dir/"
    cp "$SCRIPT_DIR/test_cases.json" "$work_dir/"

    # Docker実行
    docker run \
        --rm \
        --network=none \
        --memory=512m \
        --cpus=1 \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=100m,uid=1000,gid=1000 \
        --tmpfs /home/leetcode/.cache:rw,exec,size=100m,uid=1000,gid=1000 \
        -v "$work_dir:/workspace:ro" \
        -v "$work_dir/results:/results:rw" \
        -v "$PROJECT_DIR/.github/leetcode-runner/helpers:/leetcode/helpers:ro" \
        --entrypoint /bin/bash \
        "$DOCKER_IMAGE" \
        -c "
            cp -r /workspace/* /tmp/
            /leetcode/runner.sh '$lang' '/tmp/solution.$ext' '/tmp/test_cases.json' '/results/result.json' '20' '10'
        " 2>&1

    # 結果表示
    if [ -f "$work_dir/results/result.json" ]; then
        echo ""
        echo "=== Result for $lang ==="
        cat "$work_dir/results/result.json" | python3 -m json.tool 2>/dev/null || cat "$work_dir/results/result.json"
    else
        echo "ERROR: No result file for $lang"
    fi
}

# メイン処理
main() {
    local target="${1:-all}"

    # イメージビルド
    build_image

    case "$target" in
        python)
            run_test "python" "py"
            ;;
        javascript)
            run_test "javascript" "js"
            ;;
        typescript)
            run_test "typescript" "ts"
            ;;
        java)
            run_test "java" "java"
            ;;
        go)
            run_test "go" "go"
            ;;
        swift)
            run_test "swift" "swift"
            ;;
        all)
            # 並行実行
            echo "Running all language tests in parallel..."
            run_test "python" "py" &
            run_test "javascript" "js" &
            run_test "typescript" "ts" &
            run_test "java" "java" &
            run_test "go" "go" &
            run_test "swift" "swift" &
            wait
            echo ""
            echo "All tests completed!"
            ;;
        *)
            echo "Usage: $0 [python|javascript|typescript|java|go|swift|all]"
            exit 1
            ;;
    esac
}

main "$@"
