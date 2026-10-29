import type {HttpRequest, HttpResponse, HttpTransport} from './types';

export class FetchHttpTransport implements HttpTransport {
	constructor(private readonly fetchImpl: typeof fetch) {}

	async request(request: HttpRequest): Promise<HttpResponse> {
		const controller = typeof AbortController === 'undefined' ? null : new AbortController();
		const timeout = request.timeoutMs && controller
			? setTimeout(() => controller.abort(), request.timeoutMs)
			: null;
		const clearTimer = (): void => {
			if (timeout !== null) {
				clearTimeout(timeout);
			}
		};
		const send = async (): Promise<HttpResponse> => {
			const response = await this.fetchImpl(request.url, {
				method: request.method,
				headers: request.headers,
				...(request.body !== undefined ? {body: request.body} : {}),
				credentials: request.credentials,
				...(controller ? {signal: controller.signal} : {})
			});
			return {
				status: response.status,
				statusText: response.statusText,
				body: await response.text()
			};
		};
		return send().then((response) => {
			clearTimer();
			return response;
		}, (error: unknown) => {
			clearTimer();
			throw error;
		});
	}
}
