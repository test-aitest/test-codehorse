/**
 * React Render Analyzer Tests
 */

import { describe, it, expect } from "vitest";
import {
  detectReactRerenderIssues,
  detectInlineDefinitions,
  detectHookDependencyIssues,
  detectMissingMemo,
  detectMissingUseMemo,
  isReactRerenderDetectionEnabled,
} from "../react-render-analyzer";

describe("detectInlineDefinitions", () => {
  describe("Inline style objects", () => {
    it("should detect inline style object", () => {
      const code = `
        import React from 'react';
        function Button() {
          return <button style={{ color: 'red' }}>Click</button>;
        }
      `;
      const issues = detectInlineDefinitions(code, "Button.tsx");

      expect(issues.length).toBe(1);
      expect(issues[0].issueType).toBe("UNNECESSARY_RERENDER");
      expect(issues[0].severity).toBe("INFO");
      expect(issues[0].patternId).toBe("inline-style-object");
    });

    it("should detect multiple inline styles", () => {
      const code = `
        import React from 'react';
        function Card() {
          return (
            <div style={{ padding: 10 }}>
              <h1 style={{ color: 'blue' }}>Title</h1>
            </div>
          );
        }
      `;
      const issues = detectInlineDefinitions(code, "Card.tsx");

      expect(issues.length).toBe(2);
    });
  });

  describe("Inline array props", () => {
    it("should detect inline array prop", () => {
      const code = `
        import React from 'react';
        function List() {
          return <SelectBox options={['a', 'b', 'c']} />;
        }
      `;
      const issues = detectInlineDefinitions(code, "List.tsx");

      expect(issues.length).toBe(1);
      expect(issues[0].issueType).toBe("UNNECESSARY_RERENDER");
      expect(issues[0].severity).toBe("WARNING");
      expect(issues[0].patternId).toBe("inline-array-prop");
    });
  });

  describe("Inline function props (non-event handlers)", () => {
    it("should detect inline function prop", () => {
      const code = `
        import React from 'react';
        function Parent() {
          return <Child renderItem={() => <div>Item</div>} />;
        }
      `;
      const issues = detectInlineDefinitions(code, "Parent.tsx");

      expect(issues.length).toBe(1);
      expect(issues[0].issueType).toBe("UNNECESSARY_RERENDER");
      expect(issues[0].patternId).toBe("inline-function-prop");
    });

    it("should not flag event handlers like onClick", () => {
      const code = `
        import React from 'react';
        function Button() {
          return <button onClick={() => console.log('clicked')}>Click</button>;
        }
      `;
      const issues = detectInlineDefinitions(code, "Button.tsx");

      // onClick is allowed as inline
      const functionProps = issues.filter(i => i.patternId === "inline-function-prop");
      expect(functionProps.length).toBe(0);
    });

    it("should not flag onChange", () => {
      const code = `
        import React from 'react';
        function Input() {
          return <input onChange={() => setValue(e.target.value)} />;
        }
      `;
      const issues = detectInlineDefinitions(code, "Input.tsx");

      const functionProps = issues.filter(i => i.patternId === "inline-function-prop");
      expect(functionProps.length).toBe(0);
    });
  });
});

describe("detectHookDependencyIssues", () => {
  it("should detect useCallback with empty deps using props/state", () => {
    const code = `
      import React, { useCallback } from 'react';
      function Component({ value }) {
        const handleClick = useCallback(() => {
          console.log(props.value);
        }, []);
      }
    `;
    const issues = detectHookDependencyIssues(code, "Component.tsx");

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("MISSING_MEMOIZATION");
    expect(issues[0].patternId).toBe("missing-callback-deps");
  });

  it("should detect useCallback with empty deps using state", () => {
    const code = `
      import React, { useCallback, useState } from 'react';
      function Component() {
        const [count, setCount] = useState(0);
        const handleClick = useCallback(() => {
          console.log(state.count);
        }, []);
      }
    `;
    const issues = detectHookDependencyIssues(code, "Component.tsx");

    expect(issues.length).toBe(1);
  });

  it("should not flag useCallback with proper deps", () => {
    const code = `
      import React, { useCallback, useState } from 'react';
      function Component() {
        const [count, setCount] = useState(0);
        const handleClick = useCallback(() => {
          setCount(c => c + 1);
        }, []);
      }
    `;
    const issues = detectHookDependencyIssues(code, "Component.tsx");

    // Using setCount with functional update is fine with empty deps
    expect(issues.length).toBe(0);
  });
});

