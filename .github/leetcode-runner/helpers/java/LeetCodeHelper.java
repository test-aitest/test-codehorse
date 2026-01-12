// LeetCode Helper for Java
// Data structure parsing and output formatting

import java.util.*;

public class LeetCodeHelper {

    // ========================================
    // LeetCode Input Parsing
    // ========================================

    /**
     * Parse LeetCode format input
     * Example: "nums = [1,2,3], target = 9" -> ["[1,2,3]", "9"]
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
     * Extract value from "name = value" format
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
    // Parse Functions
    // ========================================

    /**
     * Parse integer array
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
     * Parse 2D integer array (matrix)
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
     * Parse string array
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
     * Parse nullable integer array (for binary tree)
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
     * Parse integer
     */
    public static int parseInt(String s) {
        return Integer.parseInt(s.trim());
    }

    /**
     * Parse string (remove quotes)
     */
    public static String parseString(String s) {
        return s.trim().replaceAll("^\"|\"$", "");
    }

    /**
     * Parse boolean
     */
    public static boolean parseBool(String s) {
        s = s.trim().toLowerCase();
        return s.equals("true") || s.equals("1") || s.equals("yes");
    }

    /**
     * Parse with automatic type detection
     */
    public static Object parseInput(String s) {
        s = s.trim();
        if (s.isEmpty()) return "";

        // Array
        if (s.startsWith("[")) {
            // 2D array
            if (s.startsWith("[[")) {
                return parseIntMatrix(s);
            }
            // Check if string array
            if (s.contains("\"")) {
                return parseStringArray(s);
            }
            return parseIntArray(s);
        }

        // Boolean
        String lower = s.toLowerCase();
        if (lower.equals("true") || lower.equals("false")) {
            return parseBool(s);
        }

        // Integer
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            // not an integer
        }

        // Double
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            // not a double
        }

        // String
        return parseString(s);
    }

    // ========================================
    // Linked List Operations
    // ========================================

    /**
     * Convert array to linked list
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
     * Convert linked list to array
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
     * Parse string to linked list
     */
    public static ListNode parseLinkedList(String s) {
        return arrayToList(parseIntArray(s));
    }

    // ========================================
    // Binary Tree Operations
    // ========================================

    /**
     * Convert array to binary tree
     */
    public static TreeNode arrayToTree(Integer[] arr) {
        if (arr == null || arr.length == 0 || arr[0] == null) return null;

        TreeNode root = new TreeNode(arr[0]);
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        int i = 1;

        while (!queue.isEmpty() && i < arr.length) {
            TreeNode node = queue.poll();

            // Left child
            if (i < arr.length) {
                if (arr[i] != null) {
                    node.left = new TreeNode(arr[i]);
                    queue.offer(node.left);
                }
                i++;
            }

            // Right child
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
     * Convert binary tree to array
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

        // Remove trailing nulls
        while (result.size() > 0 && result.get(result.size() - 1) == null) {
            result.remove(result.size() - 1);
        }

        return result.toArray(new Integer[0]);
    }

    /**
     * Parse string to binary tree
     */
    public static TreeNode parseTree(String s) {
        return arrayToTree(parseIntegerArray(s));
    }

    // ========================================
    // Output Formatting
    // ========================================

    /**
     * Generic output formatter
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
