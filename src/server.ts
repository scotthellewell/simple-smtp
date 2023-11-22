import fs from 'fs';
import { SmtpServer, SmtpTransaction } from './smtp-server.js';
import { SmtpTestClient } from './smtp-test-client.js';
import { HttpServer } from './web/htttp-server.js';
import { randomUUID } from 'crypto'
import { authenticate } from 'mailauth';
import { PasswordHasher } from './password-hasher.js';
import { SimpleSmtpDatacontext } from './simple-smtp-data-context.js';
import { User } from './models/user.js';

class Server {
    serverMta: SmtpServer;
    serverMsa: SmtpServer;
    certificateServer: HttpServer;

    constructor() {
        this.certificateServer = new HttpServer();
        this.serverMta = new SmtpServer(25,
            (userName, password) => this.authenticate(userName, password),
            (transaction) => this.processMail(transaction)
        );
        this.serverMsa = new SmtpServer(587,
            (userName, password) => this.authenticate(userName, password),
            (transaction) => this.processMail(transaction)
        );
        console.log("Press [^C] to exit.");
    }

    async authenticate(userName: string, password: string): Promise<User> {
        const dc = new SimpleSmtpDatacontext();
        const query = dc.query(User);
        const user = (await query.filter(u => u.email === userName, {userName}).toArray())[0];
        if (user && PasswordHasher.verify(user.passwordHash, password)){
            user.lastLogin = new Date();
            user.modified = new Date();
            user.modifiedBy = user.id;
            await dc.executeTransaction(async tc => tc.update(User, user));
            return user;
        }
        return null;        
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