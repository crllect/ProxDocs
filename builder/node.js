import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compose as composeWith } from "./index.js";

const partsDir = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"parts"
);

export const readPart = relative =>
	readFile(path.join(partsDir, relative), "utf8");

export const compose = raw => composeWith(raw, { readPart });

export { partsDir };
