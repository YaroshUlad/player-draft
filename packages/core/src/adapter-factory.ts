import type {
	AdapterFactory,
	DeviceCapabilities,
	PlaybackAdapter,
	Source
} from '../../contracts/src/playback';
import {PlayerError} from './errors';

export class AdapterRegistry implements AdapterFactory {
	private readonly factories = new Map<string, AdapterFactory>();

	register(format: string, factory: AdapterFactory): void {
		this.factories.set(format, factory);
	}

	create(source: Source, capabilities: DeviceCapabilities): PlaybackAdapter {
		const factory = this.factories.get(source.format);
		if (!factory) {
			throw new PlayerError('NO_ADAPTER', `No playback adapter is registered for ${source.format}`);
		}

		return factory.create(source, capabilities);
	}
}
