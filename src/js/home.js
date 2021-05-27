const QUEUE_LIMIT = Number(process.env.QUEUE_LIMIT || 5);
const input = document.querySelector('input');
const downloadBtn = document.querySelector('.download-btn');
const musicBtn = document.querySelector('.music-btn');
const videoBtn = document.querySelector('.video-btn');
const advancedBtn = document.querySelector('.advanced-settings');
const advancedMenu = document.querySelector('.advanced-wrapper');
const resetBtn = document.querySelector('.reset-btn');
const XSRF = (new Map(document.cookie.split(';').map(pair => pair.trim().split('=')))).get('XSRF-TOKEN');
const helpBtn = document.querySelector('.help-btn');

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

function selector(target) {
	return (proxy, key) => {
		const element = document.querySelector(target);
		const selector = '.choices div:not(.divider)';		
		const children = element.querySelectorAll(selector);
		const wipe = () => {
			children.forEach(choice => choice.removeAttribute('selected'));
			element.querySelector(`.choices div[value="${proxy[key]}"]`).setAttribute('selected', '');
		}
		children.forEach(choice => {
			choice.addEventListener('click', () => {
				let value = choice.getAttribute('value');
				if (value === 'false' || value === 'true') {
					proxy[key] = !!(value === 'true');
				}
				else proxy[key] = value;
			});
		});
		return wipe;
	}
}

function mainSelector() {
	return proxy => {
		const wipe = () => {
			if (proxy.isMusic) {
				musicBtn.setAttribute('active', '');
				videoBtn.removeAttribute('active');
			}
			else {
				videoBtn.setAttribute('active', '');
				musicBtn.removeAttribute('active');				
			}
		}
		videoBtn.addEventListener('click', () => proxy.isMusic = false);
		musicBtn.addEventListener('click', () => proxy.isMusic = true);
		return wipe;
	}
}

const settings = dynamicLocalStorage({
	isMusic: false,
	videoQuality: '1080p',
	audioQuality: '256',
	audioFormat: 'webm',
	videoFormat: 'webm',
	convert: false,
	helpBox: true
}, {
	videoQuality: selector('.video-quality'),
	audioQuality: selector('.audio-quality'),
	videoFormat: selector('.video-format'),
	audioFormat: selector('.audio-format'),
	isMusic: mainSelector(),
	convert: selector('.experimental'),
	helpBox: proxy => {
		return () => {
			const helpContainer = document.querySelector('.help-container');
			if (proxy.helpBox) {
				if (helpContainer.getAttribute('hidden') !== null) {
					helpContainer.removeAttribute('hidden');	
				}
				helpContainer.removeAttribute('hide');
			} else {
				if (helpContainer.getAttribute('hidden') !== null) {
					helpContainer.addEventListener('animationend', () => {
						helpContainer.removeAttribute('hidden');
					}, {once: true});
				}
				helpContainer.setAttribute('hide', '');
				input.focus();
			}
		}
	}
});

const Queue = (function(){
	let active = 0;
	let queued = [];

	const add = (link) => {
		let copiedSettings = JSON.parse(JSON.stringify(settings));
		queued.push([link, copiedSettings, queueItem()]);
		refresh();
	}

	const refresh = () => {
		while (active < QUEUE_LIMIT && queued.length > 0) {
			++active;
			process(...queued.splice(0, 1)[0]);
		}
	} 
	const finished = () => {
		--active;
		refresh();
	}

	const process = (link, copiedSettings, item) => {
		let worker = new Worker('/scripts/ffmpeg-worker.js');
		worker.onmessage = message => {
			let data = message.data;
			switch (data.type) {
				case "item":
					item[data.item](data.value);
					break;
				case "complete":
					save(URL.createObjectURL(data.blob), data.filename)();
					item.loaded();
					finished();
					break;
				case "error":
					e = data.error;
					if (!e.error) console.error(e);
					item.text(e.title || 'Metadata Unavailable.');
					jsAlert(e.error || e.message);
					item.error();
					finished();
					break;
				default:
					break;
			}
		}
		worker.onerror = err => {
			const msg = 'Unable to load ffmpeg.';
			item.text(msg);
			jsAlert(msg);
			item.error();
			finished();
		}
		item.element.addEventListener('click', () => {
			if (item.element.getAttribute('complete') === null) {
				worker.terminate();
				autoRemove(item.element, 1000);
				item.element.click();
			}
		});
		item.text('Loading FFmpeg...');
		item.state('metadata');
		worker.postMessage({
			type: copiedSettings.isMusic ? 'audio' : 'video',
			link,
			XSRF,
			settings: copiedSettings
		});		
	}

	return {
		add
	}
}());

