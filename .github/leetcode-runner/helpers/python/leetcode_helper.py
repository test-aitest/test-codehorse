# LeetCode Helper for Python
# データ構造の定義とパース関数

from typing import List, Optional
import json
import re

# ========================================
# データ構造定義
# ========================================

class ListNode:
    """リンクリストのノード"""
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

    def __repr__(self):
        return f"ListNode({self.val})"


class TreeNode:
    """二分木のノード"""
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    def __repr__(self):
        return f"TreeNode({self.val})"


# ========================================
# パース関数
# ========================================

def parse_list(s: str) -> List:
    """文字列をリストにパース"""
    s = s.strip()
    if not s:
        return []
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        # カンマ区切りとして処理
        return [x.strip() for x in s.split(',')]


def parse_int(s: str) -> int:
    """文字列を整数にパース"""
    return int(s.strip())


def parse_float(s: str) -> float:
    """文字列を浮動小数点にパース"""
    return float(s.strip())


def parse_string(s: str) -> str:
    """文字列をパース（クォートを除去）"""
    s = s.strip()
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        return s[1:-1]
    return s


def parse_bool(s: str) -> bool:
    """文字列を真偽値にパース"""
    s = s.strip().lower()
    return s in ('true', '1', 'yes')


# ========================================
# リンクリスト操作
# ========================================

def list_to_linked_list(arr: List[int]) -> Optional[ListNode]:
    """配列をリンクリストに変換"""
    if not arr:
        return None
    head = ListNode(arr[0])
    current = head
    for val in arr[1:]:
        current.next = ListNode(val)
        current = current.next
    return head


def linked_list_to_list(head: Optional[ListNode]) -> List[int]:
    """リンクリストを配列に変換"""
    result = []
    current = head
    while current:
        result.append(current.val)
        current = current.next
    return result


def parse_linked_list(s: str) -> Optional[ListNode]:
    """文字列をリンクリストにパース"""
    arr = parse_list(s)
    return list_to_linked_list(arr)


# ========================================
# 二分木操作
# ========================================

def list_to_tree(arr: List) -> Optional[TreeNode]:
    """LeetCode形式の配列を二分木に変換"""
    if not arr or arr[0] is None:
        return None

    root = TreeNode(arr[0])
    queue = [root]
    i = 1

    while queue and i < len(arr):
        node = queue.pop(0)

        # 左の子
        if i < len(arr):
            if arr[i] is not None:
                node.left = TreeNode(arr[i])
                queue.append(node.left)
            i += 1

        # 右の子
        if i < len(arr):
            if arr[i] is not None:
                node.right = TreeNode(arr[i])
                queue.append(node.right)
            i += 1

    return root


def tree_to_list(root: Optional[TreeNode]) -> List:
    """二分木をLeetCode形式の配列に変換"""
    if not root:
        return []

    result = []
    queue = [root]

    while queue:
        node = queue.pop(0)
        if node:
            result.append(node.val)
            queue.append(node.left)
            queue.append(node.right)
        else:
            result.append(None)

    # 末尾のNoneを削除
    while result and result[-1] is None:
        result.pop()

    return result


def parse_tree(s: str) -> Optional[TreeNode]:
    """文字列を二分木にパース"""
    arr = parse_list(s)
    return list_to_tree(arr)


# ========================================
# 入力パース（汎用）
# ========================================

def parse_input(s: str, type_hint: str = 'auto'):
    """
    入力文字列をパース
    type_hint: 'list', 'int', 'float', 'string', 'bool', 'linked_list', 'tree', 'auto'
    """
    s = s.strip()

    if type_hint == 'list':
        return parse_list(s)
    elif type_hint == 'int':
        return parse_int(s)
    elif type_hint == 'float':
        return parse_float(s)
    elif type_hint == 'string':
        return parse_string(s)
    elif type_hint == 'bool':
        return parse_bool(s)
    elif type_hint == 'linked_list':
        return parse_linked_list(s)
    elif type_hint == 'tree':
        return parse_tree(s)
    else:
        # 自動判定
        if s.startswith('['):
            return parse_list(s)
        elif s.isdigit() or (s.startswith('-') and s[1:].isdigit()):
            return parse_int(s)
        elif s.lower() in ('true', 'false'):
            return parse_bool(s)
        else:
            return parse_string(s)


# ========================================
# 出力フォーマット
# ========================================

def format_output(value) -> str:
    """出力値を文字列にフォーマット"""
    if isinstance(value, ListNode):
        return json.dumps(linked_list_to_list(value))
    elif isinstance(value, TreeNode):
        return json.dumps(tree_to_list(value))
    elif isinstance(value, bool):
        return 'true' if value else 'false'
    elif isinstance(value, (list, tuple)):
        return json.dumps(value)
    elif value is None:
        return 'null'
    else:
        return str(value)
