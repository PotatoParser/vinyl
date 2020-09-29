// Import vital settings
require('dotenv').config();
const BYTE_LIMIT = Number(process.env.BYTE_LIMIT || Infinity);
const TIME_LIMIT = Number(process.env.TIME_LIMIT || Infinity);
const PORT = process.env.PORT || 8080;
const URL = process.env.URL || `http://localhost:${PORT}/`;
const PRODUCTION_MODE = process.env.NODE_ENV === 'production';
const DEFAULTS = require('./settings');
const RAPID_FORKS = Number(process.env.RAPID_FORKS || 1);

// Import dependencies
const express = require('express');
const ytdl = require('ytdl-core');
const request = require('request');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const csurf = require('csurf');
const formats = require('ytdl-core/lib/formats');

// Import external dependencies
const secure = require('./lib/encrypt');

const app = express();
const CSRF = csurf({
	cookie: {
		secure: PRODUCTION_MODE,
		httpOnly: PRODUCTION_MODE,
	}
});

app.use(bodyParser.json());
app.use(cookieParser());

if (!process.env.HIVE_QUEEN) {
	app.use(express.static(__dirname + '/public'));
}

app.get('/', CSRF, (req, res) => {
	res.cookie('XSRF-TOKEN', req.csrfToken());
	res.set({
		'X-Frame-Options': 'DENY',
		'Cache-Control': 'no-cache, no-store, must-revalidate',
		'Pragma': 'no-cache',
		'Expires': '0'
	});
	res.sendFile(__dirname + '/index.html');
});

function slice(arr, target) {
	return arr.slice(0, arr.indexOf(target) + 1);
}

function findOptimal(info, type, quality, format, convert) {
	const remaining = slice(DEFAULTS[type].qualityList, quality);
	let optimal =
		ytdl.filterFormats(info.formats, `${type}only`)
		.filter(i => (convert ? true : i.container === format) && remaining.includes(i[DEFAULTS[type].target]))
		.filter(b => !b.mimeType.includes('av01'))
		.sort((a, b) => type === 'video' ? b.bitrate - a.bitrate : b.audioBitrate - a.audioBitrate)[0];
	if (!optimal) {
		throw 'There are no sources available with those settings!';
	}
	optimal.contentLength = Number(optimal.contentLength);
	if (optimal.contentLength > BYTE_LIMIT) {
		throw 'Video is too large! Use a lower quality.';
	}
	return {
		format: optimal.container,
		quality: optimal[DEFAULTS[type].target],
		source: secure.encrypt(JSON.stringify({
			url: optimal.url,
			contentLength: optimal.contentLength
		})),
		length: optimal.contentLength,
		segments: optimal.segments
	}
}

app.post('/download', CSRF, async (req, res) => {
	if (req.header('Referer') !== URL) {
		return res.status(403).json({
			error: 'Illegal Request (Incorrect Referer).'
		});
	}

	const {type, metadata, segments} = req.body;
	const response = {error: null};
	const Err = (code, str) => {
		response.error = str;
		res.status(code).json(response);
	}
	if (type !== 'video' && type !== 'audio') {
		return Err(500, 'Invalid type.');
	}
	if (!metadata) {
		return Err(403, 'Missing data.');
	}
	try {
		const {url, contentLength} = JSON.parse(await secure.decrypt(metadata));
		if (segments) {
			return rapidSegmentDownload(url, segments).then(buffer => {
				res.status(302).send(buffer);
			});
		}
		if (RAPID_FORKS === 1) {
			request(url).pipe(res.status(302));
		} else {
			rapidDownload(url, contentLength).then(buffer => {
				res.status(302).send(buffer)
			});
		}
	} catch(e) {
		console.log(e);
		Err(403, 'Unable to download request.');
	}
});

