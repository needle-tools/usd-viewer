import {rename,writeFile,unlink} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';

// Readers and virus scanners can briefly hold Windows destination files open.
// Keep replacement atomic and fail normally for persistent or unrelated errors.
export async function retryFileOperation(operation) {
	for(let attempt=0;;attempt++)try{return await operation();}
	catch(error){
		if(attempt===8||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;
		await setTimeout(Math.min(500,25*2**attempt));
	}
}
export const replaceFile=(source,destination)=>retryFileOperation(()=>rename(source,destination));
export async function writeJsonAtomic(file,value) {
	const temporary=file+'.partial',text=JSON.stringify(value,null,2);
	try {
		await retryFileOperation(()=>writeFile(temporary,text));
		await replaceFile(temporary,file);
	} finally {
		await unlink(temporary).catch(error => {if (error.code !== 'ENOENT') throw error;});
	}
}
