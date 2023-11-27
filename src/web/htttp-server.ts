import express from 'express';
import https from 'https';
import tls from 'tls';
import { Controller } from './shared/controller.js';
import { AcmeController } from './controllers/acme.controller.js';
import { Acme } from '../acme.js';
import { createProxyMiddleware, Filter, Options, RequestHandler } from 'http-proxy-middleware';
import { DkimController } from './controllers/dkim.controller.js';

export class HttpServer {
    server: express.Server;
    private httpsServer: https.Server;

    #controllers: Controller[] = [
        new AcmeController(),
        new DkimController(),
    ];

    constructor() {
        this.server = express();
        for (const controller of this.#controllers) {
            this.server.use(controller.routerPath, controller.router);
        }

        this.server.use(express.static("web_root"));

        this.server.use(
            '/',
            createProxyMiddleware({
                target: 'http://localhost:4300',
                changeOrigin: true,
            }),
        );

        this.server.listen(80);
        this.httpsServer = new https.Server({
            SNICallback: (serverName, callback) => {
                Acme.getCertificate([serverName]).then(certificate => {
                    callback(null, tls.createSecureContext(certificate));
                });
            },
            minVersion: 'TLSv1.3'
        }, this.server);
        this.httpsServer.listen(443);
    }

}