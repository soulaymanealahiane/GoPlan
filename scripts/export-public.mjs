import fs from 'node:fs';
import path from 'node:path';
import {publicFiles,scan} from './audit-public.mjs';
const root=path.resolve(import.meta.dirname,'..'),target=process.argv[2]?path.resolve(process.argv[2]):null;
if(!target||target===root||target.startsWith(root+path.sep))throw Error('Choose a new empty directory outside this repository.');
if(fs.existsSync(target)&&fs.readdirSync(target).length)throw Error('Destination is not empty; nothing was overwritten.');
const files=publicFiles(root),issues=scan(root,files);if(issues.length)throw Error('Potential credentials found. Run audit-public.mjs; values are never printed.');
fs.mkdirSync(target,{recursive:true});for(const file of files){fs.mkdirSync(path.dirname(path.join(target,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(target,file));}
console.log(`Exported ${files.length} reviewed-source candidates to ${target}. No Git history, credentials, runtime data, full catalogue extracts or Android binaries were copied. Inspect before publishing.`);
