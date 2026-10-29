import type {DeviceCapabilities, Source} from '../../contracts/src/playback';
import {detectDeviceCapabilities} from '../../engines/native/src/detect-capabilities';
import type {PlaybackCore} from '../../core/src/playback-core';

export interface PreviewRequest {
	wrapper: HTMLElement;
	loop: boolean;
	trailer: string;
	timelineThumbs: string[];
	onPreviewEnded?: () => void;
}

export class PreviewService {
	private source: Source | null = null;
	private wrapper: HTMLElement | null = null;
	private loop = false;
	private onEnded: (() => void) | null = null;
	private operationCounter = 0;

	constructor(
		private readonly core: PlaybackCore,
		private readonly getCapabilities: () => DeviceCapabilities = detectDeviceCapabilities
	) {
		core.subscribe((event) => {
			if (event.type === 'ended') {
				this.handleEnded();
			}
		});
	}

	async play(request: PreviewRequest): Promise<void> {
		await this.stop();
		if (!request.trailer) {
			throw new Error('Preview trailer is required; thumbnail-only preview is not implemented');
		}
		this.source = {
			url: request.trailer,
			format: 'mp4',
			variant: 'preview',
			mimeType: 'video/mp4'
		};
		this.wrapper = request.wrapper;
		this.loop = request.loop;
		this.onEnded = request.onPreviewEnded ?? null;
		await this.core.open({
			source: this.source,
			surface: this.wrapper,
			capabilities: this.getCapabilities(),
			startPositionMs: 0,
			autoplay: true,
			muted: true,
			operationId: `preview-${++this.operationCounter}`,
			playbackKind: 'content'
		});
	}

	async stop(): Promise<void> {
		this.source = null;
		this.wrapper = null;
		this.loop = false;
		this.onEnded = null;
		await this.core.destroy();
	}

	private handleEnded(): void {
		if (this.source && this.wrapper && this.loop) {
			void this.core.open({
				source: this.source,
				surface: this.wrapper,
				capabilities: this.getCapabilities(),
				startPositionMs: 0,
				autoplay: true,
				muted: true,
				operationId: `preview-${++this.operationCounter}`,
				playbackKind: 'content'
			});
			return;
		}
		const callback = this.onEnded;
		this.source = null;
		this.wrapper = null;
		this.onEnded = null;
		callback?.();
	}
}
