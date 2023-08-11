export function createDeferred() {
    let resolveFn, rejectFn;

    const promise = new Promise((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
    });

    return {
        promise,
        resolve: resolveFn,
        reject: rejectFn,
    };
}
