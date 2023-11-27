import crypto from 'crypto';
import fs from 'fs';
import { promisify } from 'util';
export class DkimKey {

    static async create(domain: string, selector?: string) {

        const { privateKey, publicKey } = await promisify(crypto.generateKeyPair)("rsa", { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs1', format: 'pem' } });
        if (!fs.existsSync("settings/dkim")) {
            await fs.promises.mkdir("settings/dkim");
        }
        if (!fs.existsSync("settings/dkim/" + domain)) {
            await fs.promises.mkdir("settings/dkim/" + domain)
        }

        if (!selector) {
            const characters = 'abcdefghijklmnopqrstuvwxyz1234567890'
            selector = "";
            while (selector.length < 10) {
                selector += characters[crypto.randomInt(characters.length - 1)];
            }
        }

        fs.promises.writeFile("settings/dkim/" + domain + "/" + selector + "-private.pem", privateKey);
        fs.promises.writeFile("settings/dkim/" + domain + "/" + selector + "-public.pem", publicKey);
        const dnsEntry = { name: selector + "._domainkey." + domain, type: 'TXT', content: 'v=DKIM1; k=rsa; t=s; p=' + publicKey.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replaceAll("\r", "").replaceAll("\n", "").replaceAll(" ", "").replaceAll("\t", "") };

        console.log(privateKey);
        console.log(publicKey);
        console.log(dnsEntry);
        console.log(dnsEntry.content);
        return dnsEntry;
    }

    static async getDnsForSelector(domain: string, selector: string) {
        if (fs.existsSync("settings/dkim/" + domain + "/" + selector + "-public.pem")) {
            const publicKey = (await fs.promises.readFile("settings/dkim/" + domain + "/" + selector + "-public.pem")).toString("utf-8");
            const dnsEntry = { name: selector + "._domainkey." + domain, type: 'TXT', content: 'v=DKIM1; k=rsa; t=s; p=' + publicKey.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replaceAll("\r", "").replaceAll("\n", "").replaceAll(" ", "").replaceAll("\t", "") };
            return dnsEntry;
        }
        return null;
    }

    static async setActiveSelector(domain: string, selector: string): Promise<boolean> {
        try {
            if (fs.existsSync("settings/dkim/" + domain + "/" + selector + "-public.pem")) {
                await fs.promises.writeFile("settings/dkim/" + domain + "/" + "active-selector.txt", selector);
                return true;
            }
        } catch (error) { }
        return false;
    }

    static async getActiveSelector(domain: string) {
        if (await fs.existsSync("settings/dkim/" + domain + "/" + "active-selector.txt")){
            return (await fs.promises.readFile("settings/dkim/" + domain + "/" + "active-selector.txt")).toString("utf8");
        }
        return null;
    }

    static async getPrivateKey(domain: string, selector: string) {
        if (fs.existsSync("settings/dkim/" + domain + "/" + selector + "-private.pem")) {
            return (await fs.promises.readFile("settings/dkim/" + domain + "/" + selector + "-private.pem")).toString("utf-8");
        }
        return null;
    }
}