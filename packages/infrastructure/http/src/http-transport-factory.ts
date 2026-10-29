import {FetchHttpTransport} from './fetch-transport';
import type {HttpTransport} from './types';
import {XhrHttpTransport} from './xhr-transport';

export interface HttpTransportFactoryOptions {
	fetch?: typeof fetch | undefined;
	createXhr?: () => XMLHttpRequest;
}

export function createHttpTransport(options: HttpTransportFactoryOptions = {}): HttpTransport {
	const fetchImpl = 'fetch' in options ? options.fetch : (typeof globalThis.fetch === 'function'
		? globalThis.fetch.bind(globalThis)
		: undefined);
	if (fetchImpl) {
		return new FetchHttpTransport(fetchImpl);
	}
	const createXhr = options.createXhr ?? (() => {
		if (typeof XMLHttpRequest === 'undefined') {
			throw new Error('Neither fetch nor XMLHttpRequest is available');
		}
		return new XMLHttpRequest();
	});
	return new XhrHttpTransport(createXhr);
}
