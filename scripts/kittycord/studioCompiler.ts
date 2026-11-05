/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { parseStudioProject } from "../../src/shared/kittycord/studio";
import { compileStudioProject as compile } from "./compileStudio";

export async function compileStudioProject(input: unknown) {
    const project = parseStudioProject(input);
    const result = await compile(project);
    if (!result.bundle) throw new Error(result.diagnostics.map(item => `${item.line}:${item.column} TS${item.code} ${item.message}`).join("\n"));
    return { project, bundle: result.bundle, diagnostics: result.diagnostics };
}
