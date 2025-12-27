#!/usr/bin/env node

import("../dist/index.js").catch((err) => {
  console.error("Error loading codehorse-handler:", err.message);
  console.error("\nPlease build the package first: npm run build");
  process.exit(1);
});
