declare module "@mercuryworkshop/wisp-js/server" {
	import type { IncomingMessage } from "node:http";
	import type { Duplex } from "node:stream";

	export const server: {
		routeRequest(
			request: IncomingMessage,
			socket: Duplex,
			head: Buffer
		): void;
		options: Record<string, unknown>;
	};
}

declare module "*?inline" {
	const css: string;
	export default css;
}
