/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Page } from "puppeteer-core";

import { parseForgeRequest } from "../../src/shared/kittycord/forge";
import { verifyExternalPackage } from "../../src/shared/kittycord/javascriptPackage";
import { parseStudioProject } from "../../src/shared/kittycord/studio";

export async function checkDeveloperTools(page: Page, directory: string, downloads: boolean) {
    async function button(text: string) {
        const clicked = await page.evaluate(text => {
            const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".kc-tool-page button")).find(element => element.textContent === text);
            if (!button || button.disabled) return false;
            button.click(); return true;
        }, text);
        assert.equal(clicked, true, `The ${text} control was unavailable.`);
    }
    async function downloaded(name: string) {
        for (let attempt = 0; attempt < 50; attempt++) {
            try { return JSON.parse(await readFile(resolve(directory, "downloads", name), "utf8")); }
            catch (problem) { if (attempt === 49) throw problem; await new Promise(resolveWait => setTimeout(resolveWait, 100)); }
        }
        throw new Error("The expected download did not complete.");
    }
    await page.evaluate('KittycordBrowserProbe.showTool("builder")');
    await page.waitForSelector('[aria-label="Functional workflow preview"]');
    await button("Add");
    await page.waitForFunction(() => document.querySelector('[aria-label="Functional workflow preview"]')?.textContent?.includes("Count: 1"));
    await button("Reset");
    await page.waitForFunction(() => document.querySelector('[aria-label="Functional workflow preview"]')?.textContent?.includes("Count: 0"));
    if (downloads) {
        await button("Validate & export utility");
        const utility = await verifyExternalPackage(await downloaded("local.visual-counter.kittycord.json"));
        assert.deepEqual(utility.manifest.capabilities, ["kittycord.utility-js.v1"]);
        await button("Export Studio project"); assert.equal(parseStudioProject(await downloaded("kittycord-workflow.project.json")).api, "utility-v1");
    }
    await button("Theme colors");
    await button("Add color block");
    await page.waitForFunction(() => document.querySelectorAll('.kc-builder-block input[type="color"]').length === 2);
    const moved = await page.evaluate(() => {
        const blocks = Array.from(document.querySelectorAll(".kc-builder-block"));
        const before = blocks[1].querySelector("input")?.getAttribute("aria-label");
        Array.from(blocks[1].querySelectorAll("button")).find(element => element.textContent === "Move up")?.click();
        return before;
    });
    await page.waitForFunction(moved => document.querySelector(".kc-builder-block input")?.getAttribute("aria-label") === moved, {}, moved);
    if (downloads) {
        await button("Validate & export package");
        const bundle = await verifyExternalPackage(await downloaded("local.my-plugin.kittycord.json"));
        assert.equal(bundle.manifest.entrypoints.desktop, "theme.json");
        await button("Export Studio project");
        assert.equal(parseStudioProject(await downloaded("kittycord-builder.project.json")).tests.length, 2);
    }
    await button("Edit generated source");
    await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Plugin JavaScript source"]')?.value.includes("globalThis.kittycordPlugin"));
    await page.evaluate('KittycordBrowserProbe.showTool("forge")');
    await page.type('textarea[aria-label="AI plugin description"]', "Create a rose accent plugin");
    await button("Preview prompt");
    await page.waitForFunction(() => document.querySelector(".kc-catalog-source")?.textContent?.includes("Create a rose accent plugin"));
    assert.equal(await page.$eval('input[type="checkbox"]', element => element instanceof HTMLInputElement && element.checked), false);
    await page.click('.kc-tools-card pre + label input[type="checkbox"]');
    await page.evaluate(() => Array.from(document.querySelectorAll("summary")).find(element => element.textContent === "Provider request file")?.click());
    await page.type('input[aria-label="AI provider model"]', "fixture-only-no-provider-call");
    if (downloads) {
        await button("Export request for CLI review");
        const request = parseForgeRequest(await downloaded("kittycord-ai-request.json"));
        assert.equal(request.provider, "ollama");
        assert.equal(request.model, "fixture-only-no-provider-call");
        assert.match(request.prompt, /Create a rose accent plugin/);
    }
    await page.evaluate('KittycordBrowserProbe.showTool("discovery")');
    await page.type('input[aria-label="Plugin discovery request"]', "latency");
    await button("Find plugins");
    await page.waitForFunction(() => Array.from(document.querySelectorAll(".kc-tools-card")).some(element => element.textContent?.includes("MessageLatency")));
    assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll(".kc-tools-card button")).every(element => element.textContent === "View details before enabling")), true);
    return { functionalBuilderActions: true, builderBlockReordered: true, builderConvertedToStudio: true, forgePromptPreviewedLocally: true, forgeSourceOptInDefaultOff: true, discoveryReturnedRealPlugin: true, discoveryHasNoInstallAction: true,
        ...(downloads ? { functionalBuilderExportVerified: true, builderExportIntegrityVerified: true, builderStudioExportVerified: true, forgeRequestExportVerified: true } : {}) };
}
