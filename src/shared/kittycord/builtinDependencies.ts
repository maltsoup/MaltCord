/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface BuiltinDependencyPlugin {
    name: string;
    dependencies?: readonly string[];
}

export interface BuiltinDependencyProblem {
    kind: "missing" | "circular";
    dependency: string;
    chain: string[];
    message: string;
}

export function planBuiltinDependencies<T extends BuiltinDependencyPlugin>(root: T, lookup: (name: string) => T | undefined, unavailable: (name: string) => string | undefined = () => undefined) {
    const order: T[] = [];
    const complete = new Set<T>();
    const visiting = new Set<T>();
    const chain: string[] = [];
    let problem: BuiltinDependencyProblem | undefined;
    function visit(plugin: T): boolean {
        if (visiting.has(plugin)) {
            const path = [...chain, plugin.name];
            problem = { kind: "circular", dependency: plugin.name, chain: path, message: `Circular dependency: ${path.join(" → ")}. Disable this plugin until its dependencies are corrected.` };
            return false;
        }
        if (complete.has(plugin)) return true;
        visiting.add(plugin);
        chain.push(plugin.name);
        for (const name of plugin.dependencies ?? []) {
            const dependency = lookup(name);
            if (!dependency || typeof dependency !== "object" || typeof dependency.name !== "string") {
                const path = [...chain, name];
                const reason = unavailable(name) ?? "This dependency is not included in the current build.";
                problem = { kind: "missing", dependency: name, chain: path, message: `Unavailable dependency: ${path.join(" → ")}. ${reason}` };
                return false;
            }
            if (!visit(dependency)) return false;
        }
        chain.pop();
        visiting.delete(plugin);
        complete.add(plugin);
        if (plugin !== root) order.push(plugin);
        return true;
    }
    visit(root);
    return { order: problem ? [] : order, problem };
}
