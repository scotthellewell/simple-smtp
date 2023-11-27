import fs from 'fs';
import { SmtpServer, SmtpTransaction } from './smtp-server.js';
import { SmtpTestClient } from './smtp-test-client.js';
import { HttpServer } from './web/htttp-server.js';
import { randomUUID } from 'crypto'
import { authenticate } from 'mailauth';
import { PasswordHasher } from './password-hasher.js';
import { SimpleSmtpDatacontext } from './simple-smtp-data-context.js';
import { User } from './models/user.js';
import { DkimKey } from './DkimKey.js';
import crypto from 'crypto';
import { SmtpRelay } from './smtp-relay.js';
class Server {
    serverMta: SmtpServer;
    serverMsa: SmtpServer;
    smtpRelay: SmtpRelay;
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
        this.smtpRelay = new SmtpRelay();
        this.smtpRelay.processMailQueue("mail-queue");
        console.log("Press [^C] to exit.");
    }

    async authenticate(userName: string, password: string): Promise<User> {
        const dc = new SimpleSmtpDatacontext();
        const query = dc.query(User);
        const user = (await query.filter(u => u.email === userName, { userName }).toArray())[0];
        if (user && PasswordHasher.verify(user.passwordHash, password)) {
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
        if (transaction.authenticated) {
            if (!fs.existsSync("mail-queue")) {
                await fs.promises.mkdir("mail-queue");
            }
            fs.promises.writeFile("mail-queue/" + crypto.randomUUID() + ".json", JSON.stringify(transaction));
            return true;
        }
        else {
            const dc = new SimpleSmtpDatacontext();
            for (const forwardPath of transaction.forwardPaths) {
                const user = (await dc.query(User).filter(u => u.email === forwardPath, { forwardPath }).toArray())[0];
                if (!user) {
                    return false;
                }
                if (!fs.existsSync("mailboxes")) {
                    await fs.promises.mkdir("mailboxes");
                }
                const parts = forwardPath.toLocaleLowerCase().split("@");
                if (!fs.existsSync("mailboxes/" + parts[1])) {
                    await fs.promises.mkdir("mailboxes/" + parts[1]);
                }
                if (!fs.existsSync("mailboxes/" + parts[1] + "/" + parts[0])) {
                    await fs.promises.mkdir("mailboxes/" + parts[1] + "/" + parts[0]);
                }
                await fs.promises.writeFile("mailboxes/" + parts[1] + "/" + parts[0] + "/" + crypto.randomUUID() + ".json", JSON.stringify(transaction));
                if (user.forwardAddress) {
                    if (!fs.existsSync("mail-queue")) {
                        await fs.promises.mkdir("mail-queue");
                    }
                    transaction.forwardPaths = [user.forwardAddress];
                    transaction.reversePath = user.email;
                    fs.promises.writeFile("mail-queue/" + crypto.randomUUID() + ".json", JSON.stringify(transaction));
                }
            }
            return true;
        }
    }
}
new Server();
new SmtpTestClient();