import type {CoreOpenRequest, DeviceCapabilities, PlaylistItem} from '../../contracts/src';

export const fakeCapabilities: DeviceCapabilities = {
	platform: 'test',
	native: true,
	vkPlayer: false,
	hlsJs: true,
	dashJs: false,
	mse: true,
	supportedMimeTypes: []
};

export const fakePlaylistItem: PlaylistItem = {
	model: {
		rawId: '-1_1',
		type: 'video',
		files: {
			hls: 'https://media.test/video.m3u8',
			mp4720: 'https://media.test/video-720.mp4',
			mp4360: 'https://media.test/video-360.mp4',
			failoverHost: 'https://fallback.test'
		}
	},
	playback: {
		startPosition: 1_000
	}
};

export function createOpenRequest(overrides: Partial<CoreOpenRequest> = {}): CoreOpenRequest {
	return {
		source: {
			url: 'https://media.test/video.mp4',
			format: 'mp4',
			variant: 'mp4720',
			mimeType: 'video/mp4',
			quality: '720p'
		},
		surface: {} as HTMLElement,
		capabilities: fakeCapabilities,
		startPositionMs: 0,
		autoplay: false,
		muted: false,
		operationId: 'open-1',
		playbackKind: 'content',
		...overrides
	};
}