describe("detectMissingMemo", () => {
  it("should detect unmemoized component used as child", () => {
    const code = `
      import React from 'react';

      function ListItem({ item }) {
        return <div>{item.name}</div>;
      }

      function List({ items }) {
        return (
          <div>
            {items.map(item => <ListItem key={item.id} item={item} />)}
          </div>
        );
      }
    `;
    const issues = detectMissingMemo(code, "List.tsx");

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("MISSING_MEMOIZATION");
    expect(issues[0].patternId).toBe("missing-react-memo");
    expect(issues[0].description).toContain("ListItem");
  });

  it("should not flag memoized components", () => {
    const code = `
      import React from 'react';

      const ListItem = React.memo(function ListItem({ item }) {
        return <div>{item.name}</div>;
      });

      function List({ items }) {
        return (
          <div>
            {items.map(item => <ListItem key={item.id} item={item} />)}
          </div>
        );
      }
    `;
    const issues = detectMissingMemo(code, "List.tsx");

    const memoIssues = issues.filter(i => i.patternId === "missing-react-memo");
    expect(memoIssues.length).toBe(0);
  });

  it("should not flag App/Page/Layout components", () => {
    const code = `
      import React from 'react';

      function App() {
        return <div>App</div>;
      }

      function PageLayout() {
        return <App />;
      }
    `;
    const issues = detectMissingMemo(code, "App.tsx");

    // App and PageLayout should be excluded
    expect(issues.length).toBe(0);
  });
});

describe("detectMissingUseMemo", () => {
  it("should detect filter+map without useMemo", () => {
    const code = `
      import React from 'react';

      function FilteredList({ items }) {
        const filtered = items.filter(i => i.active).map(i => i.name);
        return <ul>{filtered.map(name => <li key={name}>{name}</li>)}</ul>;
      }
    `;
    const issues = detectMissingUseMemo(code, "FilteredList.tsx");

    expect(issues.length).toBe(1);
    expect(issues[0].issueType).toBe("MISSING_MEMOIZATION");
    expect(issues[0].patternId).toBe("missing-usememo");
  });

  it("should detect sort without useMemo", () => {
    const code = `
      import React from 'react';

      function SortedList({ items }) {
        const sorted = items.sort((a, b) => a.name.localeCompare(b.name));
        return <ul>{sorted.map(i => <li key={i.id}>{i.name}</li>)}</ul>;
      }
    `;
    const issues = detectMissingUseMemo(code, "SortedList.tsx");

    expect(issues.length).toBe(1);
    expect(issues[0].description).toContain("sort");
  });

  it("should detect reduce without useMemo", () => {
    const code = `
      import React from 'react';

      function Total({ items }) {
        const total = items.reduce((sum, i) => sum + i.price, 0);
        return <div>Total: {total}</div>;
      }
    `;
    const issues = detectMissingUseMemo(code, "Total.tsx");

    expect(issues.length).toBe(1);
    expect(issues[0].description).toContain("reduce");
  });

  it("should not flag when inside useMemo", () => {
    const code = `
      import React, { useMemo } from 'react';

      function FilteredList({ items }) {
        const filtered = useMemo(() => {
          return items.filter(i => i.active).map(i => i.name);
        }, [items]);
        return <ul>{filtered.map(name => <li key={name}>{name}</li>)}</ul>;
      }
    `;
    const issues = detectMissingUseMemo(code, "FilteredList.tsx");

    expect(issues.length).toBe(0);
  });

  it("should not flag outside React component", () => {
    const code = `
      // Utility function, not a component
      function processItems(items) {
        return items.filter(i => i.active).map(i => i.name);
      }
    `;
    const issues = detectMissingUseMemo(code, "utils.ts");

    expect(issues.length).toBe(0);
  });
});

describe("detectReactRerenderIssues", () => {
  it("should skip non-React files", () => {
    const code = `
      const items = data.filter(i => i.active).map(i => i.name);
    `;
    const issues = detectReactRerenderIssues(code, "utils.ts");

    expect(issues.length).toBe(0);
  });

  it("should analyze TSX files", () => {
    const code = `
      import React from 'react';
      function Component() {
        return <div style={{ color: 'red' }}>Hello</div>;
      }
    `;
    const issues = detectReactRerenderIssues(code, "Component.tsx");

    expect(issues.length).toBeGreaterThan(0);
  });

  it("should analyze JSX files", () => {
    const code = `
      import React from 'react';
      function Component() {
        return <div style={{ color: 'red' }}>Hello</div>;
      }
    `;
    const issues = detectReactRerenderIssues(code, "Component.jsx");

    expect(issues.length).toBeGreaterThan(0);
  });

  it("should combine all React-specific issues", () => {
    const code = `
      import React from 'react';

      function ListItem({ item }) {
        return <div>{item.name}</div>;
      }

      function List({ items }) {
        const filtered = items.filter(i => i.active);
        return (
          <div style={{ padding: 10 }}>
            {filtered.map(item => <ListItem key={item.id} item={item} />)}
          </div>
        );
      }
    `;
    const issues = detectReactRerenderIssues(code, "List.tsx");

    // Should find: inline style, missing useMemo for filter, missing React.memo for ListItem
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe("isReactRerenderDetectionEnabled", () => {
  it("should return true by default", () => {
    const originalEnv = process.env.DETECT_REACT_RERENDERS;
    delete process.env.DETECT_REACT_RERENDERS;

    expect(isReactRerenderDetectionEnabled()).toBe(true);

    process.env.DETECT_REACT_RERENDERS = originalEnv;
  });

  it("should return false when disabled", () => {
    const originalEnv = process.env.DETECT_REACT_RERENDERS;
    process.env.DETECT_REACT_RERENDERS = "false";

    expect(isReactRerenderDetectionEnabled()).toBe(false);

    process.env.DETECT_REACT_RERENDERS = originalEnv;
  });
});
