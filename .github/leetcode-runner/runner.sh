#!/bin/bash
# LeetCode Code Runner
# Docker内でコードを実行してベンチマークを取る

set -ex

# 引数
LANGUAGE="$1"
CODE_FILE="$2"
TEST_CASES_FILE="$3"
OUTPUT_FILE="$4"
RUN_COUNT="${5:-20}"
TIMEOUT="${6:-10}"

# ヘルパーディレクトリ
HELPER_DIR="/leetcode/helpers"

# エラーハンドリング
error_exit() {
    echo "{\"success\": false, \"error\": \"$1\"}" > "$OUTPUT_FILE"
    exit 1
}

# 実行時間を計測する関数（ナノ秒精度）
measure_time() {
    local start=$(date +%s%N)
    "$@" 2>&1
    local status=$?
    local end=$(date +%s%N)
    local duration=$(( (end - start) / 1000000 )) # ミリ秒に変換
    echo "EXECUTION_TIME_MS:$duration"
    return $status
}

# Python実行
run_python() {
    local code_file="$1"
    local input="$2"
    local expected="$3"

    # ラッパースクリプト作成
    cat > /tmp/wrapper.py << 'WRAPPER_EOF'
import sys
sys.path.insert(0, '/leetcode/helpers/python')
from leetcode_helper import *
import json
import time

# ユーザーコードを読み込み
with open(sys.argv[1], 'r') as f:
    user_code = f.read()

# 入力と期待出力
input_str = sys.argv[2]
expected_str = sys.argv[3]

# ユーザーコード実行
exec(user_code, globals())

# Solutionクラスを探す
if 'Solution' in dir():
    solution = Solution()
    # メソッドを探す（最初に見つかった非プライベートメソッド）
    methods = [m for m in dir(solution) if not m.startswith('_') and callable(getattr(solution, m))]
    if methods:
        method = getattr(solution, methods[0])

        # 入力をパース（LeetCode形式: "nums = [1,2], target = 3"）
        inputs = parse_leetcode_input(input_str)

        # 実行
        result = method(*inputs)
        output = format_output(result)
        print(f"OUTPUT:{output}")
    else:
        print("OUTPUT:ERROR_NO_METHOD")
else:
    print("OUTPUT:ERROR_NO_SOLUTION_CLASS")
WRAPPER_EOF

    timeout "$TIMEOUT" python3 /tmp/wrapper.py "$code_file" "$input" "$expected" 2>&1
}

# JavaScript実行
run_javascript() {
    local code_file="$1"
    local input="$2"
    local expected="$3"

    # ラッパースクリプト作成
    cat > /tmp/wrapper.js << 'WRAPPER_EOF'
const helper = require('/leetcode/helpers/javascript/leetcode_helper.js');
const fs = require('fs');

const codeFile = process.argv[2];
const inputStr = process.argv[3];
const expectedStr = process.argv[4];

// ユーザーコード読み込み
const userCode = fs.readFileSync(codeFile, 'utf8');

// グローバルにヘルパーを公開
global.ListNode = helper.ListNode;
global.TreeNode = helper.TreeNode;

// ユーザーコード実行
eval(userCode);

// 入力パース
const parsed = helper.parseInput(inputStr);

// 関数を探して実行（var xxx = function形式を想定）
const funcMatch = userCode.match(/var\s+(\w+)\s*=\s*function/);
if (funcMatch) {
    const funcName = funcMatch[1];
    const func = eval(funcName);
    const result = Array.isArray(parsed) ? func(...parsed) : func(parsed);
    console.log('OUTPUT:' + helper.formatOutput(result));
} else {
    console.log('OUTPUT:ERROR_NO_FUNCTION');
}
WRAPPER_EOF

    timeout "$TIMEOUT" node /tmp/wrapper.js "$code_file" "$input" "$expected" 2>&1
}

# TypeScript実行（esbuildでトランスパイル）
run_typescript() {
    local code_file="$1"
    local input="$2"
    local expected="$3"

    # TypeScriptをJavaScriptにトランスパイル
    local js_file="/tmp/solution.js"
    esbuild "$code_file" --outfile="$js_file" --format=cjs --platform=node 2>/dev/null

    # JavaScript実行
    run_javascript "$js_file" "$input" "$expected"
}

