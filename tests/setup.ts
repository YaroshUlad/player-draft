const globalWithWindow = globalThis as typeof globalThis & {window?: unknown};

if (globalWithWindow.window === undefined) {
	Object.defineProperty(globalThis, 'window', {value: globalThis, configurable: true, writable: true});
}

if (typeof self === 'undefined') {
	Object.defineProperty(globalThis, 'self', {value: globalThis, configurable: true, writable: true});
}

if (typeof navigator === 'undefined') {
	Object.defineProperty(globalThis, 'navigator', {
		value: {userAgent: 'Node.js'},
		configurable: true
	});
}