app.post('/meta', CSRF, (req, res) => {
	if (req.header('Referer') !== URL) {
		return res.status(403).json({
			error: 'Illegal Request (Incorrect Referer).'
		});
	}

	let {link, type, videoQuality, audioQuality, videoFormat, audioFormat, convert} = req.body;
	if (audioQuality) audioQuality = Number(audioQuality);
	const response = {error: null};
	const Err = (str) => {
		console.log(str);
		response.error = str;
		res.status(302).json(response);
	}
	if (type !== 'video' && type !== 'audio') {
		return Err('Invalid type.');
	}
	if (!(/(?<=^|(https?:\/\/(youtu\.be\/|(www\.)?youtube\.com\/watch\?v=)))[A-Za-z0-9_-]{11}(?=$|&)/g).test(link)) {
		return Err('Unable to detect video.');
	}
	if (type === 'video') {
		if (!DEFAULTS.video.qualityList.includes(videoQuality) || !DEFAULTS.video.formatList.includes(videoFormat)) {
			return Err('Invalid video arguments.');
		}
		audioFormat = videoFormat;
	}
	if (!DEFAULTS.audio.qualityList.includes(audioQuality) || !DEFAULTS.audio.formatList.includes(audioFormat)) {
		return Err('Invalid audio arguments.');
	}
	ytdl.getInfo(link, async (err, info) => {
		if (err) {
			return Err('Unable to find video.');
		}
		response.title = info.title;
		let manifests = new Set(info.formats.filter(i => i.url.indexOf('https://manifest') === 0).map(i => i.url));
		if (manifests.size > 0) {
			let addedFormats = [];
			for (let manifest of manifests.entries()) {
				addedFormats.push(await parseManifest(manifest[0]));
			}
			info.formats = info.formats.filter(i => i.url.indexOf('https://manifest') !== 0).concat(addedFormats.flat());
		}
		let seconds = Number(info.length_seconds);
		if (seconds > TIME_LIMIT) {
			return Err('Video is too long! Choose a different video.');
		}
		try {
			if (type === 'video') {
				const optimal = findOptimal(info, 'video', videoQuality, videoFormat, convert);
				response.video = await optimal.source;
				response.videoQuality = optimal.quality;				
				response.videoFormat = optimal.format;
				response.videoLength = optimal.length;
				response.videoSegments = optimal.segments;
			}
			const optimal = findOptimal(info, 'audio', audioQuality, audioFormat, convert);
			response.audio = await optimal.source;
			response.audioQuality = optimal.quality;
			response.audioFormat = optimal.format;
			response.audioLength = optimal.length;
			response.audioSegments = optimal.segments;
			res.status(302).json(response);
		} catch (e) {
			console.log(e);
			Err(e.message || e);
		}
	});
});

app.use((err, req, res, next) => {
	if (err.code !== 'EBADCSRFTOKEN') return next();
	res.status(403).json({error: 'Invalid CSRF Token!'});
});

function partialDownload(url, start, end) {
	return new Promise(resolve => {
		request({
			url: url,
			headers: {		
				range: `bytes=${start}-${end}`
			},
			encoding: null
		}, async (err, res, body) => {
			if (err) resolve(await partialDownload(url, start, end));
			else resolve(res.body);
		});
	});
}

async function rapidDownload(url, length) {
	const MAX = RAPID_FORKS;
	length = Number(length);
	let div = Math.trunc(length / MAX);
	let requests = [];
	let i;
	for (i = 0; i < MAX - 1; ++i) {
		requests.push(partialDownload(url, i*div, (i+1)*div-1));
	}
	requests.push(partialDownload(url, i*div, length));
	let final = await Promise.all(requests);
	return Buffer.concat(final.flat());
}

function downloadSegment(url) {
	return new Promise(resolve => {
		request({
			url,
			encoding: null
		}, async (err, req, body) => {
			if (err) return resolve(await downloadSegment(url));
			resolve(req.body);
		});
	});
}

async function rapidSegmentDownload(baseURL, segments) {
	let requests = [];
	segments.forEach(seg => {
		requests.push(downloadSegment(`${baseURL}${seg}`));
	});
	let final = await Promise.all(requests);
	return Buffer.concat(final);
}

function parseManifest(url) {
	return new Promise((resolve, reject) => {
		request(url, (err, res, body) => {
			if (err) reject(err);
			else resolve(Array.from(res.body.match(/(?<=<Representation).*?(?=\/Representation>)/g)).map(i => {
				let format = Object.assign({
					segments: Array.from(i.match(/<SegmentList>.*?<\/SegmentList>/g)[0].match(/(?<=(sourceURL|media)=\").*?(?=\")/g)),
					url: i.match(/(?<=\<BaseURL\>).*?(?=\<\/BaseURL\>)/g)[0],
				}, formats[i.match(/(?<=id=").*?(?=")/g)[0]]);
				format.container = format.mimeType.match(/(?<=\/).*?(?=;)/g)[0];
				format.raw = i;
				return format;
			}));
		});
	});
}

app.listen(PORT, () => {
	console.log('ACTIVE', PORT);
});