# Java実行
run_java() {
    local code_file="$1"
    local input="$2"
    local expected="$3"

    # コンパイル
    local work_dir="/tmp/java_work"
    rm -rf "$work_dir"
    mkdir -p "$work_dir"

    # ヘルパークラスをコピー
    cp "$HELPER_DIR/java/"*.java "$work_dir/"
    cp "$code_file" "$work_dir/Solution.java"

    # Main.java作成
    cat > "$work_dir/Main.java" << MAIN_EOF
import java.util.*;

public class Main {
    public static void main(String[] args) {
        String inputStr = args[0];
        String expectedStr = args[1];

        try {
            Solution solution = new Solution();
            // リフレクションで最初のpublicメソッドを取得
            java.lang.reflect.Method[] methods = Solution.class.getDeclaredMethods();
            for (java.lang.reflect.Method method : methods) {
                if (java.lang.reflect.Modifier.isPublic(method.getModifiers())) {
                    // 入力をパース
                    Object[] params = parseInputs(inputStr, method.getParameterTypes());
                    Object result = method.invoke(solution, params);
                    System.out.println("OUTPUT:" + formatOutput(result));
                    break;
                }
            }
        } catch (Exception e) {
            System.out.println("OUTPUT:ERROR_" + e.getMessage());
        }
    }

    private static Object[] parseInputs(String input, Class<?>[] types) {
        // 簡易パース
        if (types.length == 1) {
            return new Object[]{parseValue(input, types[0])};
        }
        return new Object[]{};
    }

    private static Object parseValue(String s, Class<?> type) {
        s = s.trim();
        if (type == int[].class) {
            s = s.replaceAll("[\\[\\]]", "");
            if (s.isEmpty()) return new int[0];
            String[] parts = s.split(",");
            int[] arr = new int[parts.length];
            for (int i = 0; i < parts.length; i++) {
                arr[i] = Integer.parseInt(parts[i].trim());
            }
            return arr;
        } else if (type == int.class || type == Integer.class) {
            return Integer.parseInt(s);
        } else if (type == String.class) {
            return s.replaceAll("^\"|\"$", "");
        } else if (type == ListNode.class) {
            return ListNode.fromArray(parseIntArray(s));
        } else if (type == TreeNode.class) {
            return TreeNode.fromArray(parseIntegerArray(s));
        }
        return null;
    }

    private static int[] parseIntArray(String s) {
        s = s.trim().replaceAll("[\\[\\]]", "");
        if (s.isEmpty()) return new int[0];
        String[] parts = s.split(",");
        int[] arr = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            arr[i] = Integer.parseInt(parts[i].trim());
        }
        return arr;
    }

    private static Integer[] parseIntegerArray(String s) {
        s = s.trim().replaceAll("[\\[\\]]", "");
        if (s.isEmpty()) return new Integer[0];
        String[] parts = s.split(",");
        Integer[] arr = new Integer[parts.length];
        for (int i = 0; i < parts.length; i++) {
            String p = parts[i].trim();
            arr[i] = p.equals("null") ? null : Integer.parseInt(p);
        }
        return arr;
    }

    private static String formatOutput(Object val) {
        if (val == null) return "null";
        if (val instanceof int[]) {
            return Arrays.toString((int[])val).replaceAll(" ", "");
        } else if (val instanceof Integer[]) {
            return Arrays.toString((Integer[])val).replaceAll(" ", "");
        } else if (val instanceof ListNode) {
            return Arrays.toString(ListNode.toArray((ListNode)val)).replaceAll(" ", "");
        } else if (val instanceof TreeNode) {
            Integer[] arr = TreeNode.toArray((TreeNode)val);
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < arr.length; i++) {
                if (i > 0) sb.append(",");
                sb.append(arr[i] == null ? "null" : arr[i]);
            }
            sb.append("]");
            return sb.toString();
        } else if (val instanceof Boolean) {
            return ((Boolean)val) ? "true" : "false";
        } else if (val instanceof List) {
            return val.toString().replaceAll(" ", "");
        }
        return String.valueOf(val);
    }
}
MAIN_EOF

    # コンパイル
    javac -d "$work_dir" "$work_dir"/*.java 2>&1 || error_exit "Java compilation failed"

    # 実行
    cd "$work_dir"
    timeout "$TIMEOUT" java -cp . Main "$input" "$expected" 2>&1
}

# Go実行
run_go() {
    local code_file="$1"
    local input="$2"
    local expected="$3"

    local work_dir="/tmp/go_work"
    rm -rf "$work_dir"
    mkdir -p "$work_dir"

    # go.mod作成
    cat > "$work_dir/go.mod" << 'GOMOD_EOF'
module leetcode

go 1.21
GOMOD_EOF

    # ヘルパーをコピー
    mkdir -p "$work_dir/helper"
    cp "$HELPER_DIR/go/leetcode_helper.go" "$work_dir/helper/"
    # パッケージ名を変更
    sed -i 's/package leetcode/package helper/' "$work_dir/helper/leetcode_helper.go"

    # ユーザーコードをコピーしてパッケージ名を修正
    cp "$code_file" "$work_dir/solution_impl.go"
    # package mainが無ければ追加、あれば維持
    if ! grep -q "^package" "$work_dir/solution_impl.go"; then
        sed -i '1i package main' "$work_dir/solution_impl.go"
    else
        sed -i 's/^package.*/package main/' "$work_dir/solution_impl.go"
    fi

    # メソッド名を抽出
    local method_name=$(grep -E '^func\s+\([a-zA-Z*\s]+\)\s+\w+\(' "$work_dir/solution_impl.go" | head -1 | sed -E 's/.*\)\s+(\w+)\(.*/\1/')

    # メソッドが見つからない場合は関数を探す
    if [ -z "$method_name" ]; then
        method_name=$(grep -E '^func\s+[A-Z]\w*\(' "$work_dir/solution_impl.go" | head -1 | sed -E 's/^func\s+(\w+)\(.*/\1/')
    fi

    # main.go作成
    cat > "$work_dir/main.go" << MAIN_EOF
