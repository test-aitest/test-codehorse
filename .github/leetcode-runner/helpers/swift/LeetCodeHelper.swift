// LeetCode Helper for Swift
// Data structures and parsing functions

import Foundation

// ========================================
// Data Structure Definitions
// ========================================

// ListNode - Linked list node
public class ListNode {
    public var val: Int
    public var next: ListNode?

    public init() {
        self.val = 0
        self.next = nil
    }

    public init(_ val: Int) {
        self.val = val
        self.next = nil
    }

    public init(_ val: Int, _ next: ListNode?) {
        self.val = val
        self.next = next
    }
}

// TreeNode - Binary tree node
public class TreeNode {
    public var val: Int
    public var left: TreeNode?
    public var right: TreeNode?

    public init() {
        self.val = 0
        self.left = nil
        self.right = nil
    }

    public init(_ val: Int) {
        self.val = val
        self.left = nil
        self.right = nil
    }

    public init(_ val: Int, _ left: TreeNode?, _ right: TreeNode?) {
        self.val = val
        self.left = left
        self.right = right
    }
}

// ========================================
// Parsing Functions
// ========================================

// Parse integer array from string
public func parseIntArray(_ s: String) -> [Int] {
    let trimmed = s.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty || trimmed == "[]" {
        return []
    }

    // Try JSON parsing
    if let data = trimmed.data(using: .utf8),
       let arr = try? JSONSerialization.jsonObject(with: data) as? [Int] {
        return arr
    }

    // Fallback: comma-separated
    let cleaned = trimmed
        .replacingOccurrences(of: "[", with: "")
        .replacingOccurrences(of: "]", with: "")

    return cleaned.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
}

// Parse string array from string
public func parseStringArray(_ s: String) -> [String] {
    let trimmed = s.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty || trimmed == "[]" {
        return []
    }

    // Try JSON parsing
    if let data = trimmed.data(using: .utf8),
       let arr = try? JSONSerialization.jsonObject(with: data) as? [String] {
        return arr
    }

    // Fallback: comma-separated
    let cleaned = trimmed
        .replacingOccurrences(of: "[", with: "")
        .replacingOccurrences(of: "]", with: "")

    return cleaned.split(separator: ",").map {
        $0.trimmingCharacters(in: .whitespaces)
          .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
    }
}

// Parse nullable integer array (for binary tree)
public func parseNullableIntArray(_ s: String) -> [Int?] {
    let trimmed = s.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty || trimmed == "[]" {
        return []
    }

    // Try JSON parsing
    if let data = trimmed.data(using: .utf8),
       let arr = try? JSONSerialization.jsonObject(with: data) as? [Any] {
        return arr.map { item in
            if let num = item as? Int {
                return num
            } else if let num = item as? Double {
                return Int(num)
            }
            return nil
        }
    }

    return []
}

// Parse integer
public func parseInt(_ s: String) -> Int {
    return Int(s.trimmingCharacters(in: .whitespaces)) ?? 0
}

// Parse double
public func parseDouble(_ s: String) -> Double {
    return Double(s.trimmingCharacters(in: .whitespaces)) ?? 0.0
}

// Parse string (remove quotes)
public func parseString(_ s: String) -> String {
    return s.trimmingCharacters(in: .whitespaces)
            .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
}

// Parse boolean
public func parseBool(_ s: String) -> Bool {
    let lower = s.trimmingCharacters(in: .whitespaces).lowercased()
    return lower == "true" || lower == "1" || lower == "yes"
}

// ========================================
// Linked List Operations
// ========================================

// Convert array to linked list
public func arrayToList(_ arr: [Int]) -> ListNode? {
    guard !arr.isEmpty else { return nil }

    let head = ListNode(arr[0])
    var current = head

    for i in 1..<arr.count {
        current.next = ListNode(arr[i])
        current = current.next!
    }

    return head
}

// Convert linked list to array
public func listToArray(_ head: ListNode?) -> [Int] {
    var result: [Int] = []
    var current = head

    while let node = current {
        result.append(node.val)
        current = node.next
    }

    return result
}

// Parse string to linked list
public func parseLinkedList(_ s: String) -> ListNode? {
    return arrayToList(parseIntArray(s))
}

// ========================================
// Binary Tree Operations
// ========================================

// Convert LeetCode format array to binary tree
public func arrayToTree(_ arr: [Int?]) -> TreeNode? {
    guard !arr.isEmpty, let firstVal = arr[0] else { return nil }

    let root = TreeNode(firstVal)
    var queue: [TreeNode] = [root]
    var i = 1

    while !queue.isEmpty && i < arr.count {
        let node = queue.removeFirst()

        // Left child
        if i < arr.count {
            if let val = arr[i] {
                node.left = TreeNode(val)
                queue.append(node.left!)
            }
            i += 1
        }

        // Right child
        if i < arr.count {
            if let val = arr[i] {
                node.right = TreeNode(val)
                queue.append(node.right!)
            }
            i += 1
        }
    }

    return root
}

// Convert binary tree to LeetCode format array
public func treeToArray(_ root: TreeNode?) -> [Int?] {
    guard let root = root else { return [] }

    var result: [Int?] = []
    var queue: [TreeNode?] = [root]

    while !queue.isEmpty {
        let node = queue.removeFirst()

        if let node = node {
            result.append(node.val)
            queue.append(node.left)
            queue.append(node.right)
        } else {
            result.append(nil)
        }
    }

    // Remove trailing nils
    while let last = result.last, last == nil {
        result.removeLast()
    }

    return result
}

