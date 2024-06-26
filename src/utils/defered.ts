
export interface Deferred<T> extends Promise<T> {
    resolve(value?: T | PromiseLike<T>): void;
    // deno-lint-ignore no-explicit-any
    reject(reason?: any): void;
  }

export function deferred<T>(): Deferred<T> {
    let methods;
    const promise = new Promise<T>((resolve, reject): void => {
      methods = { resolve, reject };
    });
    return Object.assign(promise, methods) as Deferred<T>;
  }