import type {HttpRequest, HttpResponse, HttpTransport} from './types';

export class XhrHttpTransport implements HttpTransport {
	constructor(private readonly createXhr: () => XMLHttpRequest) {}

	request(request: HttpRequest): Promise<HttpResponse> {
		return new Promise<HttpResponse>((resolve, reject) => {
			const xhr = this.createXhr();
			xhr.open(request.method, request.url, true);
			xhr.withCredentials = request.credentials === 'include';
			if (request.timeoutMs) {
				xhr.timeout = request.timeoutMs;
			}
			for (const [name, value] of Object.entries(request.headers)) {
				xhr.setRequestHeader(name, value);
			}
			xhr.onload = () => {
				resolve({
					status: xhr.status,
					statusText: xhr.statusText,
					body: xhr.responseText
				});
			};
			xhr.onerror = () => reject(new Error(`XHR network error for ${request.url}`));
			xhr.ontimeout = () => reject(new Error(`XHR timeout for ${request.url}`));
			xhr.onabort = () => reject(new Error(`XHR aborted for ${request.url}`));
			xhr.send(request.body ?? null);
		});
	}
}
