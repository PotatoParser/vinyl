const crypto = require('crypto');
const KEY = (process.env.KEY || crypto.randomBytes(16).toString('base64')).substring(0, 16);
const IV = (process.env.IV || crypto.randomBytes(16).toString('base64')).substring(0, 16);
const algorithm = 'aes-128-cbc';
const SALT = (process.env.SALT || crypto.randomBytes(4).toString('base64')).substring(0, 4);

const decrypt = data => {
	return new Promise(async resolve => {
		crypto.scrypt(KEY, SALT, 16, (err, newKey) => {
			const decipher = crypto.createDecipheriv(algorithm, newKey, IV);
			let decrypted = decipher.update(data, 'base64', 'utf8') + decipher.final('utf8');
			resolve(decrypted);
		});
	});
}

const encrypt = data => {
	return new Promise(async resolve => {
		crypto.scrypt(KEY, SALT, 16, (err, newKey) => {
			const cipher = crypto.createCipheriv(algorithm, newKey, IV);
			let encrypted = cipher.update(data, 'utf8', 'base64') + cipher.final('base64');
			resolve(encrypted);
		});
	});
}

module.exports.encrypt = encrypt;
module.exports.decrypt = decrypt;