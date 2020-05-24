// Hive Network: Exclusive for Vercel deployment

const HIVE_QUEEN = process.env.HIVE_QUEEN;

function partialDownload(url, payload, start, end, retries = 2) {
	return new Promise((resolve, reject)=>{
		fetch(`${url}/feed`, {
			method: 'POST',
			body: JSON.stringify({
				payload: payload,
				start: start,
				end: end
			}),
			headers: {
				'Content-Type': 'application/json'
			},
		})
		.then(res => {
			if (res.status >= 400) {
				if (retries > 0) {
					return partialDownload(url, payload, start, end, --retries)
					.then(data => {
						resolve(data);
					})
					.catch(err => {
						reject(err);
					});
				}
				return res.text().then(data => reject(data));
			}
			res.arrayBuffer().then(buffer => {
				resolve(new Uint8Array(buffer));
			});
		})
		.catch(err => {
			reject(err);
		});
	});
}

function getList(max) {
	return new Promise((resolve, reject) => {
		fetch(`${HIVE_QUEEN}/workers?max=${max}`)
		.then(res => {
			if (res.status >= 400) return res.text().then(data => reject(data));
			res.json().then(json => {
				resolve(json);
			});
		})
		.catch(err => {
			reject(err);
		})
	});
}

async function fetchSingle(url, length) {
	const MAX = 34;
	length = Number(length);
	let div = Math.trunc(length / MAX);
	let requests = [];
	let reqList = await getList(MAX);
	let i;
	for (i = 0; i < MAX - 1; ++i) {
		requests.push(partialDownload(reqList[i], url, i*div, (i+1)*div-1));
	}
	requests.push(partialDownload(reqList[i], url, i*div, length));
	let final = await Promise.all(requests);
	final = final.flat();
	let arrSize = 0;
	final.forEach(item => {
		arrSize += item.length;
	});
	let merged = new Uint8Array(arrSize);
	let offset = 0;
	final.forEach(item => {
	  merged.set(item, offset);
	  offset += item.length;
	});
	return merged;
}

module.exports.download = fetchSingle;