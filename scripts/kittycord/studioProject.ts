/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { once } from "node:events";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { build } from "esbuild";
import puppeteer from "puppeteer-core";

import { STUDIO_PROJECT_LIMIT } from "../../src/shared/kittycord/studio";
import { compileStudioProject } from "./studioCompiler";

async function main() {
    const [action, input, output, executable, consent, ...extra] = process.argv.slice(2);
    if (!["build", "test"].includes(action) || !input || !output || extra.length || action === "build" && executable)
        throw new Error("Usage: studioProject.ts build project.json unused-package.json OR test project.json unused-report.json browser.exe --execute-reviewed-source");
    if ((await stat(input)).size > STUDIO_PROJECT_LIMIT) throw new Error("Project exceeds 128 KiB.");
    const compiled = await compileStudioProject(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readFile(input))));
    if (action === "build") {
        await writeFile(output, JSON.stringify(compiled.bundle, null, 4) + "\n", { flag: "wx" });
        process.stdout.write("Validated package exported without executing source.\n"); return;
    }
    if (!executable || consent !== "--execute-reviewed-source") throw new Error("Runtime tests require a browser path and --execute-reviewed-source. Review the exact project first. No code was run.");
    await mkdir("work", { recursive: true });
    const profile = await mkdtemp(resolve("work/kittycord-studio-test-"));
    const fixture = await build({ entryPoints: ["scripts/kittycord/studioRuntimeFixture.ts"], bundle: true, platform: "browser", format: "iife", globalName: "KittycordStudioTest", write: false, define: { IS_WEB: "false", IS_REPORTER: "false" } });
    let unexpectedRequests = 0;
    const server = createServer((request, response) => {
        if (request.url === "/favicon.ico") { response.writeHead(204); response.end(); return; }
        const script = request.url === "/fixture.js";
        if (!script && request.url !== "/") { unexpectedRequests++; response.writeHead(404); response.end(); return; }
        response.setHeader("Content-Type", script ? "application/javascript" : "text/html");
        response.end(script ? fixture.outputFiles[0].text : '<!doctype html><html><head><title>Kittycord Studio runtime test</title></head><body class="theme-dark"><script src="/fixture.js"></script></body></html>');
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const browser = await puppeteer.launch({ executablePath: executable, headless: true, userDataDir: profile, protocolTimeout: 20_000 });
    try {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Test server did not start.");
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${address.port}/`);
        const result = await page.evaluate((bundle, tests) => {
            const runner = (globalThis as { KittycordStudioTest?: { run(bundle: unknown, tests: unknown): Promise<{ startup: boolean; assertions: { token: string; passed: boolean; }[]; asynchronousFault?: boolean; runtimeFailure?: boolean; }>; }; }).KittycordStudioTest;
            if (!runner) throw new Error("Studio runtime fixture is unavailable.");
            return runner.run(bundle, tests);
        }, compiled.bundle, compiled.project.tests);
        const cleanup = await page.evaluate(() => (globalThis as { KittycordStudioTest?: { clean(): boolean; }; }).KittycordStudioTest?.clean() === true);
        const passed = result.startup && !result.runtimeFailure && !result.asynchronousFault && result.assertions.every(item => item.passed) && cleanup;
        await writeFile(output, JSON.stringify({ schemaVersion: 1, scope: "Disposable browser host simulation using the actual restricted worker/frame lifecycle. No Discord account or extension source execution.",
            packageDigest: compiled.bundle.manifest.integrity.digest, assertionCount: result.assertions.length, ...result, cleanup, unexpectedRequests, passed }, null, 4) + "\n", { flag: "wx" });
        process.stdout.write(`Studio runtime test ${passed ? "passed" : "failed"}. Report written.\n`);
        if (!passed) process.exitCode = 1;
    } finally { await browser.close(); await new Promise<void>(resolveClose => server.close(() => resolveClose())); }
}

main().catch(problem => { process.stderr.write(`${problem instanceof Error ? problem.message : "Studio action failed."}\n`); process.exitCode = 1; });