package main

import (
    "encoding/json"
    "fmt"
    "os"
    "reflect"
    "strings"
)

// 結果をフォーマット
func formatOutput(val interface{}) string {
    switch v := val.(type) {
    case bool:
        if v {
            return "true"
        }
        return "false"
    case []int:
        b, _ := json.Marshal(v)
        return string(b)
    case [][]int:
        b, _ := json.Marshal(v)
        return string(b)
    case []string:
        b, _ := json.Marshal(v)
        return string(b)
    case *ListNode:
        if v == nil {
            return "[]"
        }
        var arr []int
        for v != nil {
            arr = append(arr, v.Val)
            v = v.Next
        }
        b, _ := json.Marshal(arr)
        return string(b)
    case *TreeNode:
        // 簡易実装
        b, _ := json.Marshal(v)
        return string(b)
    default:
        return fmt.Sprintf("%v", v)
    }
}

// 入力をパース
func parseInput(s string) interface{} {
    s = strings.TrimSpace(s)

    // 配列
    if strings.HasPrefix(s, "[") {
        // 2次元配列
        if strings.HasPrefix(s, "[[") {
            var result [][]int
            json.Unmarshal([]byte(s), &result)
            return result
        }
        // 1次元配列
        var result []int
        if err := json.Unmarshal([]byte(s), &result); err == nil {
            return result
        }
        // 文字列配列
        var strResult []string
        json.Unmarshal([]byte(s), &strResult)
        return strResult
    }

    // 数値
    if s[0] == '-' || (s[0] >= '0' && s[0] <= '9') {
        var num int
        fmt.Sscanf(s, "%d", &num)
        return num
    }

    // 文字列
    return strings.Trim(s, "\"")
}

func main() {
    if len(os.Args) < 3 {
        fmt.Println("OUTPUT:ERROR_ARGS")
        os.Exit(1)
    }

    inputStr := os.Args[1]
    _ = os.Args[2] // expectedStr

    // Solutionインスタンスを作成
    solution := &Solution{}

    // リフレクションでメソッドを呼び出す
    solutionValue := reflect.ValueOf(solution)
    method := solutionValue.MethodByName("${method_name}")

    if !method.IsValid() {
        fmt.Println("OUTPUT:ERROR_NO_METHOD")
        os.Exit(1)
    }

    // 入力をパース
    input := parseInput(inputStr)

    // 引数を準備
    var args []reflect.Value
    args = append(args, reflect.ValueOf(input))

    // メソッド呼び出し
    results := method.Call(args)

    if len(results) > 0 {
        output := formatOutput(results[0].Interface())
        fmt.Printf("OUTPUT:%s\n", output)
    } else {
        fmt.Println("OUTPUT:ERROR_NO_RESULT")
    }
}
MAIN_EOF

    # ビルド
    cd "$work_dir"
    go build -o solution . 2>&1 || error_exit "Go build failed"

    # 実行
    timeout "$TIMEOUT" ./solution "$input" "$expected" 2>&1
}

