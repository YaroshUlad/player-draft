declare module 'shaka-player' {
	namespace shaka {
		namespace extern {
			interface Track {
				id: number;
				type: string;
				active: boolean;
				height?: number;
				bandwidth?: number;
				language?: string;
				label?: string;
				audioId?: number;
			}
		}

		class Player {
			static isBrowserSupported(): boolean;
			configure(config: unknown): void;
			configure(path: string, value: unknown): void;
			attach(video: HTMLVideoElement): Promise<unknown>;
			load(uri: string, startTime?: number | null): Promise<unknown>;
			unload(initializeMediaSource?: boolean): Promise<unknown>;
			destroy(): Promise<unknown>;
			addEventListener(type: string, listener: (event: unknown) => void): void;
			getVariantTracks(): extern.Track[];
			getTextTracks(): extern.Track[];
			selectVariantTrack(track: extern.Track, clearBuffer?: boolean, safeMargin?: number): void;
			selectAudioLanguage(language: string): void;
			selectTextTrack(track: extern.Track): void;
			setTextTrackVisibility(visible: boolean): void;
		}

		namespace polyfill {
			function installAll(): void;
		}

		namespace util {
			class Error {
				static Severity: {CRITICAL: number};
			}
		}
	}

	export = shaka;
}
