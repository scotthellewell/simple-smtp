import { SmtpServer, SmtpTransaction } from './smtp-server.js';
import { SmtpTestClient } from './smtp-test-client.js';
import { HttpServer } from './web/htttp-server.js';
import fs from 'fs';
import { randomUUID } from 'crypto'
import { authenticate } from 'mailauth';
import { PasswordHasher } from './password-hasher.js';
import { SimpleSmtpDatacontext } from './simple-smtp-data-context.js';
import { User } from './models/user.js';
import crypto from 'crypto';

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
        const dc = new SimpleSmtpDatacontext();
        const query = dc.query(User);
        const user = (await query.filter(u => u.email === userName, {userName}).toArrayAsync())[0];
        if (user && PasswordHasher.verify(user.hash, password)){
            user.lastLogin = new Date();
            user.modified = new Date();
            user.modifiedBy = user.id;
            await dc.executeTransactionAsync(async tc => tc.updateAsync(User, user));
            return true;
        }
        return false;
        
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