export interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
}

export const createDeferred = <T>(): Deferred<T> => {
	let resolve!: Deferred<T>["resolve"];
	let reject!: Deferred<T>["reject"];

	const promise = new Promise<T>((innerResolve, innerReject) => {
		resolve = innerResolve;
		reject = innerReject;
	});

	return { promise, resolve, reject };
};

export const waitFor = (duration = 1000) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, duration);
	});
