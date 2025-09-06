#!/bin/bash

detect_and_download_binary() {
  ARCH=$(uname -m)
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')

  case "${OS}-${ARCH}" in
    "darwin-x86_64")
      BINARY_URL="https://github.com/yourusername/your-repo/releases/latest/download/my-cli-darwin-x64"
      ;;
    "darwin-arm64")
      BINARY_URL="https://github.com/yourusername/your-repo/releases/latest/download/my-cli-darwin-arm64"
      ;;
    "linux-x86_64")
      BINARY_URL="https://github.com/yourusername/your-repo/releases/latest/download/my-cli-linux-x64"
      ;;
    "linux-aarch64")
      BINARY_URL="https://github.com/yourusername/your-repo/releases/latest/download/my-cli-linux-arm64"
      ;;
    "windows-x86_64")
      BINARY_URL="https://github.com/yourusername/your-repo/releases/latest/download/my-cli-win32-x64.exe"
      ;;
    *)
      echo "Unsupported platform"
      exit 1
      ;;
  esac

  curl -L "$BINARY_URL" -o my-cli
  chmod +x my-cli
  sudo mv my-cli /usr/local/bin/my-cli
}

detect_and_download_binary
