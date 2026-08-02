self.__uv$config = {
	prefix: "/service/",

	encodeUrl: Ultraviolet.codec.xor.encode,
	decodeUrl: Ultraviolet.codec.xor.decode,

	//#if transportBare
	bare: "/bare/",
	//#endif

	handler: "/uv/uv.handler.js",
	client: "/uv/uv.client.js",
	bundle: "/uv/uv.bundle.js",
	config: "/uv-config.js",
	sw: "/uv/uv.sw.js"
};
