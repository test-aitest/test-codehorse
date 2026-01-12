// LeetCode Helper for Java
// データ構造のパースと出力フォーマット

import java.util.*;

public class LeetCodeHelper {

    // ========================================
    // LeetCode入力パース
    // ========================================

    /**
     * LeetCode形式の入力をパース
     * 例: "nums = [1,2,3], target = 9" -> ["[1,2,3]", "9"]
     */
    public static List<String> parseLeetCodeInput(String input) {
        List<String> results = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int bracketDepth = 0;

        for (char c : input.toCharArray()) {
            if (c == '[') {
                bracketDepth++;
                current.append(c);
            } else if (c == ']') {
                bracketDepth--;
                current.append(c);
            } else if (c == ',' && bracketDepth == 0) {
                results.add(extractValue(current.toString()));
                current = new StringBuilder();
            } else {
                current.append(c);
            }
        }
        if (current.length() > 0) {
            results.add(extractValue(current.toString()));
        }
        return results;
    }

    /**
     * "name = value" 形式から値を抽出
     */
    public static String extractValue(String s) {
        s = s.trim();
        int eqIndex = s.indexOf('=');
        if (eqIndex != -1) {
            return s.substring(eqIndex + 1).trim();
        }
        return s;
    }

    // ========================================
    // パース関数
    // ========================================

