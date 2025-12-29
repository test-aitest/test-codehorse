/**
 * Memory Leak Detector Tests
 */

import { describe, it, expect } from "vitest";
import {
  detectMemoryLeaks,
  detectUnclearedTimers,
  detectUnremovedEventListeners,
  detectClosureLeaks,
  detectGlobalStateAccumulation,
  isMemoryLeakDetectionEnabled,
} from "../memory-leak-detector";

describe("detectUnclearedTimers", () => {
  describe("setInterval detection", () => {
    it("should detect setInterval without variable assignment", () => {
      const code = `
        setInterval(() => {
          console.log("tick");
        }, 1000);
      `;
      const issues = detectUnclearedTimers(code, "test.ts");

      expect(issues.length).toBe(1);
      expect(issues[0].issueType).toBe("MEMORY_LEAK");
      expect(issues[0].severity).toBe("WARNING");
      expect(issues[0].patternId).toBe("uncleared-interval");
    });

    it("should detect setInterval without clearInterval", () => {
      const code = `
        const intervalId = setInterval(() => {
          console.log("tick");
        }, 1000);
      `;
      const issues = detectUnclearedTimers(code, "test.ts");

      expect(issues.length).toBe(1);
      expect(issues[0].issueType).toBe("MEMORY_LEAK");
    });

    it("should not flag setInterval with clearInterval", () => {
      const code = `
        const intervalId = setInterval(() => {
          console.log("tick");
        }, 1000);

        // Later
        clearInterval(intervalId);
      `;
      const issues = detectUnclearedTimers(code, "test.ts");

      expect(issues.length).toBe(0);
    });
  });

  describe("setTimeout detection", () => {
    it("should detect setTimeout without variable assignment", () => {
      const code = `
        setTimeout(() => {
          doSomething();
        }, 5000);
      `;
      const issues = detectUnclearedTimers(code, "test.ts");

      expect(issues.length).toBe(1);
      expect(issues[0].issueType).toBe("MEMORY_LEAK");
      expect(issues[0].severity).toBe("INFO");
      expect(issues[0].patternId).toBe("uncleared-timeout");
    });

    it("should not flag setTimeout with variable for potential clearTimeout", () => {
      const code = `
        const timeoutId = setTimeout(() => {
          doSomething();
        }, 5000);
      `;
      const issues = detectUnclearedTimers(code, "test.ts");

      // setTimeout with variable is not as critical as setInterval
      expect(issues.length).toBe(0);
    });
  });
});

describe("detectUnremovedEventListeners", () => {
  it("should detect addEventListener without removeEventListener", () => {
    const code = `
      window.addEventListener('resize', handleResize);
    `;
    const issues = detectUnremovedEventListeners(code, "test.ts");

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("MEMORY_LEAK");
    expect(issues[0].severity).toBe("WARNING");
    expect(issues[0].patternId).toBe("unremoved-event-listener");
  });

  it("should not flag when removeEventListener is present", () => {
    const code = `
      window.addEventListener('resize', handleResize);
      // In cleanup
      window.removeEventListener('resize', handleResize);
    `;
    const issues = detectUnremovedEventListeners(code, "test.ts");

    expect(issues.length).toBe(0);
  });

  it("should detect multiple unremoved listeners", () => {
    const code = `
      document.addEventListener('click', handleClick);
      window.addEventListener('scroll', handleScroll);
    `;
    const issues = detectUnremovedEventListeners(code, "test.ts");

    expect(issues.length).toBe(2);
  });

  it("should match listener by target, event, and handler", () => {
    const code = `
      window.addEventListener('resize', handleResize);
      // Different handler - doesn't count
      window.removeEventListener('resize', otherHandler);
    `;
    const issues = detectUnremovedEventListeners(code, "test.ts");

    expect(issues.length).toBe(1);
  });
});

describe("detectClosureLeaks", () => {
  it("should detect addEventListener with function that uses this", () => {
    const code = `
      element.addEventListener('click', function() {
        this.classList.add('active');
      });
    `;
    const issues = detectClosureLeaks(code, "test.ts");

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("MEMORY_LEAK");
    expect(issues[0].severity).toBe("INFO");
    expect(issues[0].patternId).toBe("closure-leak");
  });

  it("should detect addEventListener with function that uses document", () => {
    const code = `
      element.addEventListener('click', function() {
        document.body.classList.toggle('modal-open');
      });
    `;
    const issues = detectClosureLeaks(code, "test.ts");

    expect(issues.length).toBe(1);
  });

  it("should detect addEventListener with function that uses window", () => {
    const code = `
      element.addEventListener('scroll', function() {
        window.scrollTo(0, 0);
      });
    `;
    const issues = detectClosureLeaks(code, "test.ts");

    expect(issues.length).toBe(1);
  });

  it("should not flag arrow functions without problematic references", () => {
    const code = `
      element.addEventListener('click', () => {
        console.log('clicked');
      });
    `;
    const issues = detectClosureLeaks(code, "test.ts");

    expect(issues.length).toBe(0);
  });
});

describe("detectGlobalStateAccumulation", () => {
  it("should detect push to global array without clearing", () => {
    // The pattern requires the array definition to start at the beginning of the line
    const code = `const items: string[] = [];

function addItem(item) {
  items.push(item);
}`;
    const issues = detectGlobalStateAccumulation(code, "test.ts");

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("MEMORY_LEAK");
    expect(issues[0].patternId).toBe("growing-global-array");
  });

  it("should not flag array with clearing mechanism", () => {
    const code = `
      const items: string[] = [];

      function addItem(item) {
        items.push(item);
      }

      function clearItems() {
        items.length = 0;
      }
    `;
    const issues = detectGlobalStateAccumulation(code, "test.ts");

    expect(issues.length).toBe(0);
  });

  it("should not flag array reassigned to empty", () => {
    const code = `
      let items: string[] = [];

      function addItem(item) {
        items.push(item);
      }

      function reset() {
        items = [];
      }
    `;
    const issues = detectGlobalStateAccumulation(code, "test.ts");

    expect(issues.length).toBe(0);
  });
});

describe("detectMemoryLeaks", () => {
  it("should combine all detection types", () => {
    const code = `
      const items: string[] = [];

      setInterval(() => {
        items.push('tick');
      }, 1000);

      window.addEventListener('resize', handleResize);
    `;
    const issues = detectMemoryLeaks(code, "test.ts");

    // setInterval without var, push to global array, unremoved listener
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it("should return empty array for clean code", () => {
    const code = `
      const intervalId = setInterval(() => {
        console.log('tick');
      }, 1000);

      window.addEventListener('resize', handleResize);

      function cleanup() {
        clearInterval(intervalId);
        window.removeEventListener('resize', handleResize);
      }
    `;
    const issues = detectMemoryLeaks(code, "test.ts");

    expect(issues.length).toBe(0);
  });
});

describe("isMemoryLeakDetectionEnabled", () => {
  it("should return true by default", () => {
    const originalEnv = process.env.DETECT_MEMORY_LEAKS;
    delete process.env.DETECT_MEMORY_LEAKS;

    expect(isMemoryLeakDetectionEnabled()).toBe(true);

    process.env.DETECT_MEMORY_LEAKS = originalEnv;
  });

  it("should return false when disabled", () => {
    const originalEnv = process.env.DETECT_MEMORY_LEAKS;
    process.env.DETECT_MEMORY_LEAKS = "false";

    expect(isMemoryLeakDetectionEnabled()).toBe(false);

    process.env.DETECT_MEMORY_LEAKS = originalEnv;
  });
});
