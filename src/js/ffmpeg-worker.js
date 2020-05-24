const ffmpeg = {
	webm: require('./ffmpeg/ffmpeg-webm'),
	mp4: require('./ffmpeg/ffmpeg-mp4')
}

const hive = require('./lib/hive');

const AUDIO = {
	'webm': 'weba',
	'mp4': 'm4a',
	'mpeg': 'mp3'
}

let XSRF;

function errorMsg(error) {
	postMessage({
		type: 'error',
		error
	})
}
function postItem(key, value) {
	postMessage({
		type: 'item',
		item: key,
		value: value
	});
}
onmessage = e => {
	let data = e.data;
	postItem('text', 'Fetching Video...');
	switch (data.type) {
		case 'audio':
			XSRF = data.XSRF;
			downloadAudio(data.settings, data.link).catch(e => {
				errorMsg(e);
			});
			break;
		case 'video':
			XSRF = data.XSRF;
			downloadVideo(data.settings, data.link).catch(e => {
				errorMsg(e);
			});
			break;
		case 'default':
			console.log('Nothing');
			break;
	}
}

function request(uri, body) {
	return new Promise((resolve, reject) => {
		fetch(uri, {
			method: 'POST',
			referrerPolicy: 'origin',
			body: JSON.stringify(body),
			headers: {
				'CSRF-TOKEN': XSRF,
				'Content-Type': 'application/json'
			},
			credentials: 'same-origin'
		}).then(res => resolve(res))
		.catch(err => reject(err));
	});
}

function getMeta(type, link, settings) {
	return new Promise(async (resolve, reject) => {
		let meta = Object.assign({type, link}, settings);
		let res = await request(`/meta`, meta);
		res.clone().json().then(json => {
			Object.assign(meta, json)			
			if (meta.error) return reject(meta);
			Object.defineProperty(meta, 'download', {
				value: async function(type) {
					if (!type) throw {error: 'Invalid type.'}
					let res;
					if (process.env.HIVE_QUEEN) {
						res = await hive.download(this[type], this[type + 'Length']);
					} else {
						res = await request(`/download`, {type, metadata: this[type]});
						if (res.status >= 400) throw await res.json();
						res = await res.arrayBuffer();
					}
					return res;
				}
			});
			resolve(meta);
		});
	});
}

function FFmpeg(type, args, files) {
	let output = '';
	console.info('ffmpeg ' + args.join(' '));
	let data = ffmpeg[type]({
		arguments: args,
		MEMFS: files,
		print: data => output += (data + '\n'),
		printErr: data => output += (data + '\n'),
		onExit: code => {
			if (code) {
				console.error(output);
				throw new Error('FFmpeg Error!');
			}
		}
	});
	return data.MEMFS[0].data;
}

function convert(type, inputFormat, file, outputFormat, audioQuality) {
	if (inputFormat === outputFormat) return file;
	let args = [`-i`, `input.${inputFormat}`, type === 'audio' ? '-vn' : '-an'];
	if (audioQuality) args = args.concat(['-b:a', `${audioQuality}k`]);
	args.push(`out.${outputFormat}`);
	return FFmpeg(outputFormat,
		args,
		[{
			data: file,
			name: `input.${inputFormat}`
		}]
	);
}

function addMeta(outputFormat, title, files) {
	return FFmpeg(outputFormat,
		files
		.flatMap(item => [`-i`, item.name])
		.concat([
			'-metadata', `title=${title}`,
			'-c:v', 'copy',
			'-c:a', 'copy',
			`out.${outputFormat}`
		]),
		files
	);
}

function convertMp3(inputFormat, audio, bitrate) {
	return FFmpeg('mp4',
		[
			'-i', `temp.${inputFormat}`,
			'-vn',
			'-sn',
			'-b:a', `${bitrate}k`,
			'out.mp3'
		],
		[{
			data: audio,
			name: `temp.${inputFormat}`
		}]
	);
}

function trimArray(array) {
	let i = array.length - 1;
	while(array[i] === 0) {
		i--;
	}
	return array.slice(0, i + 1);
}

async function downloadAudio(settings, link) {
	const mp3 = settings.audioFormat === 'mp3';
	if (mp3) {
		settings.audioFormat = 'webm';
	}
	let original = Object.assign({}, {
		audioQuality: settings.audioQuality,
		audioFormat: settings.audioFormat,
		convert: settings.convert
	});
	let metadata = await getMeta('audio', link, original);
	postItem('text', metadata.title);
	postItem('state', 'download');
	let aud = await metadata.download('audio');
	if (original.convert) {
		postItem('state', 'convert');
		if (!mp3) {
			aud = convert('audio', metadata.audioFormat, aud, original.audioFormat, metadata.audioQuality);
		} else {
			aud = convertMp3(AUDIO[original.audioFormat], aud, metadata.audioQuality);
			aud = trimArray(aud);
			original.audioFormat = 'mpeg';
		}
	}
	postItem('state', 'ffmpeg');
	aud = trimArray(addMeta(mp3 ? 'mp4' : original.audioFormat, metadata.title, [{
			data: aud,
			name: `temp.${AUDIO[original.audioFormat]}`
		}
	]));
	postMessage({
		type: 'complete',
		blob: new Blob([aud], {type: `audio/${original.audioFormat}`}),
		filename: `${metadata.title}.${AUDIO[original.audioFormat]}`
	})
}

async function downloadVideo(settings, link) {
	let original = Object.assign({}, {
		videoQuality: settings.videoQuality,
		audioQuality: settings.audioQuality,
		videoFormat: settings.videoFormat,
		audioFormat: settings.videoFormat,
		convert: settings.convert
	});
	let metadata = await getMeta('video', link, original);
	postItem('text', metadata.title);	
	postItem('state', 'download');
	let vid = await metadata.download('video');
	let aud = await metadata.download('audio');
	if (original.convert) {
		postItem('state', 'convert');
		vid = convert('video', metadata.videoFormat, vid, original.videoFormat);
		aud = convert('audio', metadata.audioFormat, aud, original.audioFormat, metadata.audioQuality);
	}
	postItem('state', 'ffmpeg');
	let merged = addMeta(original.videoFormat, metadata.title,
		[
			{
				data: vid,
				name: `temp.${original.videoFormat}`
			},
			{
				data: aud,
				name: `temp.${AUDIO[original.audioFormat]}`
			}
		]);
	postMessage({
		type: 'complete',
		blob: new Blob([merged], {type: `video/${original.videoFormat}`}),
		filename: `${metadata.title}.${original.videoFormat}`
	})
}