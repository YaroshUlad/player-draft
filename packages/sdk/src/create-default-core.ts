import {AdapterRegistry} from '../../core/src/adapter-factory';
import {PlaybackCore} from '../../core/src/playback-core';
import {NativeHtml5AdapterFactory} from '../../engines/native/src/native-html5-adapter';
import {ShakaAdapterFactory} from '../../engines/shaka/src/shaka-adapter';
import {VkPlayerAdapterFactory} from '../../engines/vk/src/vk-player-adapter';

export function createDefaultCore(): PlaybackCore {
	const registry = new AdapterRegistry();
	const nativeFactory = new NativeHtml5AdapterFactory();
	const vkFactory = new VkPlayerAdapterFactory();
	const shakaFactory = new ShakaAdapterFactory();
	for (const format of ['mp4', 'cmaf']) {
		registry.register(format, nativeFactory);
	}
	registry.register('hls', {
		create: (source, capabilities) => capabilities.dashJs
			? shakaFactory.create(source, capabilities)
			: nativeFactory.create(source, capabilities)
	});
	registry.register('dash', {
		create: (source, capabilities) => capabilities.dashJs
			? shakaFactory.create(source, capabilities)
			: capabilities.vkPlayer
				? vkFactory.create(source, capabilities)
				: nativeFactory.create(source, capabilities)
	});
	return new PlaybackCore(registry);
}
