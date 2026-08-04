//#if hasWebsockets
//#if !bootstrap
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
//#endif
//#endif

//#if bootstrap
declare module "@mercuryworkshop/proxy-bootstrap" {
	import type { IncomingMessage, ServerResponse } from "node:http";
	import type { Duplex } from "node:stream";

	export function bootstrap(options?: {
		transport?: "libcurl" | "epoxy" | "bare";
		swPath?: string;
		wispPath?: string;
	}): Promise<{
		routeRequest(
			request: IncomingMessage,
			response: ServerResponse
		): boolean;
		routeUpgrade(
			request: IncomingMessage,
			socket: Duplex,
			head: Buffer
		): boolean;
	}>;
}
//#endif

//#if vite
declare module "*?inline" {
	const css: string;
	export default css;
}
//#endif
