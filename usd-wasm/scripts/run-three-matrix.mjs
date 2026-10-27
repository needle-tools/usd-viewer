#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { renderRendererMatrixMarkdown } from "@needle-tools/three-test-matrix";

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

const artifact = mergeArtifacts(extractArtifacts(testResult.output + "\n" + testResult.errorOutput, artifactPrefix));
if (artifact) {
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await mkdir(path.dirname(statusPath), { recursive: true });
    await writeFile(jsonPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
    await writeFile(statusPath, renderMarkdown(artifact), "utf8");
}

process.exit(testResult.exitCode);

function extractArtifacts(output, prefix) {
    const marker = `${prefix} `;
    return output
        .split(/\r?\n/)
        .filter(entry => entry.startsWith(marker))
        .map(entry => JSON.parse(entry.slice(marker.length)));
}

function mergeArtifacts(artifacts) {
    if (!artifacts.length) return null;
    if (artifacts.length === 1 && artifacts[0].chunkStart === undefined) return artifacts[0];

    const sortedArtifacts = [...artifacts].sort((a, b) => (a.chunkStart ?? 0) - (b.chunkStart ?? 0));
    const results = sortedArtifacts.flatMap(artifact => artifact.results ?? []);
    const failures = sortedArtifacts.flatMap(artifact => artifact.failures ?? []);
    return {
        generatedAt: new Date().toISOString(),
        scope: sortedArtifacts[0].scope ?? "custom",
        totalCases: sortedArtifacts[0].totalCases ?? results.length + failures.length,
        results,
        failures,
        summary: {
            passed: results.filter(result => result.status === "ready").length,
            unsupported: results.filter(result => result.status === "unsupported").length,
            failed: failures.length,
        },
    };
}

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
        generatedBy: artifact.scope === "full" ? "npm run test:three-matrix:full" : "npm run test:three-matrix",
        rawArtifactPath: ".cache/usd-three-matrix-status.json",
    });
}
