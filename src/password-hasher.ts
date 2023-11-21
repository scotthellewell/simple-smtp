
import crypto from 'crypto';
import { promisify } from 'util';
export class PasswordHasher {
    static async hash(password) {
        const salt = crypto.randomBytes(32).toString("base64");
        const scrypt = promisify(crypto.scrypt);
        const hash = ((await scrypt(password, salt, 64)) as Buffer).toString("base64");
        return Buffer.from(JSON.stringify({h: hash, s:salt})).toString("base64");
    }

    static async verify(hash, password) {
        const hashObj = JSON.parse(Buffer.from(hash, "base64").toString("utf-8"));
        const scrypt = promisify(crypto.scrypt);
        const verify = ((await scrypt(password, hashObj.s, 64)) as Buffer).toString("base64");
        return verify === hashObj.h;
    }
}