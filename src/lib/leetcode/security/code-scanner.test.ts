import { describe, it, expect } from 'vitest';
import { scanCode, formatSecurityReport } from './code-scanner';

describe('code-scanner', () => {
  describe('scanCode - Python', () => {
    it('should pass safe Python code', () => {
      const code = `
class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, num in enumerate(nums):
            complement = target - num
            if complement in seen:
                return [seen[complement], i]
            seen[num] = i
        return []
`;
      const result = scanCode(code, 'python');
      expect(result.safe).toBe(true);
      expect(result.blockedPatterns).toHaveLength(0);
    });

    it('should block os.system', () => {
      const code = `
import os
os.system('rm -rf /')
`;
      const result = scanCode(code, 'python');
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns.length).toBeGreaterThan(0);
    });

    it('should block subprocess', () => {
      const code = `
import subprocess
subprocess.run(['ls'])
`;
      const result = scanCode(code, 'python');
      expect(result.safe).toBe(false);
    });

    it('should block eval', () => {
      const code = `eval("print('hello')")`;
      const result = scanCode(code, 'python');
      expect(result.safe).toBe(false);
    });
  });

  describe('scanCode - JavaScript', () => {
    it('should pass safe JavaScript code', () => {
      const code = `
function twoSum(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement), i];
    }
    map.set(nums[i], i);
  }
  return [];
}
`;
      const result = scanCode(code, 'javascript');
      expect(result.safe).toBe(true);
    });

    it('should block child_process', () => {
      const code = `const { exec } = require('child_process');`;
      const result = scanCode(code, 'javascript');
      expect(result.safe).toBe(false);
    });

    it('should block fs module', () => {
      const code = `const fs = require('fs');`;
      const result = scanCode(code, 'javascript');
      expect(result.safe).toBe(false);
    });
  });

  describe('scanCode - Java', () => {
    it('should pass safe Java code', () => {
      const code = `
class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (map.containsKey(complement)) {
                return new int[] { map.get(complement), i };
            }
            map.put(nums[i], i);
        }
        return new int[] {};
    }
}
`;
      const result = scanCode(code, 'java');
      expect(result.safe).toBe(true);
    });

    it('should block Runtime.getRuntime()', () => {
      const code = `Runtime.getRuntime().exec("ls");`;
      const result = scanCode(code, 'java');
      expect(result.safe).toBe(false);
    });
  });

  describe('scanCode - Go', () => {
    it('should pass safe Go code', () => {
      const code = `
func twoSum(nums []int, target int) []int {
    seen := make(map[int]int)
    for i, num := range nums {
        if j, ok := seen[target-num]; ok {
            return []int{j, i}
        }
        seen[num] = i
    }
    return nil
}
`;
      const result = scanCode(code, 'go');
      expect(result.safe).toBe(true);
    });

    it('should block os/exec', () => {
      const code = `import "os/exec"`;
      const result = scanCode(code, 'go');
      expect(result.safe).toBe(false);
    });
  });

  describe('scanCode - Common patterns', () => {
    it('should block infinite while(true) loop', () => {
      const code = `while (true) { }`;
      const result = scanCode(code, 'javascript');
      expect(result.safe).toBe(false);
    });

    it('should block infinite for(;;) loop', () => {
      const code = `for (;;) { }`;
      const result = scanCode(code, 'javascript');
      expect(result.safe).toBe(false);
    });
  });

  describe('formatSecurityReport', () => {
    it('should return success message for safe code', () => {
      const result = { safe: true, blockedPatterns: [] };
      const report = formatSecurityReport(result);
      expect(report).toContain('passed');
    });

    it('should format blocked patterns', () => {
      const result = {
        safe: false,
        blockedPatterns: [
          { pattern: 'os.system', line: 3, description: 'System command' },
        ],
      };
      const report = formatSecurityReport(result);
      expect(report).toContain('Security Scan Failed');
      expect(report).toContain('Line 3');
    });
  });
});
