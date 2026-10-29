import type {
	DeviceCapabilities,
	MediaFiles,
	MediaFormat,
	QualityType,
	Source
} from '../../contracts/src/playback';
import {PlayerError} from './errors';

export interface SourcePreferences {
	preferredFormats?: readonly MediaFormat[];
}

const MP4_SOURCES: readonly {key: keyof MediaFiles; quality: QualityType}[] = [
	{key: 'mp42160', quality: '2160p'},
	{key: 'mp41440', quality: '1440p'},
	{key: 'mp41080', quality: '1080p'},
	{key: 'mp4720', quality: '720p'},
	{key: 'mp4480', quality: '480p'},
	{key: 'mp4360', quality: '360p'},
	{key: 'mp4240', quality: '240p'},
	{key: 'mp4144', quality: '144p'}
];

const ADAPTIVE_SOURCES: readonly {
	key: keyof MediaFiles;
	format: MediaFormat;
	variant: string;
	mimeType: string;
}[] = [
	{key: 'hlsStreams', format: 'hls', variant: 'hlsStreams', mimeType: 'application/vnd.apple.mpegurl'},
	{key: 'hlsLivePlayback', format: 'hls', variant: 'hlsLivePlayback', mimeType: 'application/vnd.apple.mpegurl'},
	{key: 'hlsOndemand', format: 'hls', variant: 'hlsOndemand', mimeType: 'application/vnd.apple.mpegurl'},
	{key: 'hlsLive', format: 'hls', variant: 'hlsLive', mimeType: 'application/vnd.apple.mpegurl'},
	{key: 'hls', format: 'hls', variant: 'hls', mimeType: 'application/vnd.apple.mpegurl'},
	{key: 'dashSep', format: 'dash', variant: 'dashSep', mimeType: 'application/dash+xml'},
	{key: 'dashStreams', format: 'dash', variant: 'dashStreams', mimeType: 'application/dash+xml'},
	{key: 'dashOndemand', format: 'dash', variant: 'dashOndemand', mimeType: 'application/dash+xml'},
	{key: 'dashLivePlayback', format: 'dash', variant: 'dashLivePlayback', mimeType: 'application/dash+xml'},
	{key: 'dashUni', format: 'dash', variant: 'dashUni', mimeType: 'application/dash+xml'},
	{key: 'dashWebm', format: 'dash', variant: 'dashWebm', mimeType: 'application/dash+xml'},
	{key: 'cmaf', format: 'cmaf', variant: 'cmaf', mimeType: 'application/mp4'}
];

export class SourcePlanner {
	plan(
		files: MediaFiles,
		capabilities: DeviceCapabilities,
		preferences: SourcePreferences = {}
	): Source[] {
		const sources: Source[] = [];

		for (const definition of ADAPTIVE_SOURCES) {
			const url = files[definition.key];
			if (typeof url !== 'string' || url.length === 0) {
				continue;
			}

			sources.push(this.createSource(url, definition.format, definition.variant, definition.mimeType, files));
		}

		for (const definition of MP4_SOURCES) {
			const url = files[definition.key];
			if (typeof url !== 'string' || url.length === 0) {
				continue;
			}

			const source = this.createSource(url, 'mp4', definition.key, 'video/mp4', files);
			source.quality = definition.quality;
			sources.push(source);
		}

		const formatOrder = preferences.preferredFormats ?? ['hls', 'dash', 'cmaf', 'mp4'];
		return sources
			.filter((source) => this.isSupported(source, capabilities))
			.sort((left, right) => formatOrder.indexOf(left.format) - formatOrder.indexOf(right.format));
	}

	getInitialSource(
		files: MediaFiles,
		capabilities: DeviceCapabilities,
		preferences: SourcePreferences = {}
	): Source {
		const source = this.plan(files, capabilities, preferences)[0];
		if (!source) {
			throw new PlayerError('NO_SUPPORTED_SOURCE', 'No supported media source is available');
		}

		return source;
	}

	private createSource(
		url: string,
		format: MediaFormat,
		variant: string,
		mimeType: string,
		files: MediaFiles
	): Source {
		return {
			url,
			format,
			variant,
			mimeType,
			...(files.failoverHost ? {failoverHost: files.failoverHost} : {})
		};
	}

	private isSupported(source: Source, capabilities: DeviceCapabilities): boolean {
		const nativeMimeSupported = capabilities.native && (
			capabilities.supportedMimeTypes.length === 0 || capabilities.supportedMimeTypes.includes(source.mimeType)
		);

		switch (source.format) {
			case 'hls':
				return nativeMimeSupported || (capabilities.mse && (capabilities.hlsJs || capabilities.dashJs));
			case 'dash':
				return nativeMimeSupported || capabilities.vkPlayer || (capabilities.mse && capabilities.dashJs);
			case 'cmaf':
			case 'mp4':
				return nativeMimeSupported || capabilities.vkPlayer || capabilities.mse;
		}
	}
}
