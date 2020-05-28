// Hive Network: Exclusive for Vercel deployment

const HIVE_QUEEN = process.env.HIVE_QUEEN;

function feed(url, body, retries = 2) {
	return new Promise((resolve, reject)=>{
		fetch(`${url}/feed`, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: {
				'Content-Type': 'application/json'
			},
		})
		.then(res => {
			if (res.status >= 400) {
				if (retries > 0) {
					return feed(url, body, --retries)
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

async function download(url, length, segments) {
	const MAX = 34;
	let requests = [];
	let reqList = await getList(segments ? segments.length : MAX);
	if (segments) {
		let index = 0;
		segments.forEach(segment => {
			requests.push(feed(reqList[index++], {
				payload: url,
				segment: segment
			}));
		});
	} else {
		length = Number(length);
		let div = Math.trunc(length / MAX);		
		let i;
		for (i = 0; i < MAX - 1; ++i) {
			requests.push(feed(reqList[i], {
				payload: url,
				start: i*div,
				end: (i+1)*div-1
			}));
		}
		requests.push(feed(reqList[i], {
			payload: url,
			start: i*div,
			end: length
		}));
	}
	let final = await Promise.all(requests);
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

module.exports.download = download;