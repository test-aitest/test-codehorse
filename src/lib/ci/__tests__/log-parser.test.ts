/**
 * CI Log Parser Tests
 */

import { describe, it, expect } from "vitest";
import { parseCILog, detectFailureType, isCIAnalysisEnabled } from "../log-parser";

describe("detectFailureType", () => {
  describe("Test failures", () => {
    it("should detect Jest test failure", () => {
      const log = `
        FAIL src/components/Button.test.tsx
        ● Button component › should render correctly
          expect(received).toBe(expected)
      `;
      expect(detectFailureType(log)).toBe("TEST_FAILURE");
    });

    it("should detect test count failure", () => {
      const log = `
        Tests: 3 failed, 10 passed, 13 total
      `;
      expect(detectFailureType(log)).toBe("TEST_FAILURE");
    });

    it("should detect pytest failure", () => {
      const log = `
        FAILED tests/test_api.py::test_endpoint
      `;
      expect(detectFailureType(log)).toBe("TEST_FAILURE");
    });

    it("should detect mocha failing tests", () => {
      const log = `
        5 passing (2s)
        2 failing
      `;
      expect(detectFailureType(log)).toBe("TEST_FAILURE");
    });
  });

  describe("Type errors", () => {
    it("should detect TypeScript error", () => {
      const log = `
        src/utils/helper.ts(15,10): error TS2322: Type 'string' is not assignable to type 'number'.
      `;
      expect(detectFailureType(log)).toBe("TYPE_ERROR");
    });

    it("should detect type assignability error", () => {
      const log = `
        Type 'undefined' is not assignable to type 'string'
      `;
      expect(detectFailureType(log)).toBe("TYPE_ERROR");
    });
  });

  describe("Lint errors", () => {
    it("should detect ESLint errors", () => {
      const log = `
        ESLint found 5 errors and 2 warnings
      `;
      expect(detectFailureType(log)).toBe("LINT_ERROR");
    });

    it("should detect ESLint problem count", () => {
      const log = `
        ✖ 10 problems (8 errors, 2 warnings)
      `;
      expect(detectFailureType(log)).toBe("LINT_ERROR");
    });
  });

  describe("Dependency errors", () => {
    it("should detect npm error", () => {
      const log = `
        npm ERR! code ERESOLVE
        npm ERR! ERESOLVE unable to resolve dependency tree
      `;
      expect(detectFailureType(log)).toBe("DEPENDENCY_ERROR");
    });

    it("should detect peer dependency error", () => {
      const log = `
        npm ERR! peer dep missing: react@^18.0.0, required by @mui/material@5.0.0
      `;
      expect(detectFailureType(log)).toBe("DEPENDENCY_ERROR");
    });

    it("should detect yarn package not found", () => {
      const log = `
        error Couldn't find package "nonexistent-package"
      `;
      expect(detectFailureType(log)).toBe("DEPENDENCY_ERROR");
    });
  });

  describe("Build errors", () => {
    it("should detect build failure", () => {
      const log = `
        Build failed with errors
      `;
      expect(detectFailureType(log)).toBe("BUILD_ERROR");
    });

    it("should detect syntax error", () => {
      const log = `
        SyntaxError: Unexpected token '{'
      `;
      expect(detectFailureType(log)).toBe("BUILD_ERROR");
    });

    it("should detect module not found", () => {
      const log = `
        Module not found: Can't resolve './missing-file'
      `;
      expect(detectFailureType(log)).toBe("BUILD_ERROR");
    });
  });

  describe("Timeout errors", () => {
    it("should detect timeout", () => {
      const log = `
        Timeout of 30000ms exceeded
      `;
      expect(detectFailureType(log)).toBe("TIMEOUT");
    });

    it("should detect job timeout", () => {
      const log = `
        Job exceeded maximum execution time of 60 minutes
      `;
      expect(detectFailureType(log)).toBe("TIMEOUT");
    });
  });

  describe("Out of memory errors", () => {
    it("should detect JavaScript heap OOM", () => {
      const log = `
        FATAL ERROR: JavaScript heap out of memory
      `;
      expect(detectFailureType(log)).toBe("OUT_OF_MEMORY");
    });

    it("should detect exit code 137 (OOMKilled)", () => {
      const log = `
        Process exited with exit code 137
        OOMKilled
      `;
      expect(detectFailureType(log)).toBe("OUT_OF_MEMORY");
    });
  });

  describe("Permission errors", () => {
    it("should detect EACCES", () => {
      const log = `
        Error: EACCES: permission denied, open '/etc/passwd'
      `;
      expect(detectFailureType(log)).toBe("PERMISSION_ERROR");
    });
  });

  describe("Configuration errors", () => {
    it("should detect invalid configuration", () => {
      const log = `
        Invalid configuration: missing required field 'entry'
      `;
      expect(detectFailureType(log)).toBe("CONFIGURATION_ERROR");
    });

    it("should detect YAML exception", () => {
      const log = `
        YAMLException: bad indentation of a mapping entry
      `;
      expect(detectFailureType(log)).toBe("CONFIGURATION_ERROR");
    });
  });

  describe("Unknown errors", () => {
    it("should return UNKNOWN for unrecognized errors", () => {
      const log = `
        Something went wrong
      `;
      expect(detectFailureType(log)).toBe("UNKNOWN");
    });
  });
});

