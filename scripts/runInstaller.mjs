/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2).filter(value => value !== "--");
if (!args.length) throw new Error("Kittencord installer requires an explicit action and Discord directory. No binary was downloaded or executed.");
if (process.platform !== "win32") throw new Error("The independent Kittencord installer currently supports Windows only.");
const executable = fileURLToPath(new URL("../dist/installer/KittencordSetup.exe", import.meta.url));
const receipt = JSON.parse(readFileSync(fileURLToPath(new URL("../dist/installer/receipt.json", import.meta.url)), "utf8"));
if (createHash("sha256").update(readFileSync(executable)).digest("hex") !== receipt.installerSha256) throw new Error("Local installer integrity check failed. Rebuild the installer before continuing.");
execFileSync(executable, args, { stdio: "inherit", windowsHide: true });
