export class PlayerError extends Error {
	readonly code: string;
	readonly fatal: boolean;
	readonly cause?: unknown;

	constructor(code: string, message: string, fatal = true, cause?: unknown) {
		super(message);
		this.name = 'PlayerError';
		this.code = code;
		this.fatal = fatal;
		if (cause !== undefined) {
			this.cause = cause;
		}
	}
}

export function toPlayerError(error: unknown, code = 'PLAYBACK_ERROR'): PlayerError {
	if (error instanceof PlayerError) {
		return error;
	}

	const message = error instanceof Error ? error.message : String(error);
	return new PlayerError(code, message, true, error);
}
