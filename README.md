# vibedove

## Install

Install the latest release binary (macOS/Linux):

```bash
curl -fsSL https://raw.githubusercontent.com/takmatsukawa/vibedove/main/install.sh | bash
```

or with wget:

```bash
wget -qO- https://raw.githubusercontent.com/takmatsukawa/vibedove/main/install.sh | bash
```

Options (env vars):

- `VIBEDOVE_VERSION`: specific tag like `v0.0.5` (default: latest)
- `VIBEDOVE_PREFIX`: install path, e.g. `$HOME/.local/bin` (default: `/usr/local/bin`)

Examples:

```bash
VIBEDOVE_VERSION=v0.0.5 curl -fsSL https://raw.githubusercontent.com/takmatsukawa/vibedove/main/install.sh | bash
VIBEDOVE_PREFIX=$HOME/.local/bin curl -fsSL https://raw.githubusercontent.com/takmatsukawa/vibedove/main/install.sh | bash
```

After installation:

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
