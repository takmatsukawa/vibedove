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

## 使い方（クイックスタート）

### 基本操作

- 新規タスク: `n` でタイトル入力し To Do に追加
- 着手: タスク選択後に `s` で In Progress（Git ブランチ＆worktree を自動作成）
- エディタ起動: `o`（`~/.vibedove/config.json` の `editor` または `$EDITOR` を使用）
- 完了/中止: `d` で Done、`x` で Cancelled（対応する worktree は削除）
- 移動/選択: `h`/`l`（左右）・`j`/`k`（上下）または矢印キー、ヘルプ: `?`、終了: `q`

### 設定（任意）

設定ファイルを開く:

- `c`: プロジェクト別設定をエディタで開く／未作成なら自動作成
    - パス: `~/.vibedove/projects/<repo>/config.json`
    - 保存してエディタを閉じると TUI が設定を再読み込みします
- `C`: グローバル設定をエディタで開く／未作成なら自動作成
    - パス: `~/.vibedove/config.json`
    - 保存してエディタを閉じると TUI が設定を再読み込みします
- 使用エディタ: `config.editor` があればそれを、なければ環境変数 `$EDITOR` を使用します（未設定の場合は TUI に案内が表示されます）。


プロジェクト別設定: `~/.vibedove/projects/<repo>/config.json`

```jsonc
{
  "setupScript": "bun install",
  "copyFiles": ".env .env.local"
}
```

グローバル設定: `~/.vibedove/config.json`

```jsonc
{
  "branchPrefix": "vd",
  "defaultBaseBranch": null,
  "tmpRoot": null,
  "remoteName": "origin",
  "editor": "code"
}
```

ボードの保存先:

- `~/.vibedove/projects/<repo>/board.json` に自動生成・保存されます（リポジトリ配下には作成しません）。

作業ツリーとブランチ:

- ブランチ名: `vd/task/<id>-<slug>`（既定。`branchPrefix` で変更可）
- 作成場所: `${TMPDIR}/vibedove/worktrees/vd-<id>-<slug>`（Done/Cancelled 時に worktree を削除）

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
