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

// 関数を探して実行
// パターン1: var xxx = function
// パターン2: function xxx(
// パターン3: const xxx = (
let funcName = null;
let funcMatch = userCode.match(/var\s+(\w+)\s*=\s*function/);
if (!funcMatch) {
    funcMatch = userCode.match(/function\s+(\w+)\s*\(/);
}
if (!funcMatch) {
    funcMatch = userCode.match(/const\s+(\w+)\s*=\s*\(/);
}

if (funcMatch) {
    funcName = funcMatch[1];
    const func = eval(funcName);
    // ヘルパーのparseLeetCodeInputsを使用
    const parsed = helper.parseLeetCodeInputs(inputStr);
    const result = func(...parsed);
    console.log('OUTPUT:' + helper.formatOutput(result));
} else {
    console.log('OUTPUT:ERROR_NO_FUNCTION');
}
WRAPPER_EOF

    timeout "$TIMEOUT" node /tmp/wrapper.js "$code_file" "$input" "$expected" 2>&1
}

# TypeScript トランスパイル（1回のみ）
compile_typescript() {
    local code_file="$1"

    # TypeScriptをJavaScriptにトランスパイル
    TS_JS_FILE="/tmp/solution.js"
    esbuild "$code_file" --outfile="$TS_JS_FILE" --format=cjs --platform=node 2>/dev/null || error_exit "TypeScript transpilation failed"
}

# TypeScript 実行（トランスパイル済みJSを実行）
execute_typescript() {
    local input="$1"
    local expected="$2"

    # JavaScript実行
    run_javascript "$TS_JS_FILE" "$input" "$expected"
}

# Java コンパイル（1回のみ）
compile_java() {
    local code_file="$1"

    # コンパイル
    JAVA_WORK_DIR="/home/leetcode/.cache/java_work"
    rm -rf "$JAVA_WORK_DIR"
    mkdir -p "$JAVA_WORK_DIR"

    # ヘルパークラスをコピー
    cp "$HELPER_DIR/java/"*.java "$JAVA_WORK_DIR/"
    cp "$code_file" "$JAVA_WORK_DIR/Solution.java"

    # Main.java作成（LeetCodeHelperクラスを使用）
    cat > "$JAVA_WORK_DIR/Main.java" << 'MAIN_EOF'
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
                    // LeetCodeHelperを使用して入力をパース
                    Object[] params = parseInputs(inputStr, method.getParameterTypes());
                    Object result = method.invoke(solution, params);
                    // LeetCodeHelperを使用して出力をフォーマット
                    System.out.println("OUTPUT:" + LeetCodeHelper.formatOutput(result));
                    break;
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
            System.out.println("OUTPUT:ERROR_" + e.getMessage());
        }
    }

    private static Object[] parseInputs(String input, Class<?>[] types) {
        // LeetCodeHelperを使用してパース
        List<String> values = LeetCodeHelper.parseLeetCodeInput(input);
        Object[] result = new Object[types.length];

        for (int i = 0; i < types.length && i < values.size(); i++) {
            result[i] = parseValue(values.get(i), types[i]);
        }
        return result;
    }

    private static Object parseValue(String s, Class<?> type) {
        s = s.trim();
        if (type == int[].class) {
            return LeetCodeHelper.parseIntArray(s);
        } else if (type == int[][].class) {
            return LeetCodeHelper.parseIntMatrix(s);
        } else if (type == int.class || type == Integer.class) {
            return LeetCodeHelper.parseInt(s);
        } else if (type == long.class || type == Long.class) {
            return Long.parseLong(s);
        } else if (type == double.class || type == Double.class) {
            return Double.parseDouble(s);
        } else if (type == boolean.class || type == Boolean.class) {
            return LeetCodeHelper.parseBool(s);
        } else if (type == String.class) {
            return LeetCodeHelper.parseString(s);
        } else if (type == String[].class) {
            return LeetCodeHelper.parseStringArray(s);
        } else if (type == ListNode.class) {
            return LeetCodeHelper.parseLinkedList(s);
        } else if (type == TreeNode.class) {
            return LeetCodeHelper.parseTree(s);
        } else if (type == List.class) {
            // List<Integer>として処理
            int[] arr = LeetCodeHelper.parseIntArray(s);
            List<Integer> list = new ArrayList<>();
            for (int v : arr) list.add(v);
            return list;
        }
        return null;
    }
}
MAIN_EOF

    # コンパイル
    javac -d "$JAVA_WORK_DIR" "$JAVA_WORK_DIR"/*.java 2>&1 || error_exit "Java compilation failed"
}

# Java 実行（コンパイル済みバイナリを実行）
execute_java() {
    local input="$1"
    local expected="$2"

    cd "$JAVA_WORK_DIR"
    timeout "$TIMEOUT" java -cp . Main "$input" "$expected" 2>&1
}

# Go コンパイル（1回のみ）
compile_go() {
    local code_file="$1"

    GO_WORK_DIR="/home/leetcode/.cache/go_work"
    rm -rf "$GO_WORK_DIR"
    mkdir -p "$GO_WORK_DIR"

    # go.mod作成
    cat > "$GO_WORK_DIR/go.mod" << 'GOMOD_EOF'
module leetcode

go 1.21
GOMOD_EOF

    # ユーザーコードをコピーしてパッケージ名を修正
    cp "$code_file" "$GO_WORK_DIR/solution_impl.go"
    # package mainが無ければ追加、あれば維持
    if ! grep -q "^package" "$GO_WORK_DIR/solution_impl.go"; then
        sed -i '1i package main' "$GO_WORK_DIR/solution_impl.go"
    else
        sed -i 's/^package.*/package main/' "$GO_WORK_DIR/solution_impl.go"
    fi

    # メソッド名を抽出
    local method_name=$(grep -E '^func\s+\([a-zA-Z*\s]+\)\s+\w+\(' "$GO_WORK_DIR/solution_impl.go" | head -1 | sed -E 's/.*\)\s+(\w+)\(.*/\1/')

    # メソッドが見つからない場合は関数を探す
    if [ -z "$method_name" ]; then
        method_name=$(grep -E '^func\s+[A-Z]\w*\(' "$GO_WORK_DIR/solution_impl.go" | head -1 | sed -E 's/^func\s+(\w+)\(.*/\1/')
    fi

    # main.go作成
    cat > "$GO_WORK_DIR/main.go" << MAIN_EOF
