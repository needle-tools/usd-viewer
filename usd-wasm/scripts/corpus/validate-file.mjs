import {Worker} from 'node:worker_threads';

// Keep validation CPU and its large input buffers outside the asset server.
export function validateGltfFile(file) {
	return new Promise((resolve,reject) => {
		const worker=new Worker(new URL('./validate-file-worker.mjs',import.meta.url),{workerData:{file}});
		let settled=false;
		worker.once('message',async message=>{
			settled=true;
			try {
				await worker.terminate();
				if(message.error)reject(Object.assign(new Error(message.error.message),{code:message.error.code}));
				else resolve(message);
			} catch(error) {reject(error);}
		});
		worker.once('error',error=>{settled=true;reject(error);});
		worker.once('exit',code=>{if(!settled)reject(new Error(`glTF validation worker exited before returning a result (${code}).`));});
	});
}
