const localHeader = 0x04034b50;
const centralHeader = 0x02014b50;
const endOfCentral = 0x06054b50;

const encoder = new TextEncoder();

const crcTable = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let bit = 0; bit < 8; bit++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c >>> 0;
	}
	return table;
})();

const crc32 = bytes => {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
};

const block = size => {
	const bytes = new Uint8Array(size);
	const view = new DataView(bytes.buffer);
	return {
		bytes,
		u16: (offset, value) => view.setUint16(offset, value, true),
		u32: (offset, value) => view.setUint32(offset, value, true)
	};
};

const toBytes = value =>
	typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);

export const zip = files => {
	const entries = [];
	const chunks = [];
	let offset = 0;

	for (const [name, contents] of Object.entries(files)) {
		const nameBytes = encoder.encode(name);
		const data = toBytes(contents);
		const checksum = crc32(data);

		const local = block(30);
		local.u32(0, localHeader);
		local.u16(4, 20);
		local.u16(6, 0x0800);
		local.u16(8, 0);
		local.u16(10, 0);
		local.u16(12, 0x21);
		local.u32(14, checksum);
		local.u32(18, data.length);
		local.u32(22, data.length);
		local.u16(26, nameBytes.length);
		local.u16(28, 0);

		chunks.push(local.bytes, nameBytes, data);
		entries.push({ nameBytes, checksum, size: data.length, offset });
		offset += local.bytes.length + nameBytes.length + data.length;
	}

	const centralStart = offset;

	for (const entry of entries) {
		const central = block(46);
		central.u32(0, centralHeader);
		central.u16(4, 20);
		central.u16(6, 20);
		central.u16(8, 0x0800);
		central.u16(10, 0);
		central.u16(12, 0);
		central.u16(14, 0x21);
		central.u32(16, entry.checksum);
		central.u32(20, entry.size);
		central.u32(24, entry.size);
		central.u16(28, entry.nameBytes.length);
		central.u16(30, 0);
		central.u16(32, 0);
		central.u16(34, 0);
		central.u16(36, 0);
		central.u32(38, (0o100644 << 16) >>> 0);
		central.u32(42, entry.offset);

		chunks.push(central.bytes, entry.nameBytes);
		offset += central.bytes.length + entry.nameBytes.length;
	}

	const end = block(22);
	end.u32(0, endOfCentral);
	end.u16(4, 0);
	end.u16(6, 0);
	end.u16(8, entries.length);
	end.u16(10, entries.length);
	end.u32(12, offset - centralStart);
	end.u32(16, centralStart);
	end.u16(20, 0);

	chunks.push(end.bytes);

	const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const archive = new Uint8Array(total);
	let cursor = 0;
	for (const chunk of chunks) {
		archive.set(chunk, cursor);
		cursor += chunk.length;
	}
	return archive;
};
