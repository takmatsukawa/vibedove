import { $ } from "bun";

const platforms = [
    { os: "darwin", arch: "x64", ext: "" },   // macOS Intel
    { os: "darwin", arch: "arm64", ext: "" }, // macOS Apple Silicon
    { os: "linux", arch: "x64", ext: "" },    // Linux x64
    { os: "linux", arch: "arm64", ext: "" },  // Linux ARM
    { os: "win32", arch: "x64", ext: ".exe" } // Windows
];

async function buildCLI() {
    for (const platform of platforms) {
        const outputFile = `vibedove-${platform.os}-${platform.arch}${platform.ext}`;

        await $`GOOS=${platform.os} GOARCH=${platform.arch} bun build ./index.tsx --compile --outfile ${outputFile}`;

        console.log(`Built ${outputFile}`);
    }
}

void buildCLI();
