#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { extractArtifact, renderRendererMatrixMarkdown } from "@needle-tools/three-test-matrix";

const repoRoot = process.cwd();
const statusPath = path.join(repoRoot, "tests", "three-matrix", "THREE-MATRIX-STATUS.md");
const jsonPath = path.join(repoRoot, ".cache", "usd-three-matrix-status.json");
const artifactPrefix = "[usd-three-matrix-artifact]";

if (process.argv[2] === "--from-artifact") {
    const artifactPath = process.argv[3] ? path.resolve(repoRoot, process.argv[3]) : jsonPath;
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    await writeFile(statusPath, renderMarkdown(artifact), "utf8");
    process.exit(0);
}

const extraCacheArgs = process.argv.slice(2);
const cacheResult = await runCommand("npm", ["run", "three-matrix:cache", "--", ...extraCacheArgs], { env: process.env });
process.stdout.write(cacheResult.output);
process.stderr.write(cacheResult.errorOutput);
if (cacheResult.exitCode !== 0) process.exit(cacheResult.exitCode);

const testResult = await runCommand("npx", ["playwright", "test", "--config", "tests/three-matrix/playwright.config.ts"], {
    env: process.env,
});
process.stdout.write(testResult.output);
process.stderr.write(testResult.errorOutput);

const artifact = extractArtifact(testResult.output + "\n" + testResult.errorOutput, artifactPrefix);
if (artifact) {
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await mkdir(path.dirname(statusPath), { recursive: true });
    await writeFile(jsonPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
    await writeFile(statusPath, renderMarkdown(artifact), "utf8");
}

process.exit(testResult.exitCode);

async function runCommand(command, args, options) {
    return await new Promise(resolve => {
        const child = spawn(command, args, {
            cwd: repoRoot,
            env: options.env,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let output = "";
        let errorOutput = "";
        child.stdout.on("data", chunk => {
            output += chunk.toString();
        });
        child.stderr.on("data", chunk => {
            errorOutput += chunk.toString();
        });
        child.on("close", exitCode => {
            resolve({
                exitCode: exitCode ?? 1,
                output,
                errorOutput,
            });
        });
    });
}

function renderMarkdown(artifact) {
    return renderRendererMatrixMarkdown({
        artifact,
        title: "USD WASM Three Matrix Status",
        generatedBy: "npm run test:three-matrix",
        rawArtifactPath: ".cache/usd-three-matrix-status.json",
    });
}
