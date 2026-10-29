export interface HttpRequest {
	url: string;
	method: 'GET' | 'POST';
	headers: Readonly<Record<string, string>>;
	body?: string;
	timeoutMs?: number;
	credentials: 'omit' | 'same-origin' | 'include';
}

export interface HttpResponse {
	status: number;
	statusText: string;
	body: string;
}

export interface HttpTransport {
	request(request: HttpRequest): Promise<HttpResponse>;
}
