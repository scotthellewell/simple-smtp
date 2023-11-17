import { SmtpServer, SmtpTransaction } from './smtp-server.js';
import { SmtpTestClient } from './smtp-test-client.js';
import { HttpServer } from './htttp-server.js';
import fs from 'fs';
import {randomUUID} from 'crypto'

/*
    This is the sample startup file. 
    
    It starts up an instance of the Simple-Smtp server on port 25 and 587 as well as 
    an http/https server that is used by the ACME protocol to get TLS certificates.

    This file can be utilized as a sample of how to setup a server when used as part 
    of another project.
*/
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

    async authenticate(userName: string, password: string): Promise<boolean>{
        console.log("userName: " + userName);
        console.log("password: " + password);
        return true;
    }

    async processMail(transaction: SmtpTransaction): Promise<boolean> {
        console.log("Email Received from: <" + transaction.reversePath + "> for " + transaction.forwardPaths.map(e => "<" + e + ">"));
        if (!fs.existsSync("./received")){
            await fs.promises.mkdir("./received");
        }
        const id = randomUUID();
        await fs.promises.writeFile("./received/" + id + ".json", JSON.stringify(transaction));
        await fs.promises.writeFile("./received/" + id + ".txt", transaction.data);
        console.log(transaction);
        return true;
    }
}

new Server();
new SmtpTestClient();

