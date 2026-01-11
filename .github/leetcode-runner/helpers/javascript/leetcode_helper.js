// LeetCode Helper for JavaScript/TypeScript
// データ構造の定義とパース関数

// ========================================
// データ構造定義
// ========================================

class ListNode {
  constructor(val = 0, next = null) {
    this.val = val;
    this.next = next;
  }
}

class TreeNode {
  constructor(val = 0, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

// ========================================
// パース関数
// ========================================

function parseList(s) {
  s = s.trim();
  if (!s) return [];
  try {
    return JSON.parse(s);
  } catch {
    return s.split(',').map(x => x.trim());
  }
}

function parseInt_(s) {
  return parseInt(s.trim(), 10);
}

function parseFloat_(s) {
  return parseFloat(s.trim());
}

function parseString(s) {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseBool(s) {
  s = s.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

// ========================================
// リンクリスト操作
// ========================================

function listToLinkedList(arr) {
  if (!arr || arr.length === 0) return null;
  const head = new ListNode(arr[0]);
  let current = head;
  for (let i = 1; i < arr.length; i++) {
    current.next = new ListNode(arr[i]);
    current = current.next;
  }
  return head;
}

function linkedListToList(head) {
  const result = [];
  let current = head;
  while (current) {
    result.push(current.val);
    current = current.next;
  }
  return result;
}

function parseLinkedList(s) {
  const arr = parseList(s);
  return listToLinkedList(arr);
}

// ========================================
// 二分木操作
// ========================================

function listToTree(arr) {
  if (!arr || arr.length === 0 || arr[0] === null) return null;

  const root = new TreeNode(arr[0]);
  const queue = [root];
  let i = 1;

  while (queue.length > 0 && i < arr.length) {
    const node = queue.shift();

    // 左の子
    if (i < arr.length) {
      if (arr[i] !== null) {
        node.left = new TreeNode(arr[i]);
        queue.push(node.left);
      }
      i++;
    }

    // 右の子
    if (i < arr.length) {
      if (arr[i] !== null) {
        node.right = new TreeNode(arr[i]);
        queue.push(node.right);
      }
      i++;
    }
  }

  return root;
}

function treeToList(root) {
  if (!root) return [];

  const result = [];
  const queue = [root];

  while (queue.length > 0) {
    const node = queue.shift();
    if (node) {
      result.push(node.val);
      queue.push(node.left);
      queue.push(node.right);
    } else {
      result.push(null);
    }
  }

  // 末尾のnullを削除
  while (result.length > 0 && result[result.length - 1] === null) {
    result.pop();
  }

  return result;
}

function parseTree(s) {
  const arr = parseList(s);
  return listToTree(arr);
}

// ========================================
// 入力パース（汎用）
// ========================================

function parseInput(s, typeHint = 'auto') {
  s = s.trim();

  switch (typeHint) {
    case 'list':
      return parseList(s);
    case 'int':
      return parseInt_(s);
    case 'float':
      return parseFloat_(s);
    case 'string':
      return parseString(s);
    case 'bool':
      return parseBool(s);
    case 'linked_list':
      return parseLinkedList(s);
    case 'tree':
      return parseTree(s);
    default:
      // 自動判定
      if (s.startsWith('[')) {
        return parseList(s);
      } else if (/^-?\d+$/.test(s)) {
        return parseInt_(s);
      } else if (s.toLowerCase() === 'true' || s.toLowerCase() === 'false') {
        return parseBool(s);
      } else {
        return parseString(s);
      }
  }
}

// ========================================
// 出力フォーマット
// ========================================

function formatOutput(value) {
  if (value instanceof ListNode) {
    return JSON.stringify(linkedListToList(value));
  } else if (value instanceof TreeNode) {
    return JSON.stringify(treeToList(value));
  } else if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  } else if (Array.isArray(value)) {
    return JSON.stringify(value);
  } else if (value === null || value === undefined) {
    return 'null';
  } else {
    return String(value);
  }
}

// エクスポート
module.exports = {
  ListNode,
  TreeNode,
  parseList,
  parseInt: parseInt_,
  parseFloat: parseFloat_,
  parseString,
  parseBool,
  listToLinkedList,
  linkedListToList,
  parseLinkedList,
  listToTree,
  treeToList,
  parseTree,
  parseInput,
  formatOutput,
};
