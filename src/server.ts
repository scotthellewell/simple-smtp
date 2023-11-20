import { SmtpServer, SmtpTransaction } from './smtp-server.js';
import { SmtpTestClient } from './smtp-test-client.js';
import { HttpServer } from './web/htttp-server.js';
import fs from 'fs';
import { randomUUID } from 'crypto'
import { authenticate } from 'mailauth';

class Server {
    serverMta: SmtpServer;
    serverMsa: SmtpServer;
    certificateServer: HttpServer;

    constructor() {
        this.certificateServer = new HttpServer();
        this.serverMta = new SmtpServer(25, this.certificateServer,
            (userName, password) => this.authenticate(userName, password),
            (transaction) => this.processMail(transaction)
        );
        this.serverMsa = new SmtpServer(587, this.certificateServer,
            (userName, password) => this.authenticate(userName, password),
            (transaction) => this.processMail(transaction)
        );
        console.log("Press [^C] to exit.");
    }

    async authenticate(userName: string, password: string): Promise<boolean> {
        console.log("userName: " + userName);
        console.log("password: " + password);
        return true;
    }

    async processMail(transaction: SmtpTransaction): Promise<boolean> {
        console.log("Email Received from: <" + transaction.reversePath + "> for " + transaction.forwardPaths.map(e => "<" + e + ">"));
        console.log(transaction.data.split("\r\n\r\n")[0]);
        if (!fs.existsSync("./received")) {
            await fs.promises.mkdir("./received");
        }
        const id = randomUUID();
        await fs.promises.writeFile("./received/" + id + ".json", JSON.stringify(transaction));
        await fs.promises.writeFile("./received/" + id + ".txt", transaction.data);
        const authResults = await authenticate(
            transaction.data,
            {
                // trustReceived: true,
                ip: transaction.clientIP,
                helo: transaction.helo,
                sender: transaction.reversePath,
                mta: 'scotth-home.elevateh.net'
            }
        );
        console.log(authResults);
        return true;
    }
}

new Server();
new SmtpTestClient();
// const message = new Message(fs.readFileSync("received/95129a91-5de1-4f65-834f-16ff5e8a3112.txt").toString("utf8"));
// var dkim = new DKIM();
// console.log(await dkim.verify(message));
// console.log("");
