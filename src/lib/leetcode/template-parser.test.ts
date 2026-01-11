import { describe, it, expect } from 'vitest';
import {
  parsePRDescription,
  detectLanguage,
  extractProblemId,
  isLeetCodePR,
  parseTestInput,
  normalizeOutput,
  compareOutputs,
} from './template-parser';

describe('template-parser', () => {
  describe('parsePRDescription', () => {
    it('should parse valid LeetCode PR description', () => {
      const description = `
Problem URL: https://leetcode.com/problems/two-sum/

Test Cases:
Input: nums = [2,7,11,15], target = 9
Output: [0,1]

Input: nums = [3,2,4], target = 6
Output: [1,2]
`;
      const result = parsePRDescription(description);

      expect(result.problemUrl).toBe('https://leetcode.com/problems/two-sum/');
      expect(result.problemId).toBe('two-sum');
      expect(result.testCases).toHaveLength(2);
      expect(result.testCases[0].input).toBe('nums = [2,7,11,15], target = 9');
      expect(result.testCases[0].expectedOutput).toBe('[0,1]');
    });

    it('should return null for invalid description', () => {
      const result = parsePRDescription('Just a regular PR');

      expect(result.problemUrl).toBeNull();
      expect(result.problemId).toBeNull();
      expect(result.testCases).toHaveLength(0);
    });
  });

  describe('detectLanguage', () => {
    it('should detect Python files', () => {
      expect(detectLanguage('solution.py')).toBe('python');
    });

    it('should detect JavaScript files', () => {
      expect(detectLanguage('solution.js')).toBe('javascript');
    });

    it('should detect TypeScript files', () => {
      expect(detectLanguage('solution.ts')).toBe('typescript');
    });

    it('should detect Java files', () => {
      expect(detectLanguage('Solution.java')).toBe('java');
    });

    it('should detect Go files', () => {
      expect(detectLanguage('solution.go')).toBe('go');
    });

    it('should return null for unsupported files', () => {
      expect(detectLanguage('solution.rb')).toBeNull();
      expect(detectLanguage('solution.cpp')).toBeNull();
    });
  });

  describe('extractProblemId', () => {
    it('should extract problem ID from URL', () => {
      expect(extractProblemId('https://leetcode.com/problems/two-sum/')).toBe('two-sum');
      expect(extractProblemId('https://leetcode.com/problems/add-two-numbers')).toBe('add-two-numbers');
    });

    it('should return null for invalid URL', () => {
      expect(extractProblemId('https://google.com')).toBeNull();
    });
  });

  describe('isLeetCodePR', () => {
    it('should return true for valid LeetCode PR', () => {
      const description = `
Problem URL: https://leetcode.com/problems/two-sum/
Test Cases:
Input: nums = [1,2]
Output: [0,1]
`;
      expect(isLeetCodePR(description)).toBe(true);
    });

    it('should return false for non-LeetCode PR', () => {
      expect(isLeetCodePR('Fix bug in login')).toBe(false);
    });
  });

  describe('parseTestInput', () => {
    it('should return input as-is', () => {
      expect(parseTestInput('[1,2,3]')).toBe('[1,2,3]');
      expect(parseTestInput('nums = [1,2]')).toBe('nums = [1,2]');
    });
  });

  describe('normalizeOutput', () => {
    it('should normalize output string', () => {
      expect(normalizeOutput('  [1, 2, 3]  ')).toBe('[1,2,3]');
      expect(normalizeOutput('true')).toBe('true');
    });
  });

  describe('compareOutputs', () => {
    it('should compare equal outputs', () => {
      expect(compareOutputs('[1,2]', '[1, 2]')).toBe(true);
      expect(compareOutputs('true', 'true')).toBe(true);
    });

    it('should detect different outputs', () => {
      expect(compareOutputs('[1,2]', '[2,1]')).toBe(false);
      expect(compareOutputs('true', 'false')).toBe(false);
    });
  });
});
