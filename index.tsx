#!/usr/bin/env bun
import { render } from "ink";
import React from "react";
import { App } from "./src/tui/App";
import pkg from "./package.json" assert { type: "json" };

// Minimal CLI: support --version only
if (Bun.argv.includes("--version") || Bun.argv.includes("-v")) {
  console.log(pkg.version);
  process.exit(0);
}

render(<App />);
