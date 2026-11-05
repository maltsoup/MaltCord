/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

import { buildStudioPackage, parseStudioProject, STUDIO_LIMIT, studioTypeDeclarations } from "../../src/shared/kittycord/studio";

export async function compileStudioProject(input: unknown) {
    const project = parseStudioProject(input);
    if (project.language === "declarative") return { bundle: await buildStudioPackage(project), diagnostics: [] };
    const sourcePath = resolve(`work/kittycord-studio-virtual/plugin.${project.language === "typescript" ? "ts" : "js"}`);
    const apiPath = resolve("work/kittycord-studio-virtual/kittycord-api.d.ts");
    const ast = ts.createSourceFile(sourcePath, project.source, ts.ScriptTarget.Latest, true);
    let imports = ast.referencedFiles.length > 0 || ast.typeReferenceDirectives.length > 0 || ast.libReferenceDirectives.length > 0;
    function inspect(node: ts.Node) {
        if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node)
            || ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
            || ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) imports = true;
        ts.forEachChild(node, inspect);
    }
    inspect(ast);
    if (imports) throw new Error("Studio isolated projects cannot import modules or reference external files. Use the reviewed source build workflow.");
    const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext, moduleDetection: ts.ModuleDetectionKind.Legacy, strict: true, allowJs: true, checkJs: true,
        noEmitOnError: true, outDir: resolve("work/kittycord-studio-virtual/output"), types: [], typeRoots: [], lib: ["lib.es2021.d.ts", "lib.webworker.d.ts"] };
    const base = ts.createCompilerHost(options);
    const normalized = (path: string) => base.getCanonicalFileName(resolve(path));
    const sourceKey = normalized(sourcePath);
    const apiKey = normalized(apiPath);
    const apiSource = studioTypeDeclarations(project.tokens, project.api === "utility-v1", project.api === "desktop-v1");
    const libraryRoot = normalized(dirname(ts.getDefaultLibFilePath(options))) + sep;
    const host: ts.CompilerHost = { ...base,
        fileExists: path => normalized(path) === sourceKey || normalized(path) === apiKey || normalized(path).startsWith(libraryRoot) && base.fileExists(path),
        readFile: path => normalized(path) === sourceKey ? project.source : normalized(path) === apiKey ? apiSource : normalized(path).startsWith(libraryRoot) ? base.readFile(path) : undefined,
        getSourceFile(path, languageVersion) { const source = this.readFile(path); return source === undefined ? undefined : ts.createSourceFile(path, source, languageVersion, true); }
    };
    const program = ts.createProgram([sourcePath, apiPath], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program).filter(item => item.category === ts.DiagnosticCategory.Error).map(item => {
        const location = item.file?.getLineAndCharacterOfPosition(item.start ?? 0);
        return { code: item.code, line: (location?.line ?? 0) + 1, column: (location?.character ?? 0) + 1, message: ts.flattenDiagnosticMessageText(item.messageText, " ") };
    });
    if (diagnostics.length) return { diagnostics };
    let emitted = "";
    program.emit(undefined, (path, source) => { if (path.endsWith(".js")) emitted = source; });
    if (!emitted) throw new Error("The compiler produced no JavaScript output.");
    return { bundle: await buildStudioPackage(project, emitted), diagnostics };
}

async function main() {
    const [input, output, ...extra] = process.argv.slice(2);
    if (!input || !output || extra.length) throw new Error("Usage: compileStudio.ts project.json unused-package.json");
    if ((await stat(input)).size > STUDIO_LIMIT) throw new Error("Studio project exceeds 128 KiB.");
    const result = await compileStudioProject(JSON.parse(await readFile(input, "utf8")));
    if (!result.bundle) throw new Error(result.diagnostics.map(item => `${item.line}:${item.column} TS${item.code} ${item.message}`).join("\n"));
    await writeFile(output, JSON.stringify(result.bundle, null, 4) + "\n", { flag: "wx" });
    process.stdout.write("Studio project compiled, validated and packaged without executing its source.\n");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
    main().catch(problem => { process.stderr.write(`${problem instanceof Error ? problem.message : "Studio compilation failed."}\n`); process.exitCode = 1; });