function dynamicLocalStorage(defaults, links) {
	try {
		let copied = Object.assign({}, defaults);
		let proxy;
		let linked = Object.assign({}, links);
		let temp;
		for (let key in defaults) {
			temp = localStorage.getItem(key);
			if (temp !== null) {
				copied[key] = JSON.parse(temp);
			}
		}
		proxy = new Proxy(copied, {
			set: (obj, prop, val) => {
				if (prop === 'audioFormat' && val === 'mp3') {
					if (!obj.convert) return jsAlert('You must enable convert for mp3 formats');
				}
				localStorage.setItem(prop, JSON.stringify(val));
				obj[prop] = val;
				if (linked[prop]) linked[prop]();
				return true;
			}
		});
		for (let key in links) {
			(linked[key] = linked[key](proxy, key))();
		}
		Object.defineProperty(proxy, 'reset', {
			value: () => {
				Object.assign(proxy, defaults);
				for (let key in proxy) {
					if (defaults[key] === undefined) {
						delete proxy[key];
					}
				}
			}
		});
		return proxy;
	} catch(e) {
		console.error(e);
		localStorage.clear();
		dynamicLocalStorage(defaults, links);
	}
}

resetBtn.addEventListener('click', () => {
	settings.reset();
});
advancedBtn.addEventListener('click', () => {
	advancedMenu.toggleAttribute('open');
});

function autoRemove(element, ms) {
	let timer = setTimeout(() => {
		element.removeEventListener('click', remove, {once: true});
		remove();
	}, ms);			
	let remove = () => {
		clearTimeout(timer);
		element.addEventListener('animationend', () => {
			element.remove();
		}, {once: true});
		element.setAttribute('remove', '');
	};
	element.addEventListener('click', remove, {once: true});
}

function jsAlert(message) {
	if (document.querySelector('.alert')) document.querySelector('.alert').remove();
	let alert = document.createElement('div');
	alert.classList.add('alert');
	alert.innerText = message;
	autoRemove(alert, 10000);
	document.body.appendChild(alert);
}

function save(url, filename) {
	return () => {
		let download = document.createElement('a');
		download.href = url;
		download.setAttribute('download', filename);
		document.body.appendChild(download)
		download.dispatchEvent(new MouseEvent('click'));
		download.remove();
		input.focus();
	}
}

async function download() {
	if (downloadBtn.getAttribute('invalid') !== null) {
		return jsAlert('Invalid Input!');
	}
	const value = input.value.trim();
	input.value = '';
	downloadBtn.setAttribute('hidden', '');
	input.focus();
	if (/&list=[\w-]+$/g.test(value)) {
		try {
			let {error, urls} = await request('/playlist', {playlist: value}).then(res => res.json());
			if (error) return jsAlert('Playlist does not exist!');
			urls.forEach(Queue.add);
			return;
		} catch(e) {
			return jsAlert('Error fetching playlist!');
		}
	}
	Queue.add(value);
}

downloadBtn.addEventListener('click', download);

function validate(link) {
	link = link.trim();
	if (!(/^(https?:\/\/(youtu\.be\/|(www\.)?youtube\.com\/watch\?v=))?[A-Za-z0-9_-]{11}(?=$|&)/g).test(link)) {
		downloadBtn.setAttribute('invalid', '');
	} else {
		downloadBtn.removeAttribute('invalid');
	}
	if (link) {
		downloadBtn.removeAttribute('hidden');
	} else {
		downloadBtn.setAttribute('hidden', '');
	}
}

input.addEventListener('keyup', e => {
	validate(input.value);
	if (e.key === 'Enter') {
		download();
	}
});

input.addEventListener('paste', e => {
	validate((e.clipboardData || window.clipboardData).getData('text'));
});

function queueItem() {
	let item = document.createElement('div');
	item.classList.add('item');
	let loader = document.createElement('div');
	loader.classList.add('loading');
	loader.setAttribute('state', 'queued');
	item.appendChild(loader);
	loader.innerHTML = `<i class="fas fa-times"></i><i class="fas fa-check"></i>`;
	let text = document.createElement('span');
	text.innerText = 'Queued...'
	item.appendChild(text);
	let filler = document.createElement('div');
	filler.classList.add('filler');
	item.appendChild(filler);
	if (document.querySelector('.queue').firstElementChild)
		document.querySelector('.queue').firstElementChild.before(item);
	else document.querySelector('.queue').appendChild(item);
	return {
		element: item,
		state: s => {
			loader.setAttribute('state', s);
		},
		text: str => {
			text.innerText = str;
		},
		loaded: () => {
			loader.setAttribute('loaded', '');
			item.setAttribute('complete', '');
			autoRemove(item, 5000);
		},
		error: () => {
			loader.setAttribute('errored', '');
			item.setAttribute('complete', '');			
			autoRemove(item, 10000);
		}
	}
}

document.querySelector('.help-container .close-btn').addEventListener('click', () => {
	settings.helpBox = false;
});

helpBtn.addEventListener('click', () => {
	settings.helpBox = true;
});

fetch('https://api.github.com/repos/potatoparser/vinyl').then(res => {
	res.json().then(json => {
		if (json.watchers) {
			document.querySelector('.stars').innerHTML = `${json.watchers} <i class="fas fa-star"></i>`;
		}
	});
}).catch(e => console.error(e));