#!/usr/bin/env bash
set -euo pipefail

# Install vibedove binary for current OS/ARCH from GitHub Releases.
#
# Quick install (latest):
#   curl -fsSL https://raw.githubusercontent.com/takmatsukawa/vibedove/main/install.sh | bash
#   wget -qO-  https://raw.githubusercontent.com/takmatsukawa/vibedove/main/install.sh | bash
#
# Options (via env or args):
#   VIBEDOVE_VERSION=vX.Y.Z     # specific version (default: latest)
#   VIBEDOVE_PREFIX=/some/bin   # install prefix (default: /usr/local/bin)
#   VIBEDOVE_REPO=owner/repo    # override repo (default: takmatsukawa/vibedove)
# Or: ./install.sh [--version vX.Y.Z] [--prefix /path] [--repo owner/repo]

REPO="${VIBEDOVE_REPO:-takmatsukawa/vibedove}"
VERSION="${VIBEDOVE_VERSION:-latest}"
PREFIX="${VIBEDOVE_PREFIX:-/usr/local/bin}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="$2"; shift 2 ;;
    --version)
      VERSION="$2"; shift 2 ;;
    --prefix)
      PREFIX="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$REPO" ]]; then
  echo "Error: GitHub repo is not set." >&2
  echo "Set VIBEDOVE_REPO=owner/repo or pass --repo owner/repo" >&2
  exit 1
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need curl

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

BINARY_NAME="vibedove-${OS}-${ARCH}${EXT}"

if [[ "$VERSION" == "latest" ]]; then
  URL="https://github.com/${REPO}/releases/latest/download/${BINARY_NAME}"
else
  URL="https://github.com/${REPO}/releases/download/${VERSION}/${BINARY_NAME}"
fi

TMP=$(mktemp -t vibedove.XXXXXX)
trap 'rm -f "$TMP"' EXIT

echo "Downloading ${BINARY_NAME} from ${REPO} (${VERSION})..."
if ! curl -fL "$URL" -o "$TMP"; then
  echo "Download failed. Tried: $URL" >&2
  echo "Check that the release exists and contains ${BINARY_NAME}." >&2
  exit 1
fi

chmod +x "$TMP"
install_path="${PREFIX%/}/vibedove"

if [[ ! -w "$(dirname "$install_path")" ]]; then
  echo "Elevated permissions required to install to $(dirname "$install_path")."
  sudo mv "$TMP" "$install_path"
else
  mv "$TMP" "$install_path"
fi

echo "Installed to $install_path"
echo "Run: vibedove --help"
