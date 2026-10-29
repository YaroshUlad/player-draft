import {afterEach, describe, expect, it, vi} from 'vitest';
import {detectDeviceCapabilities} from '../../packages/engines/native/src/detect-capabilities';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('detectDeviceCapabilities', () => {
	it('detects platform, native MIME support and MSE', () => {
		vi.stubGlobal('navigator', {userAgent: 'Mozilla/5.0 Tizen 6.5'});
		vi.stubGlobal('MediaSource', class {});
		vi.stubGlobal('document', {
			createElement: () => ({
				canPlayType: (mimeType: string) => mimeType === 'video/mp4' ? 'probably' : ''
			}),
			getElementsByTagName: () => []
		});

		expect(detectDeviceCapabilities()).toMatchObject({
			platform: 'tizen',
			native: true,
			mse: true,
			supportedMimeTypes: ['video/mp4']
		});
	});
});
