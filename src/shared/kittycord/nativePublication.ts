/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ts from "typescript";

import { nativeProject, nativeStudioModules, newNativeProject } from "./nativeStudio";

export function nativeSourceProject(name: string, source: string) {
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, /x$/.test(name) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const expression = file.statements.find(ts.isExportAssignment)?.expression;
    const definition = expression && ts.isCallExpression(expression) ? expression.arguments.find(ts.isObjectLiteralExpression) : undefined;
    const title = definition?.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(file) === "name");
    if (!title || !ts.isPropertyAssignment(title) || !ts.isStringLiteral(title.initializer)) throw new Error("Export definePlugin with a literal name, or upload a complete Native Studio project.");
    const base = newNativeProject("basic");
    return nativeProject({ ...base, metadata: { ...base.metadata, id: "local.import." + title.initializer.text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 70), name: title.initializer.text, author: "Unverified source author" }, entry: name, files: { [name]: source } });
}

export function nativeSourceFiles(files: { path: string; source: string; }[]) {
    if (!files.length || files.length > 32) throw new Error("Choose between one and 32 source files.");
    const paths = files.map(file => file.path);
    if (new Set(paths).size !== paths.length) throw new Error("Two selected files have the same path. Import a project folder to preserve its structure.");
    const base = newNativeProject("basic");
    nativeProject({ ...base, entry: files.find(file => /\.[jt]sx?$/.test(file.path))?.path ?? base.entry, files: Object.fromEntries(files.map(file => [file.path, file.source])) });
    const entries = files.filter(file => /\.[jt]sx?$/.test(file.path)).flatMap(file => {
        try { return [nativeSourceProject(file.path, file.source)]; } catch { return []; }
    });
    const indexes = entries.filter(project => /(?:^|\/)index\.[jt]sx?$/.test(project.entry));
    const candidates = indexes.length === 1 ? indexes : entries;
    if (candidates.length !== 1) throw new Error("Include one definePlugin entry, or import a Native Studio project with an explicit entry file.");
    return validateNativePublication({ ...candidates[0], files: Object.fromEntries(files.map(file => [file.path, file.source])) });
}

export function validateNativePublication(input: unknown) {
    const project = nativeProject(input);
    function reference(name: string, from: string) {
        if (nativeStudioModules.some(item => item === name)) return;
        if (!name.startsWith(".")) throw new Error(`${from}: Unsupported host import ${name}.`);
        const path = from.split("/").slice(0, -1);
        for (const segment of name.replace(/\?(?:managed|raw)$/, "").split("/")) { if (segment === "..") { if (!path.length) throw new Error(`${from}: Import escapes the project.`); path.pop(); } else if (segment !== ".") path.push(segment); }
        const requested = path.join("/");
        if (![requested, ...[".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"].map(suffix => requested + suffix)].some(value => Object.hasOwn(project.files, value))) throw new Error(`${from}: Project import ${name} was not included.`);
    }
    for (const [name, source] of Object.entries(project.files)) {
        if (name.endsWith(".json")) { JSON.parse(source); continue; }
        if (name.endsWith(".css")) continue;
        const result = ts.transpileModule(source, { fileName: name, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } });
        const error = result.diagnostics?.find(item => item.category === ts.DiagnosticCategory.Error);
        if (error) { const position = error.file?.getLineAndCharacterOfPosition(error.start ?? 0); throw new Error(`${name}:${(position?.line ?? 0) + 1}:${(position?.character ?? 0) + 1} ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`); }
        const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, /x$/.test(name) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        function inspect(node: ts.Node) {
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) reference(node.moduleSpecifier.text, name);
            if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
                const argument = node.arguments[0]; if (!argument || !ts.isStringLiteral(argument)) throw new Error(`${name}: Use a literal import path.`); reference(argument.text, name);
            }
            ts.forEachChild(node, inspect);
        }
        inspect(file);
        if (name === project.entry) {
            const expression = file.statements.find(ts.isExportAssignment)?.expression;
            const definition = expression && ts.isCallExpression(expression) ? expression.arguments.find(ts.isObjectLiteralExpression) : expression && ts.isObjectLiteralExpression(expression) ? expression : undefined;
            const title = definition?.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(file) === "name");
            if (title && ts.isPropertyAssignment(title) && ts.isStringLiteral(title.initializer) && title.initializer.text !== project.metadata.name) throw new Error(`${name}: The plugin name must match the project metadata.`);
        }
        if (name === project.entry && !file.statements.some(node => ts.isExportAssignment(node) && !node.isExportEquals || ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.some(element => element.name.text === "default"))) throw new Error(`${name}: Export the native plugin as default.`);
    }
    return project;
}
