import type {IPlayerLib} from '../../packages/contracts/src/public-api';

declare const player: IPlayerLib;

// @ts-expect-error UI config is intentionally not part of the new SDK.
player.updateUiConfig({});
// @ts-expect-error Keyboard and focus handling belong to the host.
player.processKey(1);
// @ts-expect-error External notifications use CustomEvent only.
player.onMessage(() => undefined);
// @ts-expect-error There is no UI to activate.
player.activateUi();
// @ts-expect-error There is no button state in the headless SDK.
player.updateButtonStatus('play');
