import { crc32 } from "node:zlib";

const localHeader = 0x04034b50;
const centralHeader = 0x02014b50;
const endOfCentral = 0x06054b50;

export const zip = files => {
	const entries = [];
	const chunks = [];
	let offset = 0;

	for (const [name, contents] of Object.entries(files)) {
		const nameBytes = Buffer.from(name, "utf8");
		const data = Buffer.isBuffer(contents)
			? contents
			: Buffer.from(contents, "utf8");
		const checksum = crc32(data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(localHeader, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6);
		local.writeUInt16LE(0, 8);
		local.writeUInt16LE(0, 10);
		local.writeUInt16LE(0x21, 12);
		local.writeUInt32LE(checksum, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBytes.length, 26);
		local.writeUInt16LE(0, 28);

		chunks.push(local, nameBytes, data);
		entries.push({ nameBytes, checksum, size: data.length, offset });
		offset += local.length + nameBytes.length + data.length;
	}

	const centralStart = offset;

	for (const entry of entries) {
		const central = Buffer.alloc(46);
		central.writeUInt32LE(centralHeader, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(0, 10);
		central.writeUInt16LE(0, 12);
		central.writeUInt16LE(0x21, 14);
		central.writeUInt32LE(entry.checksum, 16);
		central.writeUInt32LE(entry.size, 20);
		central.writeUInt32LE(entry.size, 24);
		central.writeUInt16LE(entry.nameBytes.length, 28);
		central.writeUInt16LE(0, 30);
		central.writeUInt16LE(0, 32);
		central.writeUInt16LE(0, 34);
		central.writeUInt16LE(0, 36);
		central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
		central.writeUInt32LE(entry.offset, 42);

		chunks.push(central, entry.nameBytes);
		offset += central.length + entry.nameBytes.length;
	}

	const end = Buffer.alloc(22);
	end.writeUInt32LE(endOfCentral, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(offset - centralStart, 12);
	end.writeUInt32LE(centralStart, 16);
	end.writeUInt16LE(0, 20);

	chunks.push(end);

	return Buffer.concat(chunks);
};
