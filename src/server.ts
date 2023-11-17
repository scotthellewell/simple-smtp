import { SmtpServer } from './smtp-server.js';
import { SmtpTestClient } from './smtp-test-client.js';
import { HttpServer } from './htttp-server.js';
class Server {
    serverMta: SmtpServer;
    serverMsa: SmtpServer;
    httpServer: HttpServer;

    constructor() {
        this.httpServer = new HttpServer();
        this.serverMta = new SmtpServer(25, this.httpServer);
        this.serverMsa = new SmtpServer(587, this.httpServer);
        console.log("Press [^C] to exit.");
    }
}

new Server();
new SmtpTestClient();