    /**
     * 整数配列をパース
     */
    public static int[] parseIntArray(String s) {
        s = s.trim().replaceAll("[\\[\\]]", "");
        if (s.isEmpty()) return new int[0];
        String[] parts = s.split(",");
        int[] arr = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            arr[i] = Integer.parseInt(parts[i].trim());
        }
        return arr;
    }

    /**
     * 2次元整数配列をパース
     */
    public static int[][] parseIntMatrix(String s) {
        s = s.trim();
        if (s.equals("[]") || s.isEmpty()) return new int[0][];

        List<int[]> rows = new ArrayList<>();
        int depth = 0;
        StringBuilder current = new StringBuilder();

        for (int i = 1; i < s.length() - 1; i++) {
            char c = s.charAt(i);
            if (c == '[') {
                depth++;
                if (depth == 1) current = new StringBuilder();
                current.append(c);
            } else if (c == ']') {
                current.append(c);
                depth--;
                if (depth == 0) {
                    rows.add(parseIntArray(current.toString()));
                }
            } else if (c == ',' && depth == 0) {
                // skip
            } else {
                current.append(c);
            }
        }
        return rows.toArray(new int[0][]);
    }

    /**
     * 文字列配列をパース
     */
    public static String[] parseStringArray(String s) {
        s = s.trim().replaceAll("[\\[\\]]", "");
        if (s.isEmpty()) return new String[0];
        String[] parts = s.split(",");
        for (int i = 0; i < parts.length; i++) {
            parts[i] = parts[i].trim().replaceAll("^\"|\"$", "");
        }
        return parts;
    }

    /**
     * null可能整数配列をパース（二分木用）
     */
    public static Integer[] parseIntegerArray(String s) {
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

    /**
     * 整数をパース
     */
    public static int parseInt(String s) {
        return Integer.parseInt(s.trim());
    }

    /**
     * 文字列をパース（クォートを除去）
     */
    public static String parseString(String s) {
        return s.trim().replaceAll("^\"|\"$", "");
    }

    /**
     * 真偽値をパース
     */
    public static boolean parseBool(String s) {
        s = s.trim().toLowerCase();
        return s.equals("true") || s.equals("1") || s.equals("yes");
    }

    /**
     * 自動型判定でパース
     */
    public static Object parseInput(String s) {
        s = s.trim();
        if (s.isEmpty()) return "";

        // 配列
        if (s.startsWith("[")) {
            // 2次元配列
            if (s.startsWith("[[")) {
                return parseIntMatrix(s);
            }
            // 文字列配列かチェック
            if (s.contains("\"")) {
                return parseStringArray(s);
            }
            return parseIntArray(s);
        }

        // 真偽値
        String lower = s.toLowerCase();
        if (lower.equals("true") || lower.equals("false")) {
            return parseBool(s);
        }

        // 整数
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            // not an integer
        }

        // 浮動小数点
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            // not a double
        }

        // 文字列
        return parseString(s);
    }

    // ========================================
    // リンクリスト操作
    // ========================================

    /**
     * 配列をリンクリストに変換
     */
    public static ListNode arrayToList(int[] arr) {
        if (arr == null || arr.length == 0) return null;
        ListNode head = new ListNode(arr[0]);
        ListNode current = head;
        for (int i = 1; i < arr.length; i++) {
            current.next = new ListNode(arr[i]);
            current = current.next;
        }
        return head;
    }

    /**
     * リンクリストを配列に変換
     */
    public static int[] listToArray(ListNode head) {
        List<Integer> list = new ArrayList<>();
        ListNode current = head;
        while (current != null) {
            list.add(current.val);
            current = current.next;
        }
        return list.stream().mapToInt(i -> i).toArray();
    }

    /**
     * 文字列をリンクリストにパース
     */
    public static ListNode parseLinkedList(String s) {
        return arrayToList(parseIntArray(s));
    }

    // ========================================
    // 二分木操作
    // ========================================

    /**
     * 配列を二分木に変換
     */
    public static TreeNode arrayToTree(Integer[] arr) {
        if (arr == null || arr.length == 0 || arr[0] == null) return null;

        TreeNode root = new TreeNode(arr[0]);
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        int i = 1;

        while (!queue.isEmpty() && i < arr.length) {
            TreeNode node = queue.poll();

            // 左の子
            if (i < arr.length) {
                if (arr[i] != null) {
                    node.left = new TreeNode(arr[i]);
                    queue.offer(node.left);
                }
                i++;
            }

            // 右の子
            if (i < arr.length) {
                if (arr[i] != null) {
                    node.right = new TreeNode(arr[i]);
                    queue.offer(node.right);
                }
                i++;
            }
        }

        return root;
    }

    /**
     * 二分木を配列に変換
     */
    public static Integer[] treeToArray(TreeNode root) {
        if (root == null) return new Integer[0];

        List<Integer> result = new ArrayList<>();
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);

        while (!queue.isEmpty()) {
            TreeNode node = queue.poll();
            if (node != null) {
                result.add(node.val);
                queue.offer(node.left);
                queue.offer(node.right);
            } else {
                result.add(null);
            }
        }

        // 末尾のnullを削除
        while (result.size() > 0 && result.get(result.size() - 1) == null) {
            result.remove(result.size() - 1);
        }

        return result.toArray(new Integer[0]);
    }

    /**
     * 文字列を二分木にパース
     */
    public static TreeNode parseTree(String s) {
        return arrayToTree(parseIntegerArray(s));
    }

    // ========================================
    // 出力フォーマット
    // ========================================

    /**
     * 汎用出力フォーマット
     */
    public static String formatOutput(Object val) {
        if (val == null) return "null";
        if (val instanceof int[]) {
            return Arrays.toString((int[])val).replaceAll(" ", "");
        } else if (val instanceof int[][]) {
            StringBuilder sb = new StringBuilder("[");
            int[][] matrix = (int[][])val;
            for (int i = 0; i < matrix.length; i++) {
                if (i > 0) sb.append(",");
                sb.append(Arrays.toString(matrix[i]).replaceAll(" ", ""));
            }
            sb.append("]");
            return sb.toString();
        } else if (val instanceof Integer[]) {
            return Arrays.toString((Integer[])val).replaceAll(" ", "");
        } else if (val instanceof String[]) {
            StringBuilder sb = new StringBuilder("[");
            String[] arr = (String[])val;
            for (int i = 0; i < arr.length; i++) {
                if (i > 0) sb.append(",");
                sb.append("\"").append(arr[i]).append("\"");
            }
            sb.append("]");
            return sb.toString();
        } else if (val instanceof ListNode) {
            return Arrays.toString(listToArray((ListNode)val)).replaceAll(" ", "");
        } else if (val instanceof TreeNode) {
            Integer[] arr = treeToArray((TreeNode)val);
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
