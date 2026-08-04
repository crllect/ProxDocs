const namespace = "serverless";
const version = 1;
const key = (name) => `${namespace}:${name}`;
export const read = (name, fallback) => {
    try {
        const raw = localStorage.getItem(key(name));
        if (raw === null)
            return fallback;
        const parsed = JSON.parse(raw);
        if (parsed?.__v !== version) {
            return migrate(name, parsed, fallback);
        }
        return parsed.value;
    }
    catch {
        return fallback;
    }
};
export const write = (name, value) => {
    try {
        const envelope = { __v: version, value };
        localStorage.setItem(key(name), JSON.stringify(envelope));
        return true;
    }
    catch {
        return false;
    }
};
export const remove = (name) => {
    try {
        localStorage.removeItem(key(name));
    }
    catch { }
};
export const clearAll = () => {
    try {
        const prefix = `${namespace}:`;
        const names = [];
        for (let i = 0; i < localStorage.length; i++) {
            const name = localStorage.key(i);
            if (name?.startsWith(prefix))
                names.push(name);
        }
        for (const name of names)
            localStorage.removeItem(name);
    }
    catch { }
};
const migrate = (name, parsed, fallback) => {
    if (parsed && typeof parsed === "object" && !("__v" in parsed)) {
        write(name, parsed);
        return parsed;
    }
    return fallback;
};
