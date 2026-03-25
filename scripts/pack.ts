import AdmZip from "adm-zip";
import { $ } from "bun";
import manifest from "../public/manifest.json";

import "./cwd";

await $`mkdir -p ./release`;
await $`bun run ./scripts/build.ts`;

const packName = manifest.name.toLowerCase().replace(/[\s\W]+/g, "-");

const { version } = manifest;

const folderToCompress = "./build";
const outputArchive = `./release/${packName}-v${version}.zip`;

const zip = new AdmZip();

zip.addLocalFolder(folderToCompress);

zip.writeZip(outputArchive);

console.log(`Folder compressed into ${outputArchive}`);
