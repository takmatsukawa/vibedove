# vibedove

## Install

Install from local source using Bun (macOS/Linux):

Requirements:

- Bun v1.2+

Steps:

```bash
bun install
bun run install-bin            # builds locally and installs to /usr/local/bin
```

Customize install location:

```bash
VIBEDOVE_PREFIX=$HOME/.local/bin bun run install-bin
```

Verify:

```bash
vibedove --help
```

## Development

Install dependencies:

```bash
bun install
```

Run the TUI locally:

```bash
bun index.tsx
```

This project uses Bun (v1.2+). [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
