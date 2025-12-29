/**
 * Performance Analyzer Tests
 */

import { describe, it, expect } from "vitest";
import {
  analyzeFilePerformance,
  analyzePerformance,
  detectInefficientLoops,
  detectLargeBundleImports,
  detectBlockingOperations,
  isPerformanceAnalysisEnabled,
} from "../performance-analyzer";
import type { PerformanceAnalysisOptions } from "../types";

describe("analyzeFilePerformance", () => {
  it("should analyze file and return issues", () => {
    const code = `
      import React from 'react';

      function Component({ items }) {
        for (const item of items) {
          await prisma.user.findUnique({ where: { id: item.userId } });
        }
        return <div style={{ color: 'red' }}>Hello</div>;
      }
    `;
    const issues = analyzeFilePerformance(code, "Component.tsx");

    expect(issues.length).toBeGreaterThan(0);
  });

  it("should respect detectNPlusOne option", () => {
    const code = `
      for (const item of items) {
        await prisma.user.findUnique({ where: { id: item.userId } });
      }
    `;
    const options: PerformanceAnalysisOptions = {
      detectNPlusOne: false,
    };
    const issues = analyzeFilePerformance(code, "test.ts", options);

    const nPlusOneIssues = issues.filter(i => i.issueType === "N_PLUS_ONE_QUERY");
    expect(nPlusOneIssues.length).toBe(0);
  });

  it("should respect detectMemoryLeaks option", () => {
    const code = `
      setInterval(() => {
        console.log("tick");
      }, 1000);
    `;
    const options: PerformanceAnalysisOptions = {
      detectMemoryLeaks: false,
    };
    const issues = analyzeFilePerformance(code, "test.ts", options);

    const memoryLeakIssues = issues.filter(i => i.issueType === "MEMORY_LEAK");
    expect(memoryLeakIssues.length).toBe(0);
  });

  it("should respect excludePatterns option", () => {
    const code = `
      setInterval(() => {
        console.log("tick");
      }, 1000);
    `;
    const options: PerformanceAnalysisOptions = {
      excludePatterns: ["*.test.ts"],
    };
    const issues = analyzeFilePerformance(code, "test.test.ts", options);

    expect(issues.length).toBe(0);
  });

  it("should respect minSeverity option", () => {
    const code = `
      import React from 'react';
      function Component() {
        return <div style={{ color: 'red' }}>Hello</div>;
      }
    `;
    const options: PerformanceAnalysisOptions = {
      minSeverity: "WARNING",
    };
    const issues = analyzeFilePerformance(code, "Component.tsx", options);

    const infoIssues = issues.filter(i => i.severity === "INFO");
    expect(infoIssues.length).toBe(0);
  });

  it("should respect maxIssues option", () => {
    const code = `
      import React from 'react';
      function Component() {
        return (
          <div style={{ a: 1 }}>
            <div style={{ b: 2 }}>
              <div style={{ c: 3 }}>
                <div style={{ d: 4 }}>
                  <div style={{ e: 5 }}>Hello</div>
                </div>
              </div>
            </div>
          </div>
        );
      }
    `;
    const options: PerformanceAnalysisOptions = {
      maxIssues: 2,
    };
    const issues = analyzeFilePerformance(code, "Component.tsx", options);

    expect(issues.length).toBeLessThanOrEqual(2);
  });
});