package main

import (
    "encoding/json"
    "fmt"
    "os"
    "reflect"
    "strconv"
    "strings"
)

// ListNode リンクリストのノード
type ListNode struct {
    Val  int
    Next *ListNode
}

// TreeNode 二分木のノード
type TreeNode struct {
    Val   int
    Left  *TreeNode
    Right *TreeNode
}

// LeetCode形式の入力をパース (e.g., "nums = [1,2,3], target = 9")
func parseLeetCodeInput(input string) []string {
    var results []string
    var current strings.Builder
    bracketDepth := 0

    for _, c := range input {
        switch c {
        case '[':
            bracketDepth++
            current.WriteRune(c)
        case ']':
            bracketDepth--
            current.WriteRune(c)
        case ',':
            if bracketDepth == 0 {
                results = append(results, extractValue(current.String()))
                current.Reset()
            } else {
                current.WriteRune(c)
            }
        default:
            current.WriteRune(c)
        }
    }
    if current.Len() > 0 {
        results = append(results, extractValue(current.String()))
    }
    return results
}

func extractValue(s string) string {
    s = strings.TrimSpace(s)
    if idx := strings.Index(s, "="); idx != -1 {
        return strings.TrimSpace(s[idx+1:])
    }
    return s
}

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
        if v == nil {
            return "[]"
        }
        arr := treeToArray(v)
        b, _ := json.Marshal(arr)
        return string(b)
    default:
        return fmt.Sprintf("%v", v)
    }
}

func treeToArray(root *TreeNode) []interface{} {
    if root == nil {
        return []interface{}{}
    }
    result := []interface{}{}
    queue := []*TreeNode{root}
    for len(queue) > 0 {
        node := queue[0]
        queue = queue[1:]
        if node != nil {
            result = append(result, node.Val)
            queue = append(queue, node.Left)
            queue = append(queue, node.Right)
        } else {
            result = append(result, nil)
        }
    }
    // 末尾のnilを削除
    for len(result) > 0 && result[len(result)-1] == nil {
        result = result[:len(result)-1]
    }
    return result
}

