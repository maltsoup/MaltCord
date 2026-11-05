/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { builtinModules } from "node:module";

import ts from "typescript";

import type { PluginPlatform } from "../../src/shared/kittycord/manifest";

const nativeModules = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
const coreImports = new Set(["@utils/types", "@utils/constants", "@api/Settings", "@webpack/common"]);

export function analyzeSourceCompatibility(source: string, platform: PluginPlatform, moduleAvailable: (name: string) => boolean = name => coreImports.has(name)) {
    if (new TextEncoder().encode(source).byteLength > 1024 * 1024) throw new Error("Source analysis is limited to 1 MiB.");
    const file = ts.createSourceFile("plugin.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports: { specifier: string; typeOnly: boolean; }[] = [];
    let dynamicImport = false;
    let dynamicEvaluation = false;
    let pluginDefinition = false;
    let patches = false;
    function visit(node: ts.Node) {
        if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier))
            imports.push({ specifier: node.moduleSpecifier.text, typeOnly: node.importClause?.isTypeOnly === true });
        if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression))
            imports.push({ specifier: node.moduleReference.expression.text, typeOnly: node.isTypeOnly });
        if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier))
            imports.push({ specifier: node.moduleSpecifier.text, typeOnly: node.isTypeOnly });
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
            const { expression } = node;
            if (ts.isIdentifier(expression) && ["eval", "Function"].includes(expression.text)) dynamicEvaluation = true;
            if (ts.isCallExpression(node) && (expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(expression) && expression.text === "require")) {
                const argument = node.arguments[0];
                if (argument && ts.isStringLiteralLike(argument)) imports.push({ specifier: argument.text, typeOnly: false });
                else dynamicImport = true;
            }
            if (ts.isCallExpression(node) && ts.isIdentifier(expression) && expression.text === "definePlugin") {
                pluginDefinition = true;
                const options = node.arguments[0];
                if (options && ts.isObjectLiteralExpression(options)) patches ||= options.properties.some(property =>
                    (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
                    && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) && property.name.text === "patches");
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(file);
    const syntaxErrors = (ts.transpileModule(source, { fileName: "plugin.tsx", reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve } }).diagnostics ?? [])
        .filter(item => item.category === ts.DiagnosticCategory.Error).map(item => ({ code: item.code, offset: item.start ?? 0 }));
    const nativeImports = imports.filter(item => !item.typeOnly && (nativeModules.has(item.specifier) || item.specifier === "electron"));
    const remoteImports = imports.filter(item => !item.typeOnly && /^https?:\/\//.test(item.specifier));
    const unresolvedImports = imports.filter(item => !nativeModules.has(item.specifier) && item.specifier !== "electron" && !/^https?:\/\//.test(item.specifier) && !moduleAvailable(item.specifier));
    const browser = ["chrome", "edge", "firefox"].includes(platform);
    const classification = remoteImports.length || dynamicEvaluation ? "Unsafe or blocked"
        : syntaxErrors.length || dynamicImport || unresolvedImports.length || browser && nativeImports.length || !pluginDefinition ? "Unsupported"
            : "Requires rebuild or restart";
    return { schemaVersion: 1, platform, classification, imports, nativeImports, remoteImports, unresolvedImports,
        dynamicImport, dynamicEvaluation, pluginDefinition, patches, syntaxErrors, canInstall: false,
        scope: "Static single-file imports and patch declarations only. No execution, API certification, dependency closure, adaptation or publisher verification." };
}
