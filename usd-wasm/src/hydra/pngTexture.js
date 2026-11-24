import {pngSize} from './pngDownsample.js';

const workerLimit = 2;

function createPngWorkerPool(memoryBudget) {
	const workers = new Set();
	const queue = [];
	let activeBytes = 0;
	let disposed = false;

	function finish(slot, error, result) {
		const {task} = slot;
		if (!task) return;
		slot.task = undefined;
		activeBytes -= task.cost;
		if (error) task.reject(error);
		else task.resolve(result);
	}

	function pump() {
		while (!disposed && queue.length) {
			const task = queue[0];
			if (activeBytes && activeBytes + task.cost > memoryBudget) return;
			let slot = [...workers].find(worker => !worker.task);
			if (!slot) {
				if (workers.size >= workerLimit) return;
				try {
					slot = {worker: new Worker(new URL('./pngDownsample.worker.js', import.meta.url), {type: 'module'})};
				} catch (error) {
					queue.shift().reject(error);
					continue;
				}
				workers.add(slot);
				slot.worker.onmessage = ({data}) => {
					finish(slot, data.error && new Error(data.error), data.result);
					pump();
				};
				slot.worker.onerror = event => {
					event.preventDefault();
					workers.delete(slot);
					slot.worker.terminate();
					finish(slot, new Error(event.message || 'PNG texture worker failed'));
					pump();
				};
			}
			queue.shift();
			slot.task = task;
			activeBytes += task.cost;
			try {
				slot.worker.postMessage(task.payload, task.transfer);
			} catch (error) {
				finish(slot, error);
			}
		}
	}

	return {
		run(payload, cost, transfer = []) {
			if (disposed) return Promise.reject(new Error('PNG worker pool disposed'));
			return new Promise((resolve, reject) => {
				queue.push({payload, cost, transfer, resolve, reject});
				pump();
			});
		},
		dispose() {
			disposed = true;
			const error = new Error('PNG worker pool disposed');
			for (const task of queue.splice(0)) task.reject(error);
			for (const slot of workers) {
				slot.worker.terminate();
				finish(slot, error);
			}
			workers.clear();
		},
	};
}

/** Downsample PNG scanlines in parallel without allocating the source bitmaps. */
export function createPngDownsampler() {
	const pool = createPngWorkerPool(96 * 1024 * 1024);
	return {
		decode(bytes, limit) {
			const size = pngSize(bytes);
			if (!size || !Number.isInteger(limit) || limit < 1) return Promise.reject(new Error('Invalid PNG texture or texture limit'));
			const scale = Math.min(1, limit / Math.max(size.width, size.height));
			const pixels = Math.max(1, Math.round(size.width * scale)) * Math.max(1, Math.round(size.height * scale));
			// The scanline buffers, output and Float64 accumulation stay per worker.
			const cost = bytes.byteLength + pixels * 36 + size.width * 16;
			return pool.run({bytes, limit}, cost, [bytes.buffer]);
		},
		dispose: pool.dispose,
	};
}

/** Browser PNG processing for full-resolution glTF normal maps. */
export function createPngNormalEncoder() {
	const pool = createPngWorkerPool(256 * 1024 * 1024);
	return {
		async encode(blob, transform) {
			const size = pngSize(new Uint8Array(await blob.slice(0, 33).arrayBuffer()));
			if (!size) throw new Error('Invalid normal-map PNG');
			// Bitmap, canvas and channel work use separate RGBA buffers.
			const cost = blob.size + size.width * size.height * 12;
			return pool.run({blob, transform}, cost);
		},
		dispose: pool.dispose,
	};
}
