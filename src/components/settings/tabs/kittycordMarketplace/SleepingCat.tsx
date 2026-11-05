/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./sleepingCat.css";

export function SleepingCat() {
    return <div className="kc-market-empty" role="img" aria-label="No matching visual customizations">
        <svg viewBox="0 0 240 160" aria-hidden="true" focusable="false">
            <ellipse className="kc-sleeping-cat-shadow" cx="122" cy="131" rx="82" ry="8" />
            <g className="kc-sleeping-cat-body">
                <path className="kc-sleeping-cat-fur" d="M73 119c-19-38 9-72 50-72 42 0 71 32 66 66-4 23-37 23-61 21Z" />
                <path className="kc-sleeping-cat-tail" d="M176 116c30 3 33-28 19-32-15-5-13 17-25 15" />
                <path className="kc-sleeping-cat-face" d="m49 91 1-31 24 15c12-3 25-1 34 5l27-10-7 32c6 24-7 34-37 34-32 0-51-14-42-45Z" />
                <path className="kc-sleeping-cat-lines" d="M62 106q6 6 12 0m26 1q6 6 12 0m-28 9q5 6 10 0M42 111l13 3m-12 7 13-2m68-4 13-2m-13 7 12 3" />
                <path className="kc-sleeping-cat-nose" d="m84 109 11 1-6 5Z" />
                <path className="kc-sleeping-cat-paw" d="M97 130q13-10 30 0" />
            </g>
            <circle className="kc-sleeping-cat-dot" cx="157" cy="35" r="3" />
            <circle className="kc-sleeping-cat-dot" cx="174" cy="20" r="2" />
        </svg>
    </div>;
}