# Swift実行
run_swift() {
    local code_file="$1"
    local input="$2"
    local expected="$3"

    local work_dir="/tmp/swift_work"
    rm -rf "$work_dir"
    mkdir -p "$work_dir"

    # ヘルパーをコピー
    cp "$HELPER_DIR/swift/LeetCodeHelper.swift" "$work_dir/"

    # ユーザーコードをコピー
    cp "$code_file" "$work_dir/Solution.swift"

    # クラス/構造体名を抽出（Solution）
    local has_solution_class=$(grep -E 'class\s+Solution|struct\s+Solution' "$work_dir/Solution.swift" || echo "")

    # メソッド名を抽出（最初の func を探す）
    local method_name=$(grep -E '^\s*func\s+\w+' "$work_dir/Solution.swift" | head -1 | sed -E 's/.*func\s+(\w+).*/\1/')

    # main.swift作成
    cat > "$work_dir/main.swift" << MAIN_EOF
import Foundation

// 出力フォーマット（LeetCodeHelper.swiftにない関数）
func formatOutput(_ val: Any) -> String {
    if let arr = val as? [Int] {
        return formatIntArray(arr)
    } else if let arr = val as? [String] {
        return formatStringArray(arr)
    } else if let b = val as? Bool {
        return formatBool(b)
    } else if let n = val as? Int {
        return String(n)
    } else if let s = val as? String {
        return s
    }
    return String(describing: val)
}

// メイン実行
let args = CommandLine.arguments
if args.count < 3 {
    print("OUTPUT:ERROR_ARGS")
    exit(1)
}

let inputStr = args[1]
let _ = args[2] // expectedStr

let solution = Solution()
let inputs = parseLeetCodeInput(inputStr)

// 入力数に応じて呼び出し
let result: Any
switch inputs.count {
case 1:
    // 配列 or 単一値判定
    let input0 = inputs[0]
    if input0.hasPrefix("[") {
        result = solution.${method_name}(parseIntArray(input0))
    } else if let intVal = Int(input0) {
        result = solution.${method_name}(intVal)
    } else {
        result = solution.${method_name}(parseString(input0))
    }
case 2:
    let input0 = inputs[0]
    let input1 = inputs[1]
    if input0.hasPrefix("[") {
        if let intVal = Int(input1.trimmingCharacters(in: .whitespaces)) {
            result = solution.${method_name}(parseIntArray(input0), intVal)
        } else if input1.hasPrefix("[") {
            result = solution.${method_name}(parseIntArray(input0), parseIntArray(input1))
        } else {
            result = solution.${method_name}(parseIntArray(input0), parseString(input1))
        }
    } else {
        result = solution.${method_name}(parseString(input0), parseString(input1))
    }
case 3:
    result = solution.${method_name}(parseIntArray(inputs[0]), parseInt(inputs[1]), parseInt(inputs[2]))
default:
    print("OUTPUT:ERROR_UNSUPPORTED_INPUTS")
    exit(1)
}

print("OUTPUT:\(formatOutput(result))")
MAIN_EOF

    # ビルド
    cd "$work_dir"
    swiftc -O -o solution LeetCodeHelper.swift Solution.swift main.swift 2>&1 || error_exit "Swift build failed"

    # 実行
    timeout "$TIMEOUT" ./solution "$input" "$expected" 2>&1
}

