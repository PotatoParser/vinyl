require('dotenv').config();
process.env._ = 'purge';
const browserify = require('browserify');
const envify = require('loose-envify');
const fs = require('fs');
const targetDir = __dirname + '/public/scripts';
const sourceDir = __dirname + '/src/js';
if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);
browserify(`${sourceDir}/ffmpeg-worker.js`)
.transform(envify)
.bundle()
.pipe(fs.createWriteStream(`${targetDir}/ffmpeg-worker.js`))
.on('finish', () => {
	console.log('Created ffmpeg-worker.js');
});

fs.createReadStream(`${sourceDir}/home.js`)
.pipe(envify())
.pipe(fs.createWriteStream(`${targetDir}/home.js`))
.on('finish', () => {
	console.log('Created home.js');
});