describe("parseCILog", () => {
  describe("Test failure extraction", () => {
    it("should extract failed tests from Jest output", () => {
      const log = `
FAIL src/components/Button.test.tsx
● Button component › should render correctly

  expect(received).toBe(expected)

  Expected: "Hello"
  Received: "World"

    at Object.<anonymous> (src/components/Button.test.tsx:10:5)
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.failureType).toBe("TEST_FAILURE");
      expect(result.failedTests.length).toBeGreaterThan(0);
    });

    it("should extract pytest failures", () => {
      const log = `
FAILED tests/test_api.py::test_create_user - AssertionError: expected 201 but got 400
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.failureType).toBe("TEST_FAILURE");
      expect(result.failedTests.length).toBeGreaterThan(0);
      expect(result.failedTests[0].testFile).toBe("tests/test_api.py");
    });
  });

  describe("Type error extraction", () => {
    it("should extract TypeScript errors", () => {
      const log = `
src/utils/helper.ts(15,10): error TS2322: Type 'string' is not assignable to type 'number'.
src/utils/helper.ts(20,5): error TS2339: Property 'foo' does not exist on type 'Bar'.
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.failureType).toBe("TYPE_ERROR");
      expect(result.typeErrors.length).toBe(2);
      expect(result.typeErrors[0].filePath).toBe("src/utils/helper.ts");
      expect(result.typeErrors[0].lineNumber).toBe(15);
      expect(result.typeErrors[0].tsErrorCode).toBe("TS2322");
    });

    it("should extract type mismatch details", () => {
      const log = `
src/api.ts(10,5): error TS2322: Type 'undefined' is not assignable to type 'string'.
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.typeErrors.length).toBe(1);
      expect(result.typeErrors[0].actualType).toBe("undefined");
      expect(result.typeErrors[0].expectedType).toBe("string");
    });
  });

  describe("Lint error extraction", () => {
    it("should extract ESLint errors", () => {
      const log = `
src/app.ts:10:5: error Unexpected console statement no-console
src/app.ts:15:1: warning Missing return type on function @typescript-eslint/explicit-module-boundary-types
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.lintErrors.length).toBe(2);
      expect(result.lintErrors[0].filePath).toBe("src/app.ts");
      expect(result.lintErrors[0].lineNumber).toBe(10);
      expect(result.lintErrors[0].severity).toBe("error");
      expect(result.lintErrors[0].rule).toBe("no-console");
    });
  });

  describe("Dependency error extraction", () => {
    it("should extract npm 404 errors", () => {
      const log = `
npm ERR! 404 Not Found - '@nonexistent/package'
npm ERR! 404
npm ERR! 404  '@nonexistent/package' is not in this registry.
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.failureType).toBe("DEPENDENCY_ERROR");
      expect(result.dependencyErrors.length).toBeGreaterThan(0);
    });

    it("should extract peer dependency errors", () => {
      const log = `
npm ERR! peer dep missing: react@^18.0.0, required by @mui/material@5.0.0
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.dependencyErrors.length).toBeGreaterThan(0);
      expect(result.dependencyErrors[0].errorType).toBe("PEER_DEPENDENCY");
    });
  });

  describe("Build error extraction", () => {
    it("should extract module not found errors", () => {
      const log = `
Module not found: Error: Can't resolve './missing-module' in '/app/src'
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.buildErrors.length).toBeGreaterThan(0);
      expect(result.buildErrors[0].message).toContain("missing-module");
    });
  });

  describe("Workflow info extraction", () => {
    it("should extract GitHub Actions workflow info", () => {
      const log = `
Run workflow.yml
##[group]Run npm test
$ npm test
##[endgroup]
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.workflowName).toBe("workflow.yml");
      expect(result.provider).toBe("GITHUB_ACTIONS");
    });
  });

  describe("Exit code extraction", () => {
    it("should extract exit code", () => {
      const log = `
Process completed with exit code 1
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.exitCode).toBe(1);
    });

    it("should extract exit code from alternative format", () => {
      const log = `
Process exited with code 2
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.exitCode).toBe(2);
    });
  });

  describe("Relevant sections extraction", () => {
    it("should extract relevant log sections around errors", () => {
      const log = `
Line 1: Setting up
Line 2: Installing dependencies
Line 3: Running tests
Line 4: ERROR: Test failed
Line 5: Expected 1 but got 2
Line 6: Cleaning up
      `;
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.relevantLogSections.length).toBeGreaterThan(0);
      expect(result.relevantLogSections[0]).toContain("ERROR");
    });
  });

  describe("Metadata", () => {
    it("should include metadata", () => {
      const log = "Line 1\nLine 2\nLine 3";
      const result = parseCILog(log, "GITHUB_ACTIONS");

      expect(result.metadata.totalLines).toBe(3);
      expect(result.metadata.logSize).toBe(log.length);
      expect(result.metadata.provider).toBe("GITHUB_ACTIONS");
    });
  });
});

describe("isCIAnalysisEnabled", () => {
  it("should return true by default", () => {
    const original = process.env.CI_FEEDBACK_ENABLED;
    delete process.env.CI_FEEDBACK_ENABLED;

    expect(isCIAnalysisEnabled()).toBe(true);

    process.env.CI_FEEDBACK_ENABLED = original;
  });

  it("should return false when disabled", () => {
    const original = process.env.CI_FEEDBACK_ENABLED;
    process.env.CI_FEEDBACK_ENABLED = "false";

    expect(isCIAnalysisEnabled()).toBe(false);

    process.env.CI_FEEDBACK_ENABLED = original;
  });
});