// 入力を型に合わせてパース
func parseInputForType(s string, t reflect.Type) reflect.Value {
    s = strings.TrimSpace(s)

    switch t.Kind() {
    case reflect.Slice:
        elemKind := t.Elem().Kind()
        if elemKind == reflect.Int {
            var arr []int
            json.Unmarshal([]byte(s), &arr)
            return reflect.ValueOf(arr)
        } else if elemKind == reflect.String {
            var arr []string
            json.Unmarshal([]byte(s), &arr)
            return reflect.ValueOf(arr)
        } else if elemKind == reflect.Slice {
            // 2次元配列
            var arr [][]int
            json.Unmarshal([]byte(s), &arr)
            return reflect.ValueOf(arr)
        }
    case reflect.Int:
        num, _ := strconv.Atoi(s)
        return reflect.ValueOf(num)
    case reflect.Int64:
        num, _ := strconv.ParseInt(s, 10, 64)
        return reflect.ValueOf(num)
    case reflect.Float64:
        num, _ := strconv.ParseFloat(s, 64)
        return reflect.ValueOf(num)
    case reflect.Bool:
        return reflect.ValueOf(strings.ToLower(s) == "true" || s == "1")
    case reflect.String:
        return reflect.ValueOf(strings.Trim(s, "\""))
    case reflect.Ptr:
        // ListNode or TreeNode
        typeName := t.Elem().Name()
        if typeName == "ListNode" {
            var arr []int
            json.Unmarshal([]byte(s), &arr)
            return reflect.ValueOf(arrayToList(arr))
        } else if typeName == "TreeNode" {
            var arr []interface{}
            json.Unmarshal([]byte(s), &arr)
            return reflect.ValueOf(arrayToTree(arr))
        }
    }

    // デフォルト: 文字列
    return reflect.ValueOf(s)
}

func arrayToList(arr []int) *ListNode {
    if len(arr) == 0 {
        return nil
    }
    head := &ListNode{Val: arr[0]}
    current := head
    for i := 1; i < len(arr); i++ {
        current.Next = &ListNode{Val: arr[i]}
        current = current.Next
    }
    return head
}

func arrayToTree(arr []interface{}) *TreeNode {
    if len(arr) == 0 || arr[0] == nil {
        return nil
    }
    root := &TreeNode{Val: int(arr[0].(float64))}
    queue := []*TreeNode{root}
    i := 1
    for len(queue) > 0 && i < len(arr) {
        node := queue[0]
        queue = queue[1:]
        if i < len(arr) && arr[i] != nil {
            node.Left = &TreeNode{Val: int(arr[i].(float64))}
            queue = append(queue, node.Left)
        }
        i++
        if i < len(arr) && arr[i] != nil {
            node.Right = &TreeNode{Val: int(arr[i].(float64))}
            queue = append(queue, node.Right)
        }
        i++
    }
    return root
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

    // LeetCode形式の入力をパース
    inputs := parseLeetCodeInput(inputStr)

    // メソッドの引数型を取得
    methodType := method.Type()
    numParams := methodType.NumIn()

    // 引数を準備
    var args []reflect.Value
    for i := 0; i < numParams && i < len(inputs); i++ {
        paramType := methodType.In(i)
        args = append(args, parseInputForType(inputs[i], paramType))
    }

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
    cd "$GO_WORK_DIR"
    go build -o solution . 2>&1 || error_exit "Go build failed"
}

# Go 実行（コンパイル済みバイナリを実行）
execute_go() {
    local input="$1"
    local expected="$2"

    cd "$GO_WORK_DIR"
    timeout "$TIMEOUT" ./solution "$input" "$expected" 2>&1
}

