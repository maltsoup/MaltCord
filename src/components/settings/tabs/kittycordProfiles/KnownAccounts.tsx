/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Button } from "@components/Button";
import { ProfilesIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { useEffect, UserStore, useState, useStateFromStores } from "@webpack/common";

export function KnownAccounts({ selected, onSelect }: { selected?: string; onSelect(id: string): void; }) {
    const current = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    const [ids, setIds] = useState<string[]>([]), [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        void DataStore.keys().then(keys => { if (active) setIds(keys.flatMap(key => typeof key === "string" && /^kittencord\.account-setup\.v1:\d{17,20}$/.test(key) ? [key.split(":").at(-1) ?? ""] : [])); }, () => { if (active) setError("Saved accounts could not be listed."); });
        return () => { active = false; };
    }, [current]);
    const accounts = useStateFromStores([UserStore], () => [...new Set([...(current ? [current] : []), ...ids])].map(id => ({ id, user: UserStore.getUser(id) })), [current, ids], (a, b) => a.length === b.length && a.every((entry, index) => entry.id === b[index].id && entry.user === b[index].user));
    return <div className="kc-account-list" aria-label="Saved account setups">{accounts.map(({ id, user }) => <Button variant="secondary" key={id} className="kc-account-row" aria-pressed={selected === id} onClick={() => onSelect(id)}>
        {user ? <img src={user.getAvatarURL(undefined, 64, true)} alt="" referrerPolicy="no-referrer" /> : <ProfilesIcon width={32} height={32} />}
        <span><strong>{user?.globalName || user?.username || "Saved account"}</strong><small>{user ? `@${user.username}` : id}</small></span><small>{id === current ? "Current account" : "Saved setup"}</small>
    </Button>)}{selected && selected !== current && <Paragraph>This selects a saved setup. Sign in to that account through Discord before applying it.</Paragraph>}{error && <Paragraph role="alert">{error}</Paragraph>}</div>;
}
