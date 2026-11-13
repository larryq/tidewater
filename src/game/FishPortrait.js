// Temporary compatibility surface for the Three/TSL migration.
//
// The native version renders fish into its own raw-WebGPU studio target. The HUD already degrades
// gracefully when attach() returns false, so keep the public API in place while that renderer is
// ported properly instead of blocking the playable fishing loop.
export class FishPortrait {

	attach( canvas ) {

		this.canvas = canvas;
		return false;

	}

	show() {}

	detach() {

		this.canvas = null;

	}

	update() {}

	thumbnail() {

		return Promise.resolve( null );

	}

}
