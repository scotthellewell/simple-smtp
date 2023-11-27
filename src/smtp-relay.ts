import fs from 'fs';
import { SmtpTransaction } from './smtp-server.js';
import dns from 'dns';
import { promisify } from 'util';
import tls from 'tls';
import { Socket } from 'net';

type SmtpTransport = Socket & {
    messageBuffer?: string;
}

type SendEmailTransaction = {
    currentStep?: string,
    capabilities?: string[],
    reversePath: string,
    forwardPath: string,
    data: string,
    statusResolver: (string) => void
};

export class SmtpRelay {

    async processMailQueue(path: string) {
        console.log("Processing Mail Queue: " + path);
        const dir = await fs.promises.opendir(path);
        let entry = await dir.read();
        while (entry) {
            if (entry.isFile() && entry.name.endsWith(".json")) {
                await this.processItem(dir.path + "/" + entry.name);
            }
            entry = await dir.read();
        }
        await dir.close();
        setTimeout(() => { this.processMailQueue(path); }, 10000);
    }

    async processItem(path: string) {
        const item = JSON.parse((await fs.promises.readFile(path)).toString("utf8")) as SmtpTransaction;
        if (!item.deliveryStatuses) { item.deliveryStatuses = []; }
        for (const forwardPath of item.forwardPaths) {
            let deliveryStatus = item.deliveryStatuses.find(ds => ds.forwardPath == forwardPath);
            if (!deliveryStatus) {
                deliveryStatus = { forwardPath, status: null };
                item.deliveryStatuses.push(deliveryStatus);
            }
            if (deliveryStatus.status == null) {
                deliveryStatus.status = await this.sendEmail(item.reversePath, forwardPath, item.data);
            }
        }
        if (item.deliveryStatuses.find(ds => ds.status === null)) {
            await fs.promises.writeFile(path, JSON.stringify(item));
        } else {
            await fs.promises.unlink(path);
        }
    }

    async sendEmail(reversePath: string, forwardPath: string, data: string): Promise<string> {
        let statusResolver: (value: string) => void;
        const promise = new Promise<string>(async resolver => { statusResolver = resolver; });
        const transaction: SendEmailTransaction = { reversePath, forwardPath, data, statusResolver };
        try {
            const domain = forwardPath.slice(forwardPath.indexOf("@") + 1);
            const mx = await promisify(dns.resolveMx)(domain);
            mx.sort((a, b) => a.priority < b.priority ? -1 : 1);
            const mxAddress = mx[0].exchange;
            const socket = new Socket() as SmtpTransport;
            socket.setEncoding("utf8");
            socket.on('data', (data) => { this.onSendEmailData(transaction, socket, data) });
            socket.connect(25, mxAddress, () => { });
        }
        catch (error) {
            console.error(error);
            statusResolver(null);
        }
        const status = await promise;
        return status;
    }

    onSendEmailData(transaction: SendEmailTransaction, transport: SmtpTransport, data: Buffer) {
        if (transport.messageBuffer === undefined) { transport.messageBuffer = ""; }
        transport.messageBuffer += data.toString("utf8");
        const messages = transport.messageBuffer.split("\r\n");
        for (let i = 0; i < messages.length - 1; i++) {
            this.processMessage(transaction, transport, messages[i]);
        }
        transport.messageBuffer = messages[messages.length - 1];
    }


    processMessage(transaction: SendEmailTransaction, transport: SmtpTransport, message: string) {
        console.log("R: " + message);
        switch (transaction.currentStep) {
            case undefined:
                return this.processNULL(transaction, transport, message);
            case "EHLO":
                return this.processEHLO(transaction, transport, message);
            case "STARTTLS":
                return this.processSTARTTLS(transaction, transport, message);
            case "MAIL":
                return this.processMAIL(transaction, transport, message);
            case "RCPT":
                return this.processRCPT(transaction, transport, message);
            case "DATA":
                return this.processDATA(transaction, transport, message);
            case "QUIT":
                return this.processQUIT(transaction, transport, message);
            default:
                console.log("Unknown Step: " + transaction.currentStep);
        }
    }

    processNULL(transaction: SendEmailTransaction, transport: SmtpTransport, message: string) {
        if (message.startsWith("220 ")) {
            this.sendEHLO(transaction, transport);
        } else {
            this.sendQUIT(transaction, transport, null);
        }
    }

