# Vibedove MVP Specification

## 概要
- 目的: Codex/Claude Code を使った個人の Vibe Coding を補完し、タスクを Kanban で可視化しつつ、各タスクを独立した Git worktree とブランチで安全に並行作業できるようにする。
- スコープ(MVP):
  - Kanban（To Do / In Progress / In Review / Done / Cancelled）
  - 1タスク=1 worktree（着手時に作成）
  - ブランチ命名、作成/削除の自動化
  - TUI（Ink）でのボード操作
  - PR 作成（gh CLI 前提）と状態遷移の連携
- 非スコープ(MVP): プロジェクトローカル上書き設定、API連携、複雑なメタデータ管理、PR 自動マージ、リモートブランチ削除。

## 用語
- タスク: Kanban の1カード。最小情報はタイトルのみ。
- ステータス: To Do / In Progress / In Review / Done / Cancelled。
- worktree: タスク専用の作業ツリー。OS の一時ディレクトリ配下に作成。
- slug: タイトルから生成する短い識別子（小文字・ハイフン区切り）。

## 設定
- 位置: `~/.vibedove/config.json`
- キー:
  - `branchPrefix` (string): ツール管理ブランチの接頭辞。既定値: "vd"。
  - `defaultBaseBranch` (string | null): 作業ブランチ作成時のベース。未設定(null/欠落)なら「現在チェックアウト中のブランチ」。
  - `tmpRoot` (string | null): worktree の親ディレクトリ。未設定なら OS の TMPDIR を用い `TMPDIR/vibedove/worktrees` を使用。
  - `remoteName` (string): リモート名。既定値: "origin"。
- 例:
```json
{
  "branchPrefix": "vd",
  "defaultBaseBranch": null,
  "tmpRoot": null,
  "remoteName": "origin"
}
```

## データ保存
- ボード: リポジトリ直下 `./.vibedove/board.json`
- スキーマ(MVP):
```jsonc
{
  "version": 1,
  "tasks": [
    {
      "id": "k3fz9ta",              // a-z0-9 で7文字の短ID
      "title": "Fix login flow",    // 必須（タイトルのみ）
      "description": "...optional detailed text...", // 任意（複数行可）
      "status": "To Do",             // 上記5種類のいずれか
      "createdAt": "2025-09-01T12:34:56Z",
      "updatedAt": "2025-09-01T12:34:56Z",
      "branch": "vd/task/k3fz9ta-fix-login",   // 生成後に設定
      "worktreePath": "/tmp/vibedove/worktrees/vd-k3fz9ta-fix-login", // 生成後に設定
      "baseBranch": "main"           // 作成時に解決したベース（任意）
    }
  ]
}
```

## ID と slug
- ID: `a-z0-9` の7文字。衝突時は再生成。
- slug 生成規則:
  - 小文字化、空白→`-`、許可は英数字と `-` のみ。
  - 非ASCIIはローマ字化（難しい場合は該当文字を削除）。
  - 長さは先頭50文字程度にトリム。
  - 既存ブランチ名と衝突する場合は末尾に短ID等を付与。

## Git / worktree 方針
- ブランチ名: `{prefix}/task/{id}-{slug}`（既定 `prefix=vd`）。例: `vd/task/k3fz9ta-fix-login`。
- ベースブランチ解決:
  - `defaultBaseBranch` が設定されていればそれを使用。
  - 未設定なら「現在チェックアウト中のブランチ」を使用。
- worktree 作成タイミング: ステータスを To Do → In Progress に変更した瞬間に作成。
- worktree 位置: `${TMPDIR}/vibedove/worktrees/vd-{id}-{slug}`。
- 完了/中止時: Done / Cancelled へ移行したら worktree を削除（ローカル/リモートブランチは削除しない）。
- 戻し: In Progress → To Do に戻す場合、既存 worktree は残す。

## PR フロー
- 前提: GitHub CLI `gh` がインストール済み、リモート名は `origin`。
- 実装: In Progress 中に「PR作成」操作で `gh pr create` を実行。成功時:
  - タスクを自動で In Review に遷移。
  - 生成された PR URL を表示・コピー可能にする（TUI上で表示）。
- In Review への手動移動時は副作用なし（状態のみ変更）。

## TUI（Ink）
- 目的: キーボード中心で Kanban を操作し、タスクと Git 操作を素早く行う（k9s ライク）。
- 主要ビュー: 5カラムのボード（To Do / In Progress / In Review / Done / Cancelled）。
- 基本操作(MVP):
  - タスク作成（タイトル入力）
  - カラム間移動（左右）、タスク選択（上下）
  - ステータス変更（→/←）
  - 着手（In Progress へ移動＝worktree+ブランチ作成）
  - PR作成（In Progress 中のタスクから実行→In Review 遷移）
  - 完了/中止（Done/Cancelled へ移動＝worktree削除）
  - 画面更新/保存（自動保存。手動コマンドも可）
- キーバインド:
  - カラム移動: `h`/`l` または `←`/`→`
  - タスク選択: `j`/`k` または `↑`/`↓`
  - 詳細表示（フローティング）: `Enter`（Enter/Escで閉じる）
  - 状態移動: `>`（次のカラム） / `<`（前のカラム）
  - 新規作成: `n`
  - 削除: `Delete` / `Backspace`（確認ダイアログあり）
  - 着手（worktree+ブランチ作成）: `s`
  - PR作成（gh 使用・In Reviewへ）: `p`
  - 完了: `d`
  - 中止: `x`
  - 更新: `r`
  - ヘルプ: `?`
  - 終了: `q`
- 備考:
  - Done/Cancelled での worktree 削除は確認なし（MVP）。
  - In Progress 以外では `p` は無効（トーストで案内）。
- エディタ起動: 自動では開かない（将来オプション）。

## CLI 補助コマンド（任意・後方互換）
- バイナリ名: `vibedove`
- 位置づけ: TUI を既定としつつ、スクリプト等から操作したい場合の補助。
- コマンド例:
  - `vibedove` / `vibedove tui`: TUI を起動（既定）
  - `vibedove new "<title>"`: タスク追加（To Do）
  - `vibedove start <id>`: In Progress へ移行＋worktree/ブランチ作成
  - `vibedove pr <id>`: In Progress 中のタスクで PR 作成し In Review へ
  - `vibedove done <id>` / `vibedove cancel <id>`: 状態変更し worktree 削除

## エラーハンドリング / セーフティ
- 失敗時ロールバック: 作成途中で失敗した場合、部分生成物（worktree/ブランチ）を自動クリーンアップ。
- 確認プロンプト: Done/Cancelled での worktree 削除は確認なし（MVP）。
- ログ: 操作ログを標準出力に簡潔に表示。詳細ログは将来検討。

## 非機能
- オフライン: gh を使う操作（PR作成）以外はオフライン動作。
- セキュリティ: 認証情報は gh/ssh に委譲。秘密情報を保存しない。
- パフォーマンス: 数百タスクまで快適操作を目安。

## 今後の拡張（参考）
- プロジェクトローカル設定 `.vibedove/config.json` の上書き
- ラベル/優先度、説明フィールドの追加
- リモートブランチ/PR の自動クリーンアップ
- Editor/カスタムコマンドの自動起動
- 代替プロバイダ（GitLab/Bitbucket）や API ベース PR 作成
