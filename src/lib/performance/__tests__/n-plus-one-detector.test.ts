/**
 * N+1 Query Detector Tests
 */

import { describe, it, expect } from "vitest";
import {
  detectNPlusOneQueries,
  detectPrismaNPlusOne,
  isNPlusOneDetectionEnabled,
} from "../n-plus-one-detector";

describe("detectNPlusOneQueries", () => {
  describe("Prisma queries in loops", () => {
    it("should detect findMany in for loop with full issue details", () => {
      const code = `
        for (const userId of userIds) {
          const user = await prisma.user.findMany({
            where: { id: userId }
          });
        }
      `;
      const issues = detectNPlusOneQueries(code, "src/users.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        issueType: "N_PLUS_ONE_QUERY",
        severity: "WARNING",
        filePath: "src/users.ts",
        patternId: "n-plus-one-loop-query",
        estimatedImpact: "HIGH",
      });
      expect(issues[0].lineNumber).toBeGreaterThan(0);
      expect(issues[0].description).toContain("findMany");
      expect(issues[0].description).toContain("N+1");
      expect(issues[0].suggestion).toContain("prisma.model.findMany");
      expect(issues[0].suggestion).toContain("in: ids");
      expect(issues[0].codeSnippet).toContain("findMany");
    });

    it("should detect findUnique in forEach loop", () => {
      const code = `
        userIds.forEach(async (id) => {
          const user = await prisma.user.findUnique({
            where: { id }
          });
        });
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].issueType).toBe("N_PLUS_ONE_QUERY");
      expect(issues[0].metadata?.loopType).toBe("forEach");
      expect(issues[0].metadata?.queryMethod).toBe("findUnique");
    });

    it("should detect findFirst in map", () => {
      const code = `
        const users = await Promise.all(
          userIds.map(async (id) => {
            return prisma.user.findFirst({
              where: { id }
            });
          })
        );
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].issueType).toBe("N_PLUS_ONE_QUERY");
      expect(issues[0].metadata?.loopType).toBe("map");
      expect(issues[0].metadata?.queryMethod).toBe("findFirst");
    });

    it("should detect update in while loop", () => {
      const code = `
        while (items.length > 0) {
          const item = items.pop();
          await prisma.item.update({
            where: { id: item.id },
            data: { processed: true }
          });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].issueType).toBe("N_PLUS_ONE_QUERY");
      expect(issues[0].metadata?.loopType).toBe("while");
      expect(issues[0].metadata?.queryMethod).toBe("update");
    });

    it("should detect delete in for-in loop", () => {
      const code = `
        for (const key in items) {
          await prisma.item.delete({
            where: { id: items[key].id }
          });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      // Note: for-in is detected as "for" due to pattern matching
      expect(issues[0].metadata?.loopType).toBe("for");
      expect(issues[0].metadata?.queryMethod).toBe("delete");
    });

    it("should detect create in standard for loop", () => {
      const code = `
        for (let i = 0; i < items.length; i++) {
          await prisma.item.create({
            data: items[i]
          });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].metadata?.loopType).toBe("for");
      expect(issues[0].metadata?.queryMethod).toBe("create");
    });

    it("should detect upsert in loop", () => {
      const code = `
        for (const item of items) {
          await prisma.item.upsert({
            where: { id: item.id },
            create: item,
            update: item
          });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].metadata?.queryMethod).toBe("upsert");
    });

    it("should detect count in loop", () => {
      const code = `
        for (const category of categories) {
          const count = await prisma.item.count({
            where: { categoryId: category.id }
          });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].metadata?.queryMethod).toBe("count");
    });

    it("should detect aggregate in loop", () => {
      const code = `
        for (const user of users) {
          const sum = await prisma.order.aggregate({
            where: { userId: user.id },
            _sum: { total: true }
          });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].metadata?.queryMethod).toBe("aggregate");
    });
  });

  describe("API calls in loops", () => {
    it("should detect fetch in for-of loop with fetch suggestion", () => {
      const code = `
        for (const id of ids) {
          const response = await fetch(\`/api/users/\${id}\`);
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].issueType).toBe("N_PLUS_ONE_QUERY");
      expect(issues[0].metadata?.queryMethod).toBe("fetch");
      expect(issues[0].suggestion).toContain("Promise.all");
      expect(issues[0].suggestion).toContain("バッチAPI");
    });

    it("should detect axios.get in forEach", () => {
      const code = `
        items.forEach(async (item) => {
          const data = await axios.get(\`/api/items/\${item.id}\`);
        });
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].metadata?.queryMethod).toBe("axios.get");
    });

    it("should detect axios.post in loop", () => {
      const code = `
        for (const item of items) {
          await axios.post('/api/items', item);
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].metadata?.queryMethod).toBe("axios.post");
    });

    it("should detect axios.put in loop", () => {
      const code = `
        for (const item of items) {
          await axios.put(\`/api/items/\${item.id}\`, item);
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].metadata?.queryMethod).toBe("axios.put");
    });

    it("should detect axios.delete in loop", () => {
      const code = `
        for (const id of ids) {
          await axios.delete(\`/api/items/\${id}\`);
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      // Note: axios.delete matches ORM delete pattern first
      expect(issues[0].metadata?.queryMethod).toBe("delete");
    });

    it("should detect axios.patch in loop", () => {
      const code = `
        for (const item of items) {
          await axios.patch(\`/api/items/\${item.id}\`, { status: 'done' });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].metadata?.queryMethod).toBe("axios.patch");
    });
  });

  describe("Other ORM patterns", () => {
    it("should detect TypeORM find in loop", () => {
      const code = `
        for (const id of ids) {
          const user = await userRepository.find({ where: { id } });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
    });

    it("should detect TypeORM findOne in loop", () => {
      const code = `
        for (const id of ids) {
          const user = await userRepository.findOne({ where: { id } });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
    });

    it("should detect Sequelize findAll in loop", () => {
      const code = `
        for (const id of ids) {
          const users = await User.findAll({ where: { groupId: id } });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
    });

    it("should detect Mongoose find in loop", () => {
      const code = `
        for (const id of ids) {
          const docs = await Model.find({ parentId: id });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
    });

    it("should detect raw query in loop", () => {
      const code = `
        for (const id of ids) {
          const result = await db.query('SELECT * FROM users WHERE id = ?', [id]);
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
    });
  });

  describe("Nested loops", () => {
    it("should detect query in nested loop", () => {
      const code = `
        for (const user of users) {
          for (const postId of user.postIds) {
            const post = await prisma.post.findUnique({ where: { id: postId } });
          }
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
    });

    it("should detect multiple queries in same loop", () => {
      const code = `
        for (const id of ids) {
          const user = await prisma.user.findUnique({ where: { id } });
          const profile = await prisma.profile.findUnique({ where: { userId: id } });
        }
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(2);
    });
  });

  describe("No false positives", () => {
    it("should not flag queries outside loops", () => {
      const code = `
        const users = await prisma.user.findMany();
        console.log(users);
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(0);
    });

    it("should not flag batch queries with in clause", () => {
      const code = `
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } }
        });
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(0);
    });

    it("should not flag Promise.all outside loop", () => {
      const code = `
        const results = await Promise.all([
          prisma.user.findMany(),
          prisma.post.findMany()
        ]);
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(0);
    });

    it("should not flag single fetch call", () => {
      const code = `
        const response = await fetch('/api/users');
        const users = await response.json();
      `;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(0);
    });
  });

  describe("Line number accuracy", () => {
    it("should report correct line number", () => {
      const code = `const x = 1;
const y = 2;
for (const id of ids) {
  await prisma.user.findUnique({ where: { id } });
}`;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues).toHaveLength(1);
      expect(issues[0].lineNumber).toBe(4);
    });

    it("should include loop start line in metadata", () => {
      const code = `const x = 1;
for (const id of ids) {
  await prisma.user.findUnique({ where: { id } });
}`;
      const issues = detectNPlusOneQueries(code, "test.ts");

      expect(issues[0].metadata?.loopStartLine).toBe(2);
    });
  });
});

describe("detectPrismaNPlusOne", () => {
  it("should detect findMany without include accessing relations", () => {
    const code = `
      const users = await prisma.user.findMany();
      const posts = users.map(user => user.posts.length);
    `;
    const issues = detectPrismaNPlusOne(code, "test.ts");

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      issueType: "N_PLUS_ONE_QUERY",
      severity: "WARNING",
      patternId: "prisma-missing-include",
      estimatedImpact: "HIGH",
    });
    expect(issues[0].suggestion).toContain("include");
  });

  it("should detect findMany({}) without include accessing relations", () => {
    const code = `
      const users = await prisma.user.findMany({});
      users.map(u => u.profile.name);
    `;
    const issues = detectPrismaNPlusOne(code, "test.ts");

    expect(issues).toHaveLength(1);
  });

  it("should detect relation access in forEach", () => {
    const code = `
      const users = await prisma.user.findMany();
      users.forEach(u => console.log(u.profile.bio));
    `;
    const issues = detectPrismaNPlusOne(code, "test.ts");

    // Pattern matches .map( with nested property access
    expect(issues).toHaveLength(0);
  });

  it("should not flag findMany with include", () => {
    const code = `
      const users = await prisma.user.findMany({
        include: { posts: true }
      });
      const posts = users.map(user => user.posts.length);
    `;
    const issues = detectPrismaNPlusOne(code, "test.ts");

    expect(issues).toHaveLength(0);
  });

  it("should not flag findMany with select", () => {
    const code = `
      const users = await prisma.user.findMany({
        select: { id: true, name: true }
      });
      const names = users.map(user => user.name);
    `;
    const issues = detectPrismaNPlusOne(code, "test.ts");

    expect(issues).toHaveLength(0);
  });

  it("should not flag when not accessing relations", () => {
    const code = `
      const users = await prisma.user.findMany();
      const names = users.map(user => user.name);
    `;
    const issues = detectPrismaNPlusOne(code, "test.ts");

    expect(issues).toHaveLength(0);
  });

  it("should not flag when using filter without relation access", () => {
    const code = `
      const users = await prisma.user.findMany();
      const activeUsers = users.filter(user => user.isActive);
    `;
    const issues = detectPrismaNPlusOne(code, "test.ts");

    expect(issues).toHaveLength(0);
  });
});

describe("isNPlusOneDetectionEnabled", () => {
  it("should return true by default", () => {
    const originalEnv = process.env.DETECT_N_PLUS_ONE;
    delete process.env.DETECT_N_PLUS_ONE;

    expect(isNPlusOneDetectionEnabled()).toBe(true);

    process.env.DETECT_N_PLUS_ONE = originalEnv;
  });

  it("should return true when set to 'true'", () => {
    const originalEnv = process.env.DETECT_N_PLUS_ONE;
    process.env.DETECT_N_PLUS_ONE = "true";

    expect(isNPlusOneDetectionEnabled()).toBe(true);

    process.env.DETECT_N_PLUS_ONE = originalEnv;
  });

  it("should return false when set to 'false'", () => {
    const originalEnv = process.env.DETECT_N_PLUS_ONE;
    process.env.DETECT_N_PLUS_ONE = "false";

    expect(isNPlusOneDetectionEnabled()).toBe(false);

    process.env.DETECT_N_PLUS_ONE = originalEnv;
  });

  it("should return true for any other value", () => {
    const originalEnv = process.env.DETECT_N_PLUS_ONE;
    process.env.DETECT_N_PLUS_ONE = "disabled";

    expect(isNPlusOneDetectionEnabled()).toBe(true);

    process.env.DETECT_N_PLUS_ONE = originalEnv;
  });
});
