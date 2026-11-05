const kittycordContentApi = typeof browser === "undefined" ? chrome : browser;

document.addEventListener(
    "DOMContentLoaded",
    () => {
        window.postMessage({
            type: "vencord:meta",
            meta: {
                EXTENSION_VERSION: kittycordContentApi.runtime.getManifest().version,
                EXTENSION_BASE_URL: kittycordContentApi.runtime.getURL(""),
                RENDERER_CSS_URL: kittycordContentApi.runtime.getURL("dist/Kittycord.css"),
            }
        }, location.origin);

        kittycordContentApi.runtime.onMessage.addListener(request => {
            const commands = new Set(["TOGGLE_MUTE", "TOGGLE_DEAFEN", "TOGGLE_VOICE_MODE", "TOGGLE_STREAMER_MODE", "TOGGLE_GO_LIVE_STREAMING", "NAVIGATE_BACK", "NAVIGATE_FORWARD", "SAVE_CLIP"]);
            if (commands.has(request?.command)) window.postMessage({ type: "vencord:keybinds", meta: request.command }, location.origin);
        });

        window.addEventListener('message', function(event) {
            if (event.source !== window || event.origin !== location.origin) return;

            if (event.data?.type === 'OPEN_SHORTCUTS') {
                void kittycordContentApi.runtime.sendMessage({ action: "openShortcuts" }).catch(() => console.warn("Kittencord could not open shortcut settings."));
            }
        }, false);
    },
    { once: true }
);
