# vibedove

vibedove は、Claude Code、Codex などのコーディングエージェントを最大限に活用するのに役立つコマンドラインツールです。

- カンバンボードでタスク管理できます。
- タスクごとに Git Worktree が生成され、作業場所として割り当てられます。

vibedove は [Vibe Kanban](https://www.vibekanban.com/) にインスパイアされています。

## インストール

### 事前ビルド済みバイナリ（GitHub Releases）

[GitHub Releases](https://github.com/takmatsukawa/vibedove/releases) のページからビルド済みバイナリをダウンロードし、`PATH` が通っているディレクトリ（例: `/usr/local/bin`）に配置してください。

例:

macOS（Apple Silicon）:

```bash
curl -L -o vibedove \
  https://github.com/takmatsukawa/vibedove/releases/latest/download/vibedove-darwin-arm64
chmod +x vibedove
sudo mv vibedove /usr/local/bin/
vibedove --version
```

### Bun でローカルビルドしてインストール

Bun を使ってローカルソースからインストール（macOS/Linux）:

前提条件:

- Bun v1.2+

手順:

```bash
bun install
bun run install-bin            # ローカルでビルドして /usr/local/bin にインストール
```

## 開発

依存関係のインストール:

```bash
bun install
```

ローカルで TUI を起動:

```bash
bun index.tsx
```

このプロジェクトは Bun を使用しています。Bun は高速なオールインワンの JavaScript ランタイムです: https://bun.sh
