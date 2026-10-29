import type {PlaybackStateInfo, PublicPlayback} from '../../contracts/src/public-api';
import type {QualityType} from '../../contracts/src/playback';
import type {PlaybackCore} from '../../core/src/playback-core';

export class PublicPlaybackImpl implements PublicPlayback {
	private operationCounter = 0;

	constructor(
		private readonly core: PlaybackCore,
		private readonly getCurrentItemId: () => string | undefined,
		private readonly onSkipAdv?: () => Promise<void>,
		private readonly getSubtitlesState?: () => PlaybackStateInfo['subtitles']
	) {}

	async play(): Promise<void> {
		await this.core.play(this.command('play'));
	}

	async pause(): Promise<void> {
		await this.core.pause(this.command('pause'));
	}

	async togglePlayPause(): Promise<void> {
		if (this.core.getSnapshot().state === 'playing') {
			await this.pause();
		} else {
			await this.play();
		}
	}

	async seek(positionMs: number): Promise<void> {
		await this.core.seek(positionMs, this.command('seek'));
	}

	async seekLive(offsetMs: number): Promise<void> {
		await this.core.seekLive(offsetMs, this.command('seekLive'));
	}

	getState() {
		return this.core.getSnapshot().state;
	}

	async setQuality(quality: QualityType, playbackRate?: number): Promise<void> {
		await this.core.setQuality(quality, this.command('setQuality'));
		if (playbackRate !== undefined) {
			await this.setPlaybackRate(playbackRate);
		}
	}

	async setAudioTrack(trackId: string): Promise<void> {
		await this.core.setAudioTrack(trackId, this.command('setAudioTrack'));
	}

	async setPlaybackRate(rate: number): Promise<void> {
		await this.core.setPlaybackRate(rate, this.command('setPlaybackRate'));
	}

	getId(): string | undefined {
		return this.getCurrentItemId();
	}

	getTransitionState(): string {
		return this.core.getSnapshot().state;
	}

	getCurrentQualityType(): QualityType {
		return this.core.getSnapshot().quality.requested;
	}

	getVersion(): string {
		return '0.1.0';
	}

	async skipAdv(): Promise<void> {
		await this.onSkipAdv?.();
	}

	getStateInfo(): PlaybackStateInfo {
		const snapshot = this.core.getSnapshot();
		return {
			playbackSpeed: Number.isNaN(snapshot.playbackRate) ? 1 : snapshot.playbackRate,
			quality: snapshot.quality.current,
			currentTime: snapshot.positionMs,
			subtitles: this.getSubtitlesState?.() ?? {
				current: snapshot.textTracks.find((track) => track.isAuto) ?? null,
				available: snapshot.textTracks
			}
		};
	}

	private command(name: string) {
		return this.core.createCommand(`${name}-${++this.operationCounter}`);
	}
}
