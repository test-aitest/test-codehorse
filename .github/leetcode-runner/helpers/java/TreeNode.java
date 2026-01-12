// LeetCode TreeNode for Java

import java.util.*;

public class TreeNode {
    public int val;
    public TreeNode left;
    public TreeNode right;

    public TreeNode() {}

    public TreeNode(int val) {
        this.val = val;
    }

    public TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }

    // Create binary tree from array
    public static TreeNode fromArray(Integer[] arr) {
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

    // Convert binary tree to array
    public static Integer[] toArray(TreeNode root) {
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

    @Override
    public String toString() {
        return "TreeNode(" + val + ")";
    }
}
