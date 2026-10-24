export default function idGenerator(): (key: string) => number {
    const ids = new Map<string, number>();
    return (key) => {
        const id = (ids.get(key) ?? -1) + 1;
        ids.set(key, id);
        return id;
    };
}