// Parse string to binary tree
public func parseTree(_ s: String) -> TreeNode? {
    return arrayToTree(parseNullableIntArray(s))
}

// ========================================
// Output Formatting
// ========================================

// Format integer array
public func formatIntArray(_ arr: [Int]) -> String {
    if let data = try? JSONSerialization.data(withJSONObject: arr),
       let str = String(data: data, encoding: .utf8) {
        return str
    }
    return "[\(arr.map { String($0) }.joined(separator: ","))]"
}

// Format string array
public func formatStringArray(_ arr: [String]) -> String {
    if let data = try? JSONSerialization.data(withJSONObject: arr),
       let str = String(data: data, encoding: .utf8) {
        return str
    }
    return "[\(arr.map { "\"\($0)\"" }.joined(separator: ","))]"
}

// Format nullable integer array
public func formatNullableIntArray(_ arr: [Int?]) -> String {
    let mapped: [Any] = arr.map { $0 as Any }
    if let data = try? JSONSerialization.data(withJSONObject: mapped),
       let str = String(data: data, encoding: .utf8) {
        return str.replacingOccurrences(of: "<null>", with: "null")
    }
    return "[\(arr.map { $0 != nil ? String($0!) : "null" }.joined(separator: ","))]"
}

// Format linked list
public func formatList(_ head: ListNode?) -> String {
    return formatIntArray(listToArray(head))
}

// Format binary tree
public func formatTree(_ root: TreeNode?) -> String {
    return formatNullableIntArray(treeToArray(root))
}

// Format boolean
public func formatBool(_ val: Bool) -> String {
    return val ? "true" : "false"
}

// ========================================
// 2D Array Operations
// ========================================

// Parse 2D integer array
public func parseIntMatrix(_ s: String) -> [[Int]] {
    let trimmed = s.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty || trimmed == "[]" {
        return []
    }

    if let data = trimmed.data(using: .utf8),
       let arr = try? JSONSerialization.jsonObject(with: data) as? [[Int]] {
        return arr
    }

    return []
}

// Format 2D integer array
public func formatIntMatrix(_ matrix: [[Int]]) -> String {
    if let data = try? JSONSerialization.data(withJSONObject: matrix),
       let str = String(data: data, encoding: .utf8) {
        return str
    }
    return "[]"
}

// ========================================
// LeetCode Input Parsing
// ========================================

// Parse LeetCode format input (e.g., "nums = [1,2,3], target = 9")
public func parseLeetCodeInput(_ input: String) -> [String] {
    var results: [String] = []

    // Split by comma, but handle arrays properly
    var current = ""
    var bracketDepth = 0

    for char in input {
        if char == "[" {
            bracketDepth += 1
            current.append(char)
        } else if char == "]" {
            bracketDepth -= 1
            current.append(char)
        } else if char == "," && bracketDepth == 0 {
            results.append(extractValue(current))
            current = ""
        } else {
            current.append(char)
        }
    }

    if !current.isEmpty {
        results.append(extractValue(current))
    }

    return results
}

// Extract value from "name = value" format
private func extractValue(_ s: String) -> String {
    if let eqIndex = s.firstIndex(of: "=") {
        return String(s[s.index(after: eqIndex)...]).trimmingCharacters(in: .whitespaces)
    }
    return s.trimmingCharacters(in: .whitespaces)
}

// ========================================
// Auto-type Parsing (like Python's parse_input)
// ========================================

// Parse input with automatic type detection
public func parseInput(_ s: String) -> Any {
    let trimmed = s.trimmingCharacters(in: .whitespaces)

    // Empty check
    if trimmed.isEmpty {
        return ""
    }

    // Array detection
    if trimmed.hasPrefix("[") {
        // 2D array detection
        if trimmed.hasPrefix("[[") {
            return parseIntMatrix(trimmed)
        }
        // Check if it's a string array or int array
        if let data = trimmed.data(using: .utf8),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [Any] {
            // Check first element type
            if let first = arr.first {
                if first is String {
                    return parseStringArray(trimmed)
                }
            }
        }
        return parseIntArray(trimmed)
    }

    // Boolean detection
    let lower = trimmed.lowercased()
    if lower == "true" || lower == "false" {
        return parseBool(trimmed)
    }

    // Integer detection
    if let intVal = Int(trimmed) {
        return intVal
    }

    // Double detection
    if let doubleVal = Double(trimmed) {
        return doubleVal
    }

    // Default: string
    return parseString(trimmed)
}

// Parse LeetCode input and return parsed values
public func parseLeetCodeInputs(_ input: String) -> [Any] {
    let stringInputs = parseLeetCodeInput(input)
    return stringInputs.map { parseInput($0) }
}

// ========================================
// Generic Output Formatting
// ========================================

// Format any output value to string
public func formatOutput(_ val: Any) -> String {
    if let arr = val as? [Int] {
        return formatIntArray(arr)
    } else if let arr = val as? [String] {
        return formatStringArray(arr)
    } else if let arr = val as? [[Int]] {
        return formatIntMatrix(arr)
    } else if let arr = val as? [Int?] {
        return formatNullableIntArray(arr)
    } else if let node = val as? ListNode {
        return formatList(node)
    } else if let node = val as? TreeNode {
        return formatTree(node)
    } else if let b = val as? Bool {
        return formatBool(b)
    } else if let n = val as? Int {
        return String(n)
    } else if let d = val as? Double {
        return String(d)
    } else if let s = val as? String {
        return s
    }
    return String(describing: val)
}