# メイン処理
main() {
    if [ -z "$LANGUAGE" ] || [ -z "$CODE_FILE" ] || [ -z "$TEST_CASES_FILE" ] || [ -z "$OUTPUT_FILE" ]; then
        error_exit "Usage: runner.sh <language> <code_file> <test_cases_file> <output_file> [run_count] [timeout]"
    fi

    if [ ! -f "$CODE_FILE" ]; then
        error_exit "Code file not found: $CODE_FILE"
    fi

    if [ ! -f "$TEST_CASES_FILE" ]; then
        error_exit "Test cases file not found: $TEST_CASES_FILE"
    fi

    # テストケース読み込み（JSON形式）
    TEST_CASES=$(cat "$TEST_CASES_FILE")

    # 結果格納用
    declare -a all_times=()
    declare -a test_results=()
    all_correct=true
    total_runs=0
    successful_runs=0

    # 各テストケースで複数回実行
    while IFS= read -r test_case; do
        input=$(echo "$test_case" | jq -r '.input')
        expected=$(echo "$test_case" | jq -r '.expectedOutput')

        for ((i=1; i<=RUN_COUNT; i++)); do
            total_runs=$((total_runs + 1))

            # 言語別実行
            case "$LANGUAGE" in
                python)
                    result=$(measure_time run_python "$CODE_FILE" "$input" "$expected")
                    ;;
                javascript)
                    result=$(measure_time run_javascript "$CODE_FILE" "$input" "$expected")
                    ;;
                typescript)
                    result=$(measure_time run_typescript "$CODE_FILE" "$input" "$expected")
                    ;;
                java)
                    result=$(measure_time run_java "$CODE_FILE" "$input" "$expected")
                    ;;
                go)
                    result=$(measure_time run_go "$CODE_FILE" "$input" "$expected")
                    ;;
                swift)
                    result=$(measure_time run_swift "$CODE_FILE" "$input" "$expected")
                    ;;
                *)
                    error_exit "Unsupported language: $LANGUAGE"
                    ;;
            esac

            # 実行時間抽出
            time_ms=$(echo "$result" | grep "EXECUTION_TIME_MS:" | sed 's/EXECUTION_TIME_MS://')
            output=$(echo "$result" | grep "OUTPUT:" | sed 's/OUTPUT://')

            if [ -n "$time_ms" ]; then
                all_times+=("$time_ms")
                successful_runs=$((successful_runs + 1))

                # 結果比較（最初の実行のみ）
                if [ $i -eq 1 ]; then
                    # 正規化して比較
                    normalized_output=$(echo "$output" | tr -d ' ')
                    normalized_expected=$(echo "$expected" | tr -d ' ')

                    if [ "$normalized_output" != "$normalized_expected" ]; then
                        all_correct=false
                        test_results+=("{\"input\": \"$input\", \"expected\": \"$expected\", \"actual\": \"$output\", \"correct\": false}")
                    else
                        test_results+=("{\"input\": \"$input\", \"expected\": \"$expected\", \"actual\": \"$output\", \"correct\": true}")
                    fi
                fi
            fi
        done
    done < <(echo "$TEST_CASES" | jq -c '.[]')

    # 統計計算
    if [ ${#all_times[@]} -gt 0 ]; then
        # 平均
        sum=0
        for t in "${all_times[@]}"; do
            sum=$((sum + t))
        done
        avg=$((sum / ${#all_times[@]}))

        # 最小・最大
        min=${all_times[0]}
        max=${all_times[0]}
        for t in "${all_times[@]}"; do
            if [ "$t" -lt "$min" ]; then min=$t; fi
            if [ "$t" -gt "$max" ]; then max=$t; fi
        done

        # 標準偏差（簡易計算）
        variance_sum=0
        for t in "${all_times[@]}"; do
            diff=$((t - avg))
            variance_sum=$((variance_sum + diff * diff))
        done
        variance=$((variance_sum / ${#all_times[@]}))
        stddev=$(echo "scale=2; sqrt($variance)" | bc)
    else
        avg=0
        min=0
        max=0
        stddev=0
    fi

    # 結果をJSON出力
    cat > "$OUTPUT_FILE" << EOF
{
    "success": true,
    "totalRuns": $total_runs,
    "successfulRuns": $successful_runs,
    "averageTimeMs": $avg,
    "minTimeMs": $min,
    "maxTimeMs": $max,
    "stdDevMs": $stddev,
    "allCorrect": $all_correct,
    "testResults": [$(IFS=,; echo "${test_results[*]}")]
}
EOF
}

main "$@"
