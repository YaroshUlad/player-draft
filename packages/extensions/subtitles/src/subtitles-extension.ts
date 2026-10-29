import type {PlayerExtension} from '../../../contracts/src/extensions';
import type {CoreEvent, TextTrack} from '../../../contracts/src/playback';
import type {PlaylistItem} from '../../../contracts/src/playlist-item';
import type {PlaybackStateInfo} from '../../../contracts/src/public-api';
import {createHttpTransport} from '../../../infrastructure/http/src/http-transport-factory';
import type {HttpTransport} from '../../../infrastructure/http/src/types';
import type {CustomEventDispatcher} from '../../../sdk/src/custom-event-dispatcher';
import {parseVtt} from './vtt-parser';
import type {SubtitleCue} from './vtt-parser';

export interface SubtitlesExtensionOptions {
	dispatcher: CustomEventDispatcher;
	httpTransport?: HttpTransport;
}

export class SubtitlesExtension implements PlayerExtension {
	readonly name = 'subtitles';
	private tracks: TextTrack[] = [];
	private readonly cues = new Map<string, SubtitleCue[]>();
	private currentTrackId: string | null = null;
	private lastCueKey = '';
	private readonly http: HttpTransport;

	constructor(private readonly options: SubtitlesExtensionOptions) {
		this.http = options.httpTransport ?? createHttpTransport();
	}

	async beforeOpen(item: PlaylistItem): Promise<void> {
		this.tracks = [];
		this.cues.clear();
		this.currentTrackId = null;
		this.lastCueKey = '';
		const subtitles = item.model.subtitles ?? [];
		this.tracks = subtitles.map((track) => ({
			id: track.id,
			name: track.name,
			language: track.language,
			url: track.url,
			isAuto: false
		}));
		const defaultTrack = subtitles.find((track) => track.isDefault) ?? subtitles[0];
		this.currentTrackId = defaultTrack?.id ?? null;
		await Promise.all(subtitles.map((track) => this.loadTrack(track.id, track.url)));
		this.dispatchProperties();
	}

	onEvent(event: CoreEvent): void {
		if (event.playbackKind !== 'content' || event.type !== 'timeUpdate') {
			return;
		}
		this.dispatchCue(event.positionMs);
	}

	setTextTrack(trackId: string | null): void {
		this.currentTrackId = trackId;
		this.lastCueKey = '';
		this.dispatchProperties();
		this.dispatchCue(0);
	}

	getStateInfo(): PlaybackStateInfo['subtitles'] {
		return {
			current: this.tracks.find((track) => track.id === this.currentTrackId) ?? null,
			available: this.tracks
		};
	}

	shutdown(): void {
		this.tracks = [];
		this.cues.clear();
		this.currentTrackId = null;
		this.lastCueKey = '';
	}

	private async loadTrack(trackId: string, url: string): Promise<void> {
		try {
			const response = await this.http.request({
				url,
				method: 'GET',
				headers: {},
				credentials: 'same-origin'
			});
			if (response.status < 200 || response.status >= 300) {
				throw new Error(`Subtitle request returned HTTP ${response.status}`);
			}
			this.cues.set(trackId, parseVtt(response.body));
		} catch (error) {
			this.options.dispatcher.dispatch('player-subtitle-error', {
				trackId,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	private dispatchCue(positionMs: number): void {
		const cues = this.currentTrackId ? this.cues.get(this.currentTrackId) ?? [] : [];
		const cue = cues.find((item) => item.startMs <= positionMs && item.endMs > positionMs);
		const key = cue && this.currentTrackId ? `${this.currentTrackId}:${cue.startMs}:${cue.endMs}:${cue.text}` : '';
		if (key === this.lastCueKey) {
			return;
		}
		this.lastCueKey = key;
		this.options.dispatcher.dispatch('player-subtitle-cue', {
			trackId: cue ? this.currentTrackId : null,
			text: cue?.text ?? '',
			startMs: cue?.startMs ?? null,
			endMs: cue?.endMs ?? null
		});
	}

	private dispatchProperties(): void {
		this.options.dispatcher.dispatch('playback-properties-update', {
			textTracks: this.tracks.map((track) => ({
				id: track.id,
				name: track.name,
				lang: track.language,
				...(track.url ? {url: track.url} : {}),
				isAuto: track.isAuto
			}))
		});
	}
}
