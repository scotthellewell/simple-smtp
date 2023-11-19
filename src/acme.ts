import { X509Certificate } from 'crypto';
import fs from 'fs';
import acme from 'acme-client';

export class Acme {
    static #challenge: any = {};
    static #settings: { domains: string[], emailAddress: string }
    private static get settings() {
        if (!this.#settings) {
            if (fs.existsSync("acme/settings.json")) {
                this.#settings = JSON.parse(fs.readFileSync("acme/settings.json").toString("utf8"));
            } else {
                console.error("acme/settings.json is missing.");
            }
        }
        return this.#settings;
    }

    static async getCertificate(domains?: string[], email?: string) {
        //TODO: Check if servername is an IP address and then return default certificate
        // since ACME can't issue a certificate for an IP address.

        if (!domains || domains.length === 0) {
            domains = this.settings.domains;
        }
        if (!email) {
            email = this.settings.emailAddress;
        }
        let cert: Buffer;
        let key: Buffer;
        domains = domains.sort((a, b) => a < b ? -1 : 1);
        const domain = domains[0];
        const altNames = domains.slice(1);
        let path = domain;
        for (const altName of altNames) {
            path += "!" + altName;
        }
        if (fs.existsSync("./acme/" + domain + "/" + path + "-cert.pem") && fs.existsSync("./acme/" + domain + "/" + path + "-key.pem")) {
            key = await fs.promises.readFile("./acme/" + domain + "/" + path + "-key.pem");
            cert = await fs.promises.readFile("./acme/" + domain + "/" + path + "-cert.pem");
            const validTo = new Date(new X509Certificate(cert).validTo);
            const getNewDate = new Date(validTo);
            getNewDate.setDate(getNewDate.getDate() - 45);
            const now = new Date();
            if (getNewDate < now && validTo > now) {
                // Update Cert, but continue with existing.
                this.#getCertificateAcme(domain, email, altNames);
            } else if (validTo < now) {
                return await this.#getCertificateAcme(domain, email, altNames);
            }
            return { cert, key };
        }
        return await this.#getCertificateAcme(domain, email, altNames);
    }

    static async #getCertificateAcme(domain: string, email: string, altNames: string[]): Promise<{ key: Buffer, cert: string }> {
        console.log("Getting new certificate for: " + domain);
        try {
            let path = domain;
            for (const altName of altNames) {
                path += "!" + altName;
            }
            let accountKey: Buffer;
            if (fs.existsSync("./acme/account-key")) {
                accountKey = await fs.promises.readFile("./acme/account-key");
            } else {
                accountKey = await acme.crypto.createPrivateKey();
                if (!fs.existsSync("./acme")) {
                    await fs.promises.mkdir("./acme");
                }
                await fs.promises.writeFile("./acme/account-key", accountKey);
            }
            const client = new acme.Client({
                directoryUrl: acme.directory.letsencrypt.production,
                accountKey: accountKey,
            });
            const [key, csr] = await acme.crypto.createCsr({
                commonName: domain,
                altNames
            });
            const cert = await client.auto({
                csr,
                email,
                termsOfServiceAgreed: true,
                challengeCreateFn: async (authz, challenge, keyAuthorization) => {
                    this.#challenge[challenge.token] = keyAuthorization;
                },
                challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
                    this.#challenge[challenge.token] = null;
                },
            })
            if (!fs.existsSync("./acme/" + domain)) {
                await fs.promises.mkdir("./acme/" + domain);
            }
            await fs.promises.writeFile("./acme/" + domain + "/" + path + "-key.pem", key);
            await fs.promises.writeFile("./acme/" + domain + "/" + path + "-cert.pem", cert);
            return { cert, key };
        }
        catch (error) {
            console.error(error);
            return { cert: null, key: null };
        }
    }

    static getChallenge(token: string) {
        return this.#challenge[token];
    }
}