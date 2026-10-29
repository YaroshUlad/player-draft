import shaka from 'shaka-player';
import type {DeviceCapabilities} from '../../../contracts/src/playback';
import {isVkPlayerAvailable} from '../../vk/src/vk-player';

const MIME_TYPES = [
	'video/mp4',
	'application/vnd.apple.mpegurl',
	'application/dash+xml',
	'application/mp4'
] as const;

export function detectDeviceCapabilities(): DeviceCapabilities {
	const video = document.createElement('video');
	const supportedMimeTypes = MIME_TYPES.filter((mimeType) => video.canPlayType(mimeType) !== '');
	const userAgent = navigator.userAgent;
	const platform = /Tizen/i.test(userAgent) ? 'tizen'
		: /WebOS|web0S/i.test(userAgent) ? 'webos'
			: /VIDAA/i.test(userAgent) ? 'vidaa'
				: /TVIP/i.test(userAgent) ? 'tvip'
					: 'pc';

	return {
		platform,
		native: true,
		vkPlayer: isVkPlayerAvailable(),
		dashJs: shaka.Player.isBrowserSupported(),
		mse: typeof MediaSource !== 'undefined',
		supportedMimeTypes
	};
}