    sendEHLO(transaction: SendEmailTransaction, transport: SmtpTransport) {
        transaction.currentStep = "EHLO";
        this.send(transport, "EHLO scotth-home.elevateh.net");
    }

    processEHLO(transaction: SendEmailTransaction, transport: SmtpTransport, message: string) {
        if (!transaction.capabilities) {
            transaction.capabilities = [];
        }

        if (message.startsWith("250-")) {
            transaction.capabilities.push(message.slice(4));
        } else if (message.startsWith("250 ")) {
            transaction.capabilities.push(message.slice(4));
            const startTLS = transaction.capabilities.find(c => c.toUpperCase() === "STARTTLS");
            if (startTLS) {
                this.sendSTARTTLS(transaction, transport);

            } else {
                this.sendMAIL(transaction, transport);
            }
        } else {
            this.sendQUIT(transaction, transport, null);
        }
    }

    sendSTARTTLS(transaction: SendEmailTransaction, transport: SmtpTransport) {
        transaction.currentStep = "STARTTLS";
        this.send(transport, "STARTTLS");
    }

    async processSTARTTLS(transaction: SendEmailTransaction, transport: SmtpTransport, message: string) {
        if (message.startsWith("220 ")) {
            transport.setEncoding(null);
            transaction.capabilities = [];
            delete transport["_readableState.decoder"];
            transport.removeAllListeners('data');


            const tlsTransport = tls.connect({
                socket: transport,
                rejectUnauthorized: false,
            }) as SmtpTransport;
            tlsTransport.setEncoding("utf8");
            tlsTransport.messageBuffer = "";
            tlsTransport.on('data', (data) => {
                this.onSendEmailData(transaction, tlsTransport, data)
            });
            tlsTransport.on("error", (error) => {  })
            tlsTransport.on("secureConnect", (data) => {
                this.sendEHLO(transaction, tlsTransport);
            })
        } else {
            this.sendQUIT(transaction, transport, null);
        }
    }

    sendMAIL(transaction: SendEmailTransaction, transport: SmtpTransport) {
        transaction.currentStep = "MAIL";
        this.send(transport, `MAIL FROM:<${transaction.reversePath}>`);
    }

    processMAIL(transaction: SendEmailTransaction, transport: SmtpTransport, message: string) {
        if (message.startsWith("250 ")) {
            this.sendRCPT(transaction, transport);
        } else {
            this.sendQUIT(transaction, transport, null);
        }
    }

    sendRCPT(transaction: SendEmailTransaction, transport: SmtpTransport) {
        transaction.currentStep = "RCPT";
        this.send(transport, `RCPT TO:<${transaction.forwardPath}>`);
    }

    processRCPT(transaction: SendEmailTransaction, transport: SmtpTransport, message: string) {
        if (message.startsWith("250 ")) {
            this.sendDATA(transaction, transport);
        } else {
            this.sendQUIT(transaction, transport, null);
        }
    }
    sendDATA(transaction: SendEmailTransaction, transport: SmtpTransport) {
        transaction.currentStep = "DATA";
        this.send(transport, "DATA");
    }

    processDATA(transaction: SendEmailTransaction, transport: SmtpTransport, message: string) {
        if (message.startsWith("354 ")) {
            for (const line of transaction.data.split("\r\n")) {
                if (line.startsWith(".")) {
                    this.send(transport, "." + line);
                } else {
                    this.send(transport, line);
                }
            }
            this.send(transport, ".");
        } else if (message.startsWith("250 ")) {
            this.sendQUIT(transaction, transport, "Sent");
        } else {

            this.sendQUIT(transaction, transport, null);
        }
    }

    sendQUIT(transaction: SendEmailTransaction, transport: SmtpTransport, status?: string) {
        transaction.currentStep = "QUIT";
        this.send(transport, "QUIT");
        transport.end();
        if (status || status === null) {
            transaction.statusResolver(status);
        }
    }

    processQUIT(transaction: SendEmailTransaction, transport: SmtpTransport, message: string) {

        transport.end();
    }









    send(transport: SmtpTransport, message: string, errorHandler?: (error?: Error) => void) {
        console.log("S: '" + message + "'");
        transport.write(message + "\r\n", errorHandler);
    }
}