import acme from 'acme-client';
import express from 'express';
import fs from 'fs';
import { X509Certificate } from 'crypto';
import https from 'https';
import tls from 'tls';

/*
    HttpServer handles getting new certificate from ACME.
    It has a public method getCertificate for getting new or existing certificates.
    It has a public field server that is an express server that can be extended.
    It expects a configuration file in acme/settings.json.  
    A sample exists called sample-settings.json.
    It listens on port 80 (http) required by ACME.  It also listens on port 443 (https).
*/
export class HttpServer {
    server: express.Server;
    private challenge: any = {};
    private httpsServer: https.Server;
    private settings: { domains: string[], emailAddress: string }
    constructor() {
        this.server = express();
        if (fs.existsSync("acme/settings.json")) {
            fs.promises.readFile("acme/settings.json").then(file => {
                this.settings = JSON.parse(file.toString("utf8"));
            })
        } else {
            console.error("acme/settings.json is missing.");
        }
        this.server.get("/.well-known/acme-challenge/:token", (request, response) => {
            response.send(this.challenge[request.params.token]);
        });
        this.server.listen(80, () => { console.log("HttpServer listening on port 80.") });
        this.httpsServer = new https.Server({
            SNICallback: (serverName, callback) => {
                this.getCertificate([serverName], "scotth@elevateh.com").then(certificate => {
                    callback(null, tls.createSecureContext(certificate));
                });
            },
            minVersion: 'TLSv1.3'
        }, this.server);
        this.httpsServer.listen(443, () => { console.log("HttpsServer listening on port 443"); })
    }

    /*
        This method returns an existing certificate if it exists, otherwise calls into ACME to get a new certificate.
    */
    async getCertificate(domains?: string[], email?: string) {
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
                this.getCertificateAcme(domain, email, altNames);
            } else if (validTo < now) {
                return await this.getCertificateAcme(domain, email, altNames);
            }
            return { cert, key };
        }
        return await this.getCertificateAcme(domain, email, altNames);
    }

    /*
        This method is called when we do not have a certificate and requests one from the ACME server.
    */
    private async getCertificateAcme(domain: string, email: string, altNames: string[]): Promise<{ key: Buffer, cert: Buffer }> {
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
                accountKey = await acme.openssl.createPrivateKey();
                if (!fs.existsSync("./acme")) {
                    await fs.promises.mkdir("./acme");
                }
                await fs.promises.writeFile("./acme/account-key", accountKey);
            }
            const client = new acme.Client({
                directoryUrl: acme.directory.letsencrypt.production,
                accountKey: accountKey,
            });
            const [key, csr] = await acme.openssl.createCsr({
                commonName: domain,
                altNames
            });
            const cert = await client.auto({
                csr,
                email,
                termsOfServiceAgreed: true,
                challengeCreateFn: (authz, challenge, keyAuthorization) => {
                    this.challenge[challenge.token] = keyAuthorization;
                },
                challengerRemoveFn: (authz, challenge, keyAuthorization) => {
                    this.challenge[challenge.token] = null;
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
}