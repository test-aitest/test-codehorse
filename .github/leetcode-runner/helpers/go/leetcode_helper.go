// LeetCode Helper for Go
// データ構造の定義とパース関数

package leetcode

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// ========================================
// データ構造定義
// ========================================

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

// ========================================
// パース関数
// ========================================

// ParseIntList 文字列を整数配列にパース
func ParseIntList(s string) []int {
	s = strings.TrimSpace(s)
	if s == "" || s == "[]" {
		return []int{}
	}

	var result []int
	if err := json.Unmarshal([]byte(s), &result); err == nil {
		return result
	}

	// カンマ区切りとして処理
	s = strings.Trim(s, "[]")
	parts := strings.Split(s, ",")
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			if v, err := strconv.Atoi(p); err == nil {
				result = append(result, v)
			}
		}
	}
	return result
}

// ParseStringList 文字列を文字列配列にパース
func ParseStringList(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" || s == "[]" {
		return []string{}
	}

	var result []string
	if err := json.Unmarshal([]byte(s), &result); err == nil {
		return result
	}

	// カンマ区切りとして処理
	s = strings.Trim(s, "[]")
	parts := strings.Split(s, ",")
	for _, p := range parts {
		p = strings.TrimSpace(p)
		p = strings.Trim(p, "\"'")
		result = append(result, p)
	}
	return result
}

// ParseNullableIntList nullを含む整数配列をパース（二分木用）
func ParseNullableIntList(s string) []*int {
	s = strings.TrimSpace(s)
	if s == "" || s == "[]" {
		return []*int{}
	}

	var raw []interface{}
	if err := json.Unmarshal([]byte(s), &raw); err != nil {
		return []*int{}
	}

	result := make([]*int, len(raw))
	for i, v := range raw {
		if v == nil {
			result[i] = nil
		} else {
			val := int(v.(float64))
			result[i] = &val
		}
	}
	return result
}

// ParseInt 文字列を整数にパース
func ParseInt(s string) int {
	v, _ := strconv.Atoi(strings.TrimSpace(s))
	return v
}

// ParseFloat 文字列を浮動小数点にパース
func ParseFloat(s string) float64 {
	v, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
	return v
}

// ParseString 文字列をパース（クォートを除去）
func ParseString(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "\"'")
	return s
}

// ParseBool 文字列を真偽値にパース
func ParseBool(s string) bool {
	s = strings.ToLower(strings.TrimSpace(s))
	return s == "true" || s == "1" || s == "yes"
}

// ========================================
// リンクリスト操作
// ========================================

// SliceToList 配列をリンクリストに変換
func SliceToList(arr []int) *ListNode {
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

// ListToSlice リンクリストを配列に変換
func ListToSlice(head *ListNode) []int {
	result := []int{}
	current := head
	for current != nil {
		result = append(result, current.Val)
		current = current.Next
	}
	return result
}

// ParseLinkedList 文字列をリンクリストにパース
func ParseLinkedList(s string) *ListNode {
	arr := ParseIntList(s)
	return SliceToList(arr)
}

// ========================================
// 二分木操作
// ========================================

// SliceToTree LeetCode形式の配列を二分木に変換
func SliceToTree(arr []*int) *TreeNode {
	if len(arr) == 0 || arr[0] == nil {
		return nil
	}

	root := &TreeNode{Val: *arr[0]}
	queue := []*TreeNode{root}
	i := 1

	for len(queue) > 0 && i < len(arr) {
		node := queue[0]
		queue = queue[1:]

		// 左の子
		if i < len(arr) {
			if arr[i] != nil {
				node.Left = &TreeNode{Val: *arr[i]}
				queue = append(queue, node.Left)
			}
			i++
		}

		// 右の子
		if i < len(arr) {
			if arr[i] != nil {
				node.Right = &TreeNode{Val: *arr[i]}
				queue = append(queue, node.Right)
			}
			i++
		}
	}

	return root
}

// TreeToSlice 二分木をLeetCode形式の配列に変換
func TreeToSlice(root *TreeNode) []*int {
	if root == nil {
		return []*int{}
	}

	result := []*int{}
	queue := []*TreeNode{root}

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]

		if node != nil {
			val := node.Val
			result = append(result, &val)
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

// ParseTree 文字列を二分木にパース
func ParseTree(s string) *TreeNode {
	arr := ParseNullableIntList(s)
	return SliceToTree(arr)
}

// ========================================
// 出力フォーマット
// ========================================

// FormatIntSlice 整数配列を文字列にフォーマット
func FormatIntSlice(arr []int) string {
	b, _ := json.Marshal(arr)
	return string(b)
}

// FormatStringSlice 文字列配列を文字列にフォーマット
func FormatStringSlice(arr []string) string {
	b, _ := json.Marshal(arr)
	return string(b)
}

// FormatNullableIntSlice null可能整数配列を文字列にフォーマット
func FormatNullableIntSlice(arr []*int) string {
	result := make([]interface{}, len(arr))
	for i, v := range arr {
		if v == nil {
			result[i] = nil
		} else {
			result[i] = *v
		}
	}
	b, _ := json.Marshal(result)
	return string(b)
}

// FormatList リンクリストを文字列にフォーマット
func FormatList(head *ListNode) string {
	return FormatIntSlice(ListToSlice(head))
}

// FormatTree 二分木を文字列にフォーマット
func FormatTree(root *TreeNode) string {
	return FormatNullableIntSlice(TreeToSlice(root))
}

// FormatBool 真偽値を文字列にフォーマット
func FormatBool(val bool) string {
	if val {
		return "true"
	}
	return "false"
}

// FormatOutput 汎用出力フォーマット
func FormatOutput(val interface{}) string {
	switch v := val.(type) {
	case *ListNode:
		return FormatList(v)
	case *TreeNode:
		return FormatTree(v)
	case bool:
		return FormatBool(v)
	case []int:
		return FormatIntSlice(v)
	case []string:
		return FormatStringSlice(v)
	case nil:
		return "null"
	default:
		return fmt.Sprintf("%v", v)
	}
}

// ========================================
// 2D配列操作
// ========================================

// ParseIntMatrix 文字列を2次元整数配列にパース
func ParseIntMatrix(s string) [][]int {
	s = strings.TrimSpace(s)
	if s == "" || s == "[]" {
		return [][]int{}
	}

	var result [][]int
	if err := json.Unmarshal([]byte(s), &result); err == nil {
		return result
	}
	return [][]int{}
}

// FormatIntMatrix 2次元整数配列を文字列にフォーマット
func FormatIntMatrix(matrix [][]int) string {
	b, _ := json.Marshal(matrix)
	return string(b)
}