describe("analyzePerformance", () => {
  it("should analyze multiple files", () => {
    const files = [
      {
        path: "Component1.tsx",
        content: `
          import React from 'react';
          function Component1() {
            return <div style={{ color: 'red' }}>Hello</div>;
          }
        `,
      },
      {
        path: "Component2.tsx",
        content: `
          import React from 'react';
          function Component2() {
            return <div style={{ color: 'blue' }}>World</div>;
          }
        `,
      },
    ];

    const result = analyzePerformance(files);

    expect(result.filesAnalyzed).toBe(2);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.analysisTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("should return stats", () => {
    const files = [
      {
        path: "test.ts",
        content: `
          for (const item of items) {
            await prisma.user.findUnique({ where: { id: item.userId } });
          }
        `,
      },
    ];

    const result = analyzePerformance(files);

    expect(result.stats).toBeDefined();
    expect(result.stats.byType).toBeDefined();
    expect(result.stats.bySeverity).toBeDefined();
    expect(result.stats.byImpact).toBeDefined();
  });

  it("should respect includePatterns option", () => {
    const files = [
      { path: "src/Component.tsx", content: "import React from 'react';" },
      { path: "lib/utils.ts", content: "export const foo = 1;" },
    ];

    const result = analyzePerformance(files, {
      includePatterns: ["src/*.tsx"],
    });

    // Only src files should be analyzed
    expect(result.filesAnalyzed).toBe(1);
  });
});

describe("detectInefficientLoops", () => {
  describe("DOM access in loops", () => {
    it("should detect getElementById in loop", () => {
      const code = `
        for (let i = 0; i < items.length; i++) {
          const element = document.getElementById('item-' + i);
          element.textContent = items[i].name;
        }
      `;
      const issues = detectInefficientLoops(code, "test.ts");

      // May also detect uncached array length
      expect(issues.length).toBeGreaterThanOrEqual(1);
      const domIssues = issues.filter(i => i.patternId === "loop-dom-access");
      expect(domIssues.length).toBe(1);
      expect(domIssues[0].issueType).toBe("EXCESSIVE_DOM_ACCESS");
    });

    it("should detect querySelector in loop", () => {
      const code = `
        items.forEach(item => {
          const element = document.querySelector('.item-' + item.id);
          element.classList.add('active');
        });
      `;
      const issues = detectInefficientLoops(code, "test.ts");

      expect(issues.length).toBe(1);
    });
  });

  describe("Uncached array length", () => {
    it("should detect uncached array.length in for loop", () => {
      const code = `
        for (let i = 0; i < items.length; i++) {
          console.log(items[i]);
        }
      `;
      const issues = detectInefficientLoops(code, "test.ts");

      expect(issues.length).toBe(1);
      expect(issues[0].issueType).toBe("INEFFICIENT_LOOP");
      expect(issues[0].patternId).toBe("uncached-array-length");
    });

    it("should not flag when array is modified in loop", () => {
      const code = `
        for (let i = 0; i < items.length; i++) {
          items.push(items[i] * 2);
        }
      `;
      const issues = detectInefficientLoops(code, "test.ts");

      const uncachedIssues = issues.filter(i => i.patternId === "uncached-array-length");
      expect(uncachedIssues.length).toBe(0);
    });
  });

  describe("Nested loop search", () => {
    it("should detect find in loop", () => {
      const code = `
        for (const item of items) {
          const match = otherItems.find(o => o.id === item.id);
        }
      `;
      const issues = detectInefficientLoops(code, "test.ts");

      expect(issues.length).toBe(1);
      expect(issues[0].issueType).toBe("INEFFICIENT_LOOP");
      expect(issues[0].patternId).toBe("nested-loop-search");
    });

    it("should detect includes in loop", () => {
      const code = `
        items.forEach(item => {
          if (selectedIds.includes(item.id)) {
            console.log(item);
          }
        });
      `;
      const issues = detectInefficientLoops(code, "test.ts");

      expect(issues.length).toBe(1);
    });

    it("should detect indexOf in loop", () => {
      const code = `
        for (const item of items) {
          const index = allItems.indexOf(item);
        }
      `;
      const issues = detectInefficientLoops(code, "test.ts");

      expect(issues.length).toBe(1);
    });
  });
});

describe("detectLargeBundleImports", () => {
  it("should detect lodash full import", () => {
    const code = `
      import _ from 'lodash';
      const result = _.debounce(fn, 100);
    `;
    const issues = detectLargeBundleImports(code, "test.ts");

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("LARGE_BUNDLE_IMPORT");
    expect(issues[0].description).toContain("lodash");
  });

  it("should detect moment import", () => {
    const code = `
      import moment from 'moment';
      const date = moment().format('YYYY-MM-DD');
    `;
    const issues = detectLargeBundleImports(code, "test.ts");

    expect(issues.length).toBe(1);
    expect(issues[0].description).toContain("moment");
  });

  it("should detect @mui/material barrel import", () => {
    const code = `
      import { Button, TextField } from '@mui/material';
    `;
    const issues = detectLargeBundleImports(code, "test.ts");

    expect(issues.length).toBe(1);
    expect(issues[0].description).toContain("@mui/material");
  });

  it("should detect antd barrel import", () => {
    const code = `
      import { Button, Input } from 'antd';
    `;
    const issues = detectLargeBundleImports(code, "test.ts");

    expect(issues.length).toBe(1);
  });

  it("should detect missing lazy load for large components", () => {
    const code = `
      import Modal from './Modal';
      import Dialog from './Dialog';
    `;
    const issues = detectLargeBundleImports(code, "test.ts");

    const lazyIssues = issues.filter(i => i.patternId === "missing-lazy-load");
    expect(lazyIssues.length).toBe(2);
  });

  it("should not flag lazy imported components", () => {
    const code = `
      const Modal = React.lazy(() => import('./Modal'));
    `;
    const issues = detectLargeBundleImports(code, "test.ts");

    const lazyIssues = issues.filter(i => i.patternId === "missing-lazy-load");
    expect(lazyIssues.length).toBe(0);
  });
});

describe("detectBlockingOperations", () => {
  it("should detect readFileSync", () => {
    const code = `
      const content = fs.readFileSync('file.txt', 'utf-8');
    `;
    const issues = detectBlockingOperations(code, "test.ts");

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("BLOCKING_OPERATION");
    expect(issues[0].patternId).toBe("sync-file-operation");
  });

  it("should detect writeFileSync", () => {
    const code = `
      fs.writeFileSync('output.txt', data);
    `;
    const issues = detectBlockingOperations(code, "test.ts");

    expect(issues.length).toBe(1);
  });

  it("should detect existsSync", () => {
    const code = `
      if (fs.existsSync('file.txt')) {
        console.log('exists');
      }
    `;
    const issues = detectBlockingOperations(code, "test.ts");

    expect(issues.length).toBe(1);
  });

  it("should detect alert", () => {
    const code = `
      alert('Warning!');
    `;
    const issues = detectBlockingOperations(code, "test.ts");

    expect(issues.length).toBe(1);
    expect(issues[0].patternId).toBe("blocking-dialog");
  });

  it("should detect confirm", () => {
    const code = `
      if (confirm('Are you sure?')) {
        doSomething();
      }
    `;
    const issues = detectBlockingOperations(code, "test.ts");

    expect(issues.length).toBe(1);
  });
});

describe("isPerformanceAnalysisEnabled", () => {
  it("should return true by default", () => {
    const originalEnv = process.env.PERFORMANCE_ANALYSIS_ENABLED;
    delete process.env.PERFORMANCE_ANALYSIS_ENABLED;

    expect(isPerformanceAnalysisEnabled()).toBe(true);

    process.env.PERFORMANCE_ANALYSIS_ENABLED = originalEnv;
  });

  it("should return false when disabled", () => {
    const originalEnv = process.env.PERFORMANCE_ANALYSIS_ENABLED;
    process.env.PERFORMANCE_ANALYSIS_ENABLED = "false";

    expect(isPerformanceAnalysisEnabled()).toBe(false);

    process.env.PERFORMANCE_ANALYSIS_ENABLED = originalEnv;
  });
});
