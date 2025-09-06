#!/usr/bin/env bash
set -euo pipefail

# Build vibedove locally for the current OS/ARCH and install to PREFIX.
#
# Usage:
#   ./install.sh [--prefix /path]
#
# Options (via env or args):
#   VIBEDOVE_PREFIX=/some/bin   # install prefix (default: /usr/local/bin)

PREFIX="${VIBEDOVE_PREFIX:-/usr/local/bin}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix)
      PREFIX="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need bun

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
RAW_ARCH=$(uname -m)

case "$RAW_ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $RAW_ARCH" >&2; exit 1 ;;
esac

case "$OS" in
  darwin|linux) EXT="" ;;
  msys*|cygwin*|mingw*|windows) echo "Windows install not supported by this script." >&2; exit 1 ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

# Determine script directory and build locally
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
TMP=$(mktemp -t vibedove.XXXXXX)
trap 'rm -f "$TMP"' EXIT

echo "Building vibedove for ${OS}-${ARCH}..."
(
  cd "$SCRIPT_DIR"
  bun build ./index.tsx --compile --outfile "$TMP"
)

chmod +x "$TMP"
install_path="${PREFIX%/}/vibedove"

if [[ ! -w "$(dirname "$install_path")" ]]; then
  echo "Elevated permissions required to install to $(dirname "$install_path")."
  sudo mv "$TMP" "$install_path"
else
  mv "$TMP" "$install_path"
fi

echo "Installed to $install_path"
