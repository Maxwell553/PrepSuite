import { AsyncLocalStorage } from 'node:async_hooks';
export const workContext = new AsyncLocalStorage<AbortSignal>();
export function workSignal(timeoutMs:number) {
 const job=workContext.getStore();
 return job?AbortSignal.any([job,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
}
