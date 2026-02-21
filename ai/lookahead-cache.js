export function createLookaheadCache(maxEntries = 1200) {
    const store = new Map();

    function touch(key, value) {
        store.delete(key);
        store.set(key, value);
    }

    return {
        get(key) {
            if (!store.has(key)) return null;
            const value = store.get(key);
            touch(key, value);
            return value;
        },
        set(key, value) {
            if (store.has(key)) {
                touch(key, value);
                return;
            }
            if (store.size >= maxEntries) {
                const oldest = store.keys().next().value;
                if (oldest !== undefined) {
                    store.delete(oldest);
                }
            }
            store.set(key, value);
        },
        clear() {
            store.clear();
        }
    };
}