# Swift コンパイル（1回のみ）
compile_swift() {
    local code_file="$1"

    SWIFT_WORK_DIR="/home/leetcode/.cache/swift_work"
    rm -rf "$SWIFT_WORK_DIR"
    mkdir -p "$SWIFT_WORK_DIR"

    # ヘルパーをコピー
    cp "$HELPER_DIR/swift/LeetCodeHelper.swift" "$SWIFT_WORK_DIR/"

    # ユーザーコードをコピー
    cp "$code_file" "$SWIFT_WORK_DIR/Solution.swift"

    # メソッド名を抽出（最初の func を探す）
    local method_name=$(grep -E '^\s*func\s+\w+' "$SWIFT_WORK_DIR/Solution.swift" | head -1 | sed -E 's/.*func\s+(\w+).*/\1/')

    # メソッドシグネチャを抽出（引数部分）
    local method_sig=$(grep -E '^\s*func\s+'"$method_name"'\s*\(' "$SWIFT_WORK_DIR/Solution.swift" | head -1)

    # 引数の数をカウント（_で始まる引数をカウント）
    local arg_count=$(echo "$method_sig" | grep -oE '_\s+\w+\s*:' | wc -l | tr -d ' ')

    # 引数の型を抽出
    local arg_types=$(echo "$method_sig" | sed -E 's/.*\((.*)\).*/\1/' | tr ',' '\n')

    # 呼び出しコードを動的に生成
    local call_code=""

    case $arg_count in
        1)
            # 1引数の場合
            if echo "$arg_types" | grep -q '\[Int\]'; then
                call_code="solution.${method_name}(parseIntArray(inputs[0]))"
            elif echo "$arg_types" | grep -q '\[String\]'; then
                call_code="solution.${method_name}(parseStringArray(inputs[0]))"
            elif echo "$arg_types" | grep -qE '^[^[]*Int[^]]'; then
                call_code="solution.${method_name}(parseInt(inputs[0]))"
            elif echo "$arg_types" | grep -q 'String'; then
                call_code="solution.${method_name}(parseString(inputs[0]))"
            else
                call_code="solution.${method_name}(parseIntArray(inputs[0]))"
            fi
            ;;
        2)
            # 2引数の場合 - 型を解析
            local first_type=$(echo "$arg_types" | head -1)
            local second_type=$(echo "$arg_types" | tail -1)

            local first_parse="parseIntArray(inputs[0])"
            local second_parse="parseInt(inputs[1])"

            if echo "$first_type" | grep -q '\[Int\]'; then
                first_parse="parseIntArray(inputs[0])"
            elif echo "$first_type" | grep -q '\[String\]'; then
                first_parse="parseStringArray(inputs[0])"
            elif echo "$first_type" | grep -qE 'Int[^]]'; then
                first_parse="parseInt(inputs[0])"
            elif echo "$first_type" | grep -q 'String'; then
                first_parse="parseString(inputs[0])"
            fi

            if echo "$second_type" | grep -q '\[Int\]'; then
                second_parse="parseIntArray(inputs[1])"
            elif echo "$second_type" | grep -q '\[String\]'; then
                second_parse="parseStringArray(inputs[1])"
            elif echo "$second_type" | grep -qE 'Int[^]]'; then
                second_parse="parseInt(inputs[1])"
            elif echo "$second_type" | grep -q 'String'; then
                second_parse="parseString(inputs[1])"
            fi

            call_code="solution.${method_name}(${first_parse}, ${second_parse})"
            ;;
        3)
            # 3引数の場合
            call_code="solution.${method_name}(parseIntArray(inputs[0]), parseInt(inputs[1]), parseInt(inputs[2]))"
            ;;
        *)
            # デフォルト: 2引数（配列, Int）と仮定
            call_code="solution.${method_name}(parseIntArray(inputs[0]), parseInt(inputs[1]))"
            ;;
    esac

    # main.swift作成
    cat > "$SWIFT_WORK_DIR/main.swift" << MAIN_EOF
import Foundation

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

let result = ${call_code}
print("OUTPUT:\(formatOutput(result))")
MAIN_EOF

    # ビルド
    cd "$SWIFT_WORK_DIR"
    swiftc -O -o solution LeetCodeHelper.swift Solution.swift main.swift 2>&1 || error_exit "Swift build failed"

    # 実行権限を付与
    chmod +x ./solution
}

# Swift 実行（コンパイル済みバイナリを実行）
execute_swift() {
    local input="$1"
    local expected="$2"

    cd "$SWIFT_WORK_DIR"
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

    # コンパイル/トランスパイル言語は先に処理（1回のみ）
    case "$LANGUAGE" in
        typescript)
            compile_typescript "$CODE_FILE"
            ;;
        java)
            compile_java "$CODE_FILE"
            ;;
        go)
            compile_go "$CODE_FILE"
            ;;
        swift)
            compile_swift "$CODE_FILE"
            ;;
    esac

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
                    result=$(measure_time execute_typescript "$input" "$expected")
                    ;;
                java)
                    result=$(measure_time execute_java "$input" "$expected")
                    ;;
                go)
                    result=$(measure_time execute_go "$input" "$expected")
                    ;;
                swift)
                    result=$(measure_time execute_swift "$input" "$expected")
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
