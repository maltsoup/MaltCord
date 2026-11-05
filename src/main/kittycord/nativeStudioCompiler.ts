/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { posix } from "node:path";

import { type NativeCompilation, type NativeDiagnostic, nativeProject, nativeStudioModules, newNativeProject } from "@shared/kittycord/nativeStudio";
import type { BuildFailure, Loader } from "esbuild";

export async function importNativeSource(name: string, source: string) {
    const ts = await import("typescript");
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(name) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const assignment = file.statements.find(ts.isExportAssignment);
    const expression = assignment?.expression;
    const object = expression && ts.isCallExpression(expression) ? expression.arguments.find(ts.isObjectLiteralExpression) : expression && ts.isObjectLiteralExpression(expression) ? expression : undefined;
    const field = (key: string) => object?.properties.find(item => ts.isPropertyAssignment(item) && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === key);
    const title = field("name"), version = field("version"), authors = field("authors");
    if (!title || !ts.isPropertyAssignment(title) || !ts.isStringLiteral(title.initializer)) throw new Error("Export definePlugin with a literal name so the source can be reviewed without executing it.");
    const base = newNativeProject("basic");
    return nativeProject({ ...base, metadata: {
        id: `local.import.${title.initializer.text.toLowerCase().replace(/[^a-z\d]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "plugin"}`,
        name: title.initializer.text,
        version: version && ts.isPropertyAssignment(version) && ts.isStringLiteral(version.initializer) ? version.initializer.text : "1.0.0",
        author: authors && ts.isPropertyAssignment(authors) ? authors.initializer.getText(file).slice(0, 160) : "Unverified source author"
    }, entry: name, files: { [name]: source } });
}

export async function compileNativeProject(input: unknown, hostDefines: Record<string, string> = {}): Promise<{ compilation?: NativeCompilation; diagnostics: NativeDiagnostic[]; }> {
    let project: ReturnType<typeof nativeProject>;
    try { project = nativeProject(input); }
    catch (error) { return { diagnostics: [{ stage: "validation", message: error instanceof Error ? error.message : "Project validation failed." }] }; }
    const ts = await import("typescript");
    const entry = ts.createSourceFile(project.entry, project.files[project.entry], ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(project.entry) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const hasDefault = entry.statements.some(statement => ts.isExportAssignment(statement) && !statement.isExportEquals || ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.some(item => item.name.text === "default"));
    if (!hasDefault) return { diagnostics: [{ stage: "validation", file: project.entry, line: 1, column: 1, message: "Export the native plugin with export default definePlugin({...})." }] };
    const { build, version } = await import("esbuild");
    const imports = new Set<string>();
    try {
        const result = await build({ entryPoints: [project.entry], bundle: true, write: false, platform: "browser", format: "cjs", target: "es2022", sourcemap: "inline", sourcesContent: true, sourceRoot: `kittencord-studio://${project.metadata.id}/`,
            jsx: "transform", jsxFactory: "Vencord.Webpack.Common.React.createElement", jsxFragment: "Vencord.Webpack.Common.React.Fragment", logLevel: "silent", metafile: true,
            define: { IS_WEB: "false", IS_DISCORD_DESKTOP: "true", IS_STANDALONE: "false", IS_DEV: "false", IS_REPORTER: "false", IS_VESKTOP: "false", IS_EQUIBOP: "false", IS_EXTENSION: "false", IS_USERSCRIPT: "false", VERSION: JSON.stringify("development"), BUILD_TIMESTAMP: "0", ...hostDefines },
            plugins: [{ name: "native-studio-project", setup(builder) {
                builder.onResolve({ filter: /.*/ }, args => {
                    if (nativeStudioModules.some(name => name === args.path)) { imports.add(args.path); return { path: args.path, external: true }; }
                    if (args.kind !== "entry-point" && !args.path.startsWith(".")) throw new Error(`Unsupported host import: ${args.path}. Use an existing supported alias or a project-relative file.`);
                    const suffix = args.path.endsWith("?managed") ? "?managed" : args.path.endsWith("?raw") ? "?raw" : "";
                    const requested = suffix ? args.path.slice(0, -suffix.length) : args.path;
                    const path = args.kind === "entry-point" ? requested : posix.normalize(posix.join(posix.dirname(args.importer), requested));
                    const resolved = [path, ...[".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"].map(extension => path + extension)].find(name => Object.hasOwn(project.files, name));
                    if (!resolved) throw new Error(`Project import was not found: ${args.path}.`);
                    return { path: resolved, namespace: suffix === "?raw" ? "raw" : resolved.endsWith(".css") ? "managed" : "source" };
                });
                builder.onLoad({ filter: /.*/ }, args => {
                    const source = project.files[args.path];
                    if (args.namespace === "raw") return { contents: source, loader: "text" };
                    if (args.namespace === "managed") {
                        const name = `native-studio:${project.metadata.id}:${args.path}`;
                        return { contents: `(window.VencordStyles ??= new Map()).set(${JSON.stringify(name)},{name:${JSON.stringify(name)},source:${JSON.stringify(source)},classNames:{},enabled:false,compiled:""});export default ${JSON.stringify(name)};`, loader: "js" };
                    }
                    const extension = posix.extname(args.path).slice(1);
                    const loader: Loader = extension === "tsx" || extension === "jsx" || extension === "json" ? extension : extension.endsWith("ts") ? "ts" : "js";
                    return { contents: source, loader };
                });
            } }] });
        const code = result.outputFiles[0]?.text;
        if (!code || !Object.values(result.metafile.inputs).some(file => file.imports.some(item => item.path === "@utils/types"))) throw new Error("The plugin must import definePlugin from @utils/types and export its plugin definition.");
        const digest = createHash("sha256").update(code).digest("hex");
        return { compilation: { project, code, digest, imports: [...imports], diagnostics: [], compilerVersion: version }, diagnostics: [] };
    } catch (error) {
        const failure = error as Partial<BuildFailure>;
        const diagnostics: NativeDiagnostic[] = failure.errors?.map(item => ({ stage: "compilation", message: item.text, file: item.location?.file, line: item.location?.line, column: item.location ? item.location.column + 1 : undefined })) ?? [{ stage: "compilation", message: error instanceof Error ? error.message : "Compilation failed." }];
        return { diagnostics };
    }
}
