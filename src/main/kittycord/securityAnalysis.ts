/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { SecurityIndicator, SecurityReport } from "@shared/kittycord/security";
import type ts from "typescript";

export async function analyzePluginSource(source: string, permissions: readonly string[], now = Date.now()): Promise<SecurityReport> {
    if (typeof source !== "string" || new TextEncoder().encode(source).length > 1_048_576 || !Array.isArray(permissions) || permissions.length > 64 || permissions.some(value => typeof value !== "string" || value.length > 100)) throw new Error("Invalid security scan input.");
    const compiler = await import("typescript");
    const tree = compiler.createSourceFile("plugin.js", source, compiler.ScriptTarget.Latest, true, compiler.ScriptKind.JS);
    const indicators: SecurityIndicator[] = [];
    const aliases = new Map<string, string>();
    const imports = new Map<string, string>();
    const add = (node: ts.Node, code: string, message: string, severity: SecurityIndicator["severity"] = "blocked") => {
        const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
        if (indicators.length < 100 && !indicators.some(item => item.code === code && item.line === line)) indicators.push({ code, severity, line, message });
    };
    function literal(node: ts.Node | undefined): string | undefined {
        if (!node) return;
        if (compiler.isStringLiteralLike(node)) return node.text;
        if (compiler.isBinaryExpression(node) && node.operatorToken.kind === compiler.SyntaxKind.PlusToken) {
            const left = literal(node.left), right = literal(node.right);
            if (left !== undefined && right !== undefined && left.length + right.length <= 4096) return left + right;
        }
        return;
    }
    function path(node: ts.Node, depth = 0): string {
        if (depth > 12) return "";
        if (compiler.isParenthesizedExpression(node)) return path(node.expression, depth + 1);
        if (compiler.isIdentifier(node)) return aliases.get(node.text) ?? node.text;
        if (compiler.isPropertyAccessExpression(node)) return `${path(node.expression, depth + 1)}.${node.name.text}`;
        if (compiler.isElementAccessExpression(node)) return `${path(node.expression, depth + 1)}.${literal(node.argumentExpression) ?? "?"}`;
        return "";
    }
    function walk(node: ts.Node) {
        if (compiler.isImportDeclaration(node) && compiler.isStringLiteral(node.moduleSpecifier)) {
            const module = node.moduleSpecifier.text;
            if (node.importClause?.name) imports.set(node.importClause.name.text, module);
            const bindings = node.importClause?.namedBindings;
            if (bindings && compiler.isNamespaceImport(bindings)) imports.set(bindings.name.text, module);
            if (bindings && compiler.isNamedImports(bindings)) for (const item of bindings.elements) imports.set(item.name.text, module);
            if (/^(?:node:)?(?:fs|child_process|electron|vm|worker_threads)(?:\/|$)/.test(module)) add(node, "native-import", "Native filesystem, process or execution module requested.");
            if (/^https?:/.test(module)) add(node, "remote-code", "Executable module comes from a remote URL.");
        }
        if (compiler.isVariableDeclaration(node) && compiler.isIdentifier(node.name) && node.initializer) {
            const value = path(node.initializer);
            if (value) aliases.set(node.name.text, value);
            if (compiler.isCallExpression(node.initializer) && /(?:^|\.)(?:require)$/.test(path(node.initializer.expression))) imports.set(node.name.text, literal(node.initializer.arguments[0]) ?? "unknown");
        }
        const member = path(node);
        if (compiler.isPropertyAccessExpression(node) || compiler.isElementAccessExpression(node)) {
            if (/(?:^|\.)(?:getToken|getAuthToken|token|mfaToken|password|cookie)$/.test(member)) add(node, "credential-access", "Potential credential or cookie access. Review is required; source is retained.");
            if (/(?:^|\.)(?:localStorage|sessionStorage|indexedDB)(?:\.|$)/.test(member)) add(node, "sensitive-storage", "Direct host storage is outside the external package API.");
            if (member.includes(".?") || member.endsWith(".constructor")) add(node, "computed-access", "Unresolved computed property or constructor access needs manual review.", "review");
        }
        if (compiler.isCallExpression(node) || compiler.isNewExpression(node)) {
            const callee = path(node.expression);
            const name = callee.split(".").at(-1) ?? "";
            if (["eval", "Function", "execScript", "importScripts"].includes(name) || callee.includes(".constructor")) add(node, "dynamic-code", "Dynamic executable code is not accepted by the external runtime policy.");
            if (node.expression.kind === compiler.SyntaxKind.ImportKeyword) add(node, "dynamic-import", "Runtime module loading needs a reviewed build workflow.");
            if (["fetch", "WebSocket", "XMLHttpRequest", "sendBeacon", "EventSource"].includes(name)) add(node, "network-access", permissions.includes("network") ? "Network operation declared. Destination still requires review." : "Network operation is undeclared or unsupported.", permissions.includes("network") ? "review" : "blocked");
            if (name === "require") {
                const module = literal(node.arguments?.[0]);
                add(node, "module-loading", module ? `External module loading requested: ${module.slice(0, 100)}.` : "Computed module loading cannot be resolved statically.");
            }
            if (imports.has(callee.split(".")[0])) add(node, "dependency-behavior", "Imported dependency call requires an audited, reviewed build.", "review");
            if (["atob", "fromCharCode", "unescape"].includes(name)) add(node, "encoded-source", "Encoded strings may conceal behavior. Review decoded intent.", "review");
            if ((name === "setTimeout" || name === "setInterval") && literal(node.arguments?.[0]) !== undefined) add(node, "string-timer", "String timers execute dynamic source.");
        }
        const value = literal(node);
        if (value && compiler.isStringLiteralLike(node)) {
            if (/https?:\/\/(?:[^/]*\.)?(?:discord(?:app)?\.com)\/api\/(?:v\d+\/)?webhooks\//i.test(value)) add(node, "webhook-destination", "A Discord webhook destination can receive exported data.");
            if (/^https?:\/\//i.test(value)) add(node, "network-destination", "External URL found. No destination access is granted by this scan.", "review");
            if (value.length > 1024 && /^[A-Za-z0-9+/=]+$/.test(value)) add(node, "obfuscated-string", "Long encoded string requires manual inspection.", "review");
        }
        compiler.forEachChild(node, walk);
    }
    walk(tree);
    const syntax = compiler.transpileModule(source, { compilerOptions: { target: compiler.ScriptTarget.ESNext, module: compiler.ModuleKind.ESNext, allowJs: true }, reportDiagnostics: true, fileName: "plugin.js" }).diagnostics ?? [];
    if (syntax.some(item => item.category === compiler.DiagnosticCategory.Error)) add(tree, "invalid-syntax", "Source contains JavaScript syntax errors.");
    return { engine: "MaltCord Security Engine", policyVersion: 1, analyzedAt: now, status: indicators.some(item => item.severity === "blocked") ? "Blocked" : indicators.length ? "Needs Review" : "Passed Scan", indicators,
        limitations: "AST indicators are heuristic, can miss obfuscation and can flag innocent code. Passed Scan is not publisher verification or a safety guarantee. Runtime isolation and the capability boundary remain mandatory." };
}
