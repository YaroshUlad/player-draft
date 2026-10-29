import type {PlayerExtension} from '../../contracts/src/extensions';
import type {CoreEvent, PlaybackState} from '../../contracts/src/playback';
import type {CustomEventDispatcher} from './custom-event-dispatcher';

const LOAD_STATES: readonly PlaybackState[] = ['loading', 'waiting', 'seeking'];

export class CustomEventBridge implements PlayerExtension {
	readonly name = 'custom-event-bridge';
	private wasLoading = false;

	constructor(private readonly dispatcher: CustomEventDispatcher) {}

	onEvent(event: CoreEvent): void {
		const dispatcher = this.dispatcher;
		const isLoading = LOAD_STATES.includes(event.snapshot.state);
		if (isLoading && !this.wasLoading) {
			dispatcher.dispatch('player-buffering-started');
		} else if (!isLoading && this.wasLoading) {
			dispatcher.dispatch('player-buffering-ended');
		}
		this.wasLoading = isLoading;

		switch (event.type) {
			case 'playing':
				dispatcher.dispatch('player-playing');
				break;
			case 'paused':
				dispatcher.dispatch('player-paused', {pausedPosition: event.positionMs});
				break;
			case 'timeUpdate':
				dispatcher.dispatch('player-time-update', {time: event.positionMs});
				break;
			case 'firstFrame':
				dispatcher.dispatch('player-first-frame');
				break;
			case 'ended':
				dispatcher.dispatch('event-video-ended');
				break;
			case 'qualityChange':
				if (event.snapshot.quality.current) {
					dispatcher.dispatch('player-quality-changed', {quality: event.snapshot.quality.current});
				}
				break;
			case 'tracksChange': {
				const currentAudioTrackIndex = event.snapshot.audioTracks.findIndex((track) => track.isDefault);
				dispatcher.dispatch('playback-properties-update', {
					audioTracks: event.snapshot.audioTracks.map((track) => ({
						name: track.name,
						description: track.language,
						value: track.id
					})),
					currentAudioTrackIndex: currentAudioTrackIndex >= 0 ? currentAudioTrackIndex : null,
					textTracks: event.snapshot.textTracks.map((track) => ({
						id: track.id,
						name: track.name,
						lang: track.language,
						...(track.url ? {url: track.url} : {}),
						isAuto: track.isAuto
					}))
				});
				break;
			}
			default:
				break;
		}
	}
}
