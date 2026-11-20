import {parentPort,workerData,threadId} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateBytes} from 'gltf-validator';

try {
	const bytes=await readFile(workerData.file),start=performance.now();
	const sha256=createHash('sha256').update(bytes).digest('hex');
	const validation=await validateBytes(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),{maxIssues:0});
	parentPort.postMessage({sha256,issues:validation.issues,validationMs:performance.now()-start,validationThreadId:threadId});
} catch(error) {
	parentPort.postMessage({error:{message:error?.message||String(error),code:error?.code}});
}
