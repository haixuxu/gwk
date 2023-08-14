export function stringifyExclude(field: string, key: string, value: any) {
    if (key === field) {
        return undefined;
    }
    return value;
}
