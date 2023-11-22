import net, { Socket } from 'net';
import tls, { TLSSocket } from 'tls';
import { HttpServer } from './web/htttp-server.js';
import dns from 'dns';
import { Acme } from './acme.js';
import crypto from 'crypto';
import os from 'os';
import mailauth from 'mailauth';
import { User } from './models/user.js';

const debugEnabled = false;
export class SmtpTransaction {
    reversePath: string;
    forwardPaths: string[] = [];
    data: string = null;
    bodyEncoding: "7BIT" | "8BITMIME" = "7BIT";
    clientIP?: string;
    helo?: string;
    protocol = "SMTP";
}

type SmtpTransport = Socket & {
    messageBuffer?: string;
    transaction?: SmtpTransaction;
    hello?: string;
    auth?: string;
    userName?: string;
    password?: string;
    secure?: boolean;
    authenticated?: User;
    closing?: boolean;
}

export class SmtpServer {
    private server: net.Server;
    constructor(
        private port: number, 
        private verifyAuth: (username: string, password: string) => Promise<User>, 
        private processTransaction: (transaction: SmtpTransaction) => Promise<boolean>) {
        this.setupServer();
    }

    setupServer() {
        this.server = net.createServer((socket: SmtpTransport) => {
            socket.messageBuffer = "";
            socket.setEncoding('utf8');
            socket.on('data', (data) => { this.onData(socket, data); });
            socket.on('error', (error) => { if (!socket.closing) { console.error(error); } });
            this.send(socket, "220 smtp.elevateh.net ready");
        });
        this.server.listen(this.port);
    }

    onData(transport: SmtpTransport, data: Buffer) {
        if (!transport.messageBuffer === undefined) { transport.messageBuffer = ""; }
        transport.messageBuffer += data.toString('utf8');
        if (transport.messageBuffer) {
            const messages = (transport.messageBuffer as string).split("\r\n");
            for (let i = 0; i < messages.length - 1; i++) {
                this.processMessage(transport, messages[i]);
            }
            transport.messageBuffer = messages[messages.length - 1];
        }
    }

    processMessage(transport: SmtpTransport, message: string) {
        if (debugEnabled) {
            console.log("R: '" + message + "'");
        }
        const chars = message.split("").map(c => c.charCodeAt(0));
        if (!transport.transaction || transport.transaction.bodyEncoding === "7BIT") {
            if (!chars.every(c => c <= 127)) {
                this.send(transport, "500 Expected only 7 bit data.");
                return;
            }
        }
        for (let pos = 0; pos < chars.length; pos++) {
            if ((chars[pos] == 13 && chars[pos + 1] != 10) || (chars[pos] == 10 && chars[pos - 1] != 13)) {
                this.send(transport, "500 CRLF should only appear as a pair.");
                return;
            }
        }

        if (transport.transaction && transport.transaction.data !== null) {
            return this.processDATA(transport, message);
        }
        const commandType = message.split(' ')[0].toUpperCase();
        if (transport.transaction) {
            switch (commandType) {
                case "RCPT":
                    return this.processRCPT(transport, message);
                case "DATA":
                    return this.processDATA(transport, message);
            }
        }
        if (transport.hello) {
            switch (commandType) {
                case "MAIL":
                    return this.processMAIL(transport, message);
                case "STARTTLS":
                    return this.processSTARTTLS(transport, message);
                case "AUTH":
                    return this.processAUTH(transport, message);
            }
        }
        switch (commandType) {
            case "HELP":
                return this.processHELP(transport, message);
            case "HELO":
                return this.processHELO(transport, message);
            case "EHLO":
                return this.processEHLO(transport, message);
            case "RSET":
                return this.processRSET(transport, message);
            case "QUIT":
                return this.processQUIT(transport, message);
            case "RCPT":
            case "DATA":
            case "MAIL":
            case "STARTTLS":
            case "AUTH":
                this.send(transport, "503 Send hello first.")
                return;
            default:
                this.send(transport, "502 Command not implemented.");
        }

    }

    send(transport: SmtpTransport, message: string, errorHandler?: (error?: Error) => void) {
        if (debugEnabled) {
            console.log("S: '" + message + "'");
        }
        transport.write(message + "\r\n", errorHandler);
    }

    processHELP(transport: SmtpTransport, message: string) {
        this.send(transport, "214-This server supports the following commands:");
        this.send(transport, "214 HELO EHLO STARTTLS RCPT DATA RSET MAIL QUIT HELP AUTH");
    }

    processRSET(transport: SmtpTransport, message: string) {
        transport.transaction = null;
        this.send(transport, "250 OK")
    }

    processQUIT(transport: SmtpTransport, message: string) {
        transport.closing = true;
        this.send(transport, "221 Goodbye");
        transport.end();
    }

    processHELO(transport: SmtpTransport, message: string) {
        transport.hello = message;
        transport.transaction = null;
        this.send(transport, "250 OK")
    }

    processEHLO(transport: SmtpTransport, message: string) {
        transport.hello = message;
        transport.transaction = null;
        this.send(transport, "250-hello greets " + message.slice(5));
        if (!transport.secure) {
            this.send(transport, "250-STARTTLS");
        }
        if (transport.secure) {
            this.send(transport, "250-AUTH PLAIN");
        }
        this.send(transport, "250-8BITMIME");
        this.send(transport, "250 SMTPUTF8");
    }

    async processSTARTTLS(transport: SmtpTransport, message: string) {
        transport.setEncoding(null);
        delete transport["_readableState.decoder"];
        transport.removeAllListeners('data');
        transport.removeAllListeners('error');

        let localAddress = transport.localAddress;
        if (localAddress.startsWith("::ffff:")) {
            localAddress = localAddress.slice(7);
        }

        let domains;
        try {
            domains = await dns.promises.reverse(localAddress);
        } catch (error) { }
        const certificate = await Acme.getCertificate(domains);
        this.send(transport, "220 Ready to start TLS");
        const tlsTransport = new tls.TLSSocket(transport, {
            key: certificate.key,
            cert: certificate.cert,
            SNICallback: (serverName, callback) => {
                Acme.getCertificate([serverName]).then(certificate => {
                    callback(null, tls.createSecureContext(certificate));
                });
            },
            isServer: true,
            requestCert: false,
            rejectUnauthorized: false,
        }) as SmtpTransport;
        tlsTransport.setEncoding("utf8");
        tlsTransport.messageBuffer = "";
        tlsTransport.on("secure", () => {
            tlsTransport.secure = true;
        });
        tlsTransport.on('error', (error) => { if (!tlsTransport.closing) { console.log(error); } });
        tlsTransport.on('data', (data) => { this.onData(tlsTransport, data) });
    }

    async processAUTH(transport: SmtpTransport, message: string) {
        if (transport.auth === "") {
            transport.auth = message;
        } else {
            const parts = message.split(" ");
            if (parts[1].toUpperCase() != "PLAIN") {
                this.send(transport, "502 Only PLAIN auth is supported.");
                return;
            }
            if (!parts[2]) {
                transport.auth = "";
                this.send(transport, "334 ");
                return;
            }
            transport.auth = parts[2];
        }
        const authSplit = Buffer.from(transport.auth, "base64").toString("utf8").split("\0");
        transport.userName = authSplit[1];
        transport.password = authSplit[2];
        const user = await this.verifyAuth(transport.userName, transport.password);
        if (user) {
            transport.authenticated = user;
            this.send(transport, "235 Authentication successful.");
        } else {
            transport.authenticated = null;
            this.send(transport, "535 Authentication failed.");
        }
    }


    processMAIL(transport: SmtpTransport, message: string) {
        if (transport.transaction) {
            this.send(transport, "503 Sender already specified.");
            return;
        }

        message = message.slice(5).trim();

        if (message.substring(0, 5).toUpperCase() !== "FROM:") {
            this.send(transport, "501 MAIL command must be formatted like 'MAIL FROM:<address@domain>'.");
            return;
        }


        message = message.slice(5).trim();

        const messageSplit = message.split(" ").map(m => m.trim());

        message = messageSplit[0];
        let body: "7BIT" | "8BITMIME" = "7BIT";
        for (const param of messageSplit.slice(1)) {
            switch (param.toUpperCase()) {
                case "BODY=7BIT":
                    break;
                case "BODY=8BITMIME":
                    body = "8BITMIME";
                    break;
                default:
                    this.send(transport, "501 Unknown parameter: '" + param + "'.");
                    return;
            }
        }

        if (message[0] !== "<" || message[message.length - 1] !== ">") {
            this.send(transport, "501 MAIL command must be formatted like 'MAIL FROM:<address@domain>'.");
            return;
        }

        const reversePath = message.slice(1, message.length - 1);
        transport.transaction = new SmtpTransaction();
        transport.transaction.reversePath = reversePath;
        transport.transaction.bodyEncoding = body;
        transport.transaction.clientIP = transport.remoteAddress;
        transport.transaction.helo = transport.hello.slice(5);
        transport.transaction.protocol = (transport.hello.slice(0, 4).toLowerCase() === "helo" ? "SMTP" : "ESMTP") + (transport.secure ? "S" : "") + (transport.authenticated ? "A" : "")
        this.send(transport, "250 OK");
    }

    processRCPT(transport: SmtpTransport, message: string) {
        message = message.slice(5).trim();
        if (message.substring(0, 3).toUpperCase() !== "TO:") {
            this.send(transport, "501 RCPT command must be formatted like 'RCPT TO:<address@domain>'.");
            return;
        }

        message = message.slice(3).trim();
        if (message[0] !== "<" || message[message.length - 1] !== ">") {
            this.send(transport, "501 RCPT command must be formatted like 'RCPT TO:<address@domain>'.");
            return;
        }

        const rcpt = message.slice(1, message.length - 1);

        if (!(transport.authenticated || rcpt.toUpperCase().endsWith("@DEV.ELEVATEH.NET"))) {
            this.send(transport, "554 unable to relay for  <" + rcpt + ">.");
            return;
        }
        transport.transaction.forwardPaths.push(rcpt);
        this.send(transport, "250 OK");
    }

    async processDATA(transport: SmtpTransport, message: string) {
        if (transport.transaction.data === null) {
            transport.transaction.data = "";
            this.send(transport, "354 Start mail input; end with <CRLF>.<CRLF>");
        } else {
            if (message === ".") {
                await this.addReceivedHeader(transport);
                await this.addMailAuthHeaders(transport);
                if (await this.processTransaction(transport.transaction)) {
                    this.send(transport, "250 OK");
                } else {
                    this.send(transport, "500 Message not accepted");
                }
                transport.transaction = null;
            } else {
                if (message[0] == ".") { message = message.slice(1); }
                transport.transaction.data += message + "\r\n";
            }
        }
    }

    async addReceivedHeader(transport: SmtpTransport) {
        const helo = transport.transaction.helo;
        let remoteName = "";
        let remoteIP = transport.remoteAddress;
        if (remoteIP.startsWith("::ffff:")) {
            remoteIP = remoteIP.replace("::ffff:", "");
        }
        try {
            let remoteAddress = transport.remoteAddress;

            remoteName = (await dns.promises.reverse(remoteIP))[0];
            if (!remoteName) {
                if (remoteIP == "::1" || remoteIP == "127.0.0.1" || remoteIP == "::ffff:127.0.0.1") {
                    remoteName = os.hostname();
                }
            }
        } catch (error) { }

        let localIP = transport.localAddress;
        if (localIP.startsWith("::ffff:")) {
            localIP = localIP.replace("::ffff:", "");
        }
        let localName = "";
        try {
            localName = await (dns.promises.reverse(localIP))[0];
            if (!localName) {
                localName = os.hostname();
            }
        } catch (error) { }
        let protocol = transport.transaction.protocol;
        const cipher = transport.secure ? (transport as TLSSocket).getCipher() : null;
        protocol += cipher ? ` (version=${cipher.version}, cipher=${cipher.standardName})` : "";
        const _for = transport.authenticated ? `\r\n for <${transport.transaction.reversePath}>` : '';
        const id = crypto.randomUUID();
        const dateSplit = new Date().toString().split(" ");
        const timestamp = `${dateSplit[0]}, ${dateSplit[1]} ${dateSplit[2]} ${dateSplit[3]} ${dateSplit[4]} ${dateSplit[5].slice(3)}`;
        transport.transaction.data = `Received: from ${helo} (${remoteName} [${remoteIP}])\r\n by ${localName} (${localIP})\r\n with ${protocol}${_for}\r\n id ${id}; ${timestamp}\r\n${transport.transaction.data}`;
    }

    async addMailAuthHeaders(transport: SmtpTransport) {
        try {
            if (!transport.authenticated) {
                let ip = transport.remoteAddress;
                if (ip.startsWith("::ffff:")) {
                    ip = ip.replace("::ffff:", "");
                }
                const authResults = await mailauth.authenticate(
                    transport.transaction.data,
                    {
                        ip: ip,
                        helo: transport.transaction.helo,
                        sender: transport.transaction.reversePath,
                        mta: 'scotth-home.elevateh.net'
                    });
                transport.transaction.data = authResults.headers + transport.transaction.data;
                //TODO: arc sign
            } else {
                //TODO: dkim sign
            }
        } catch (error) {
            console.error(error);
        }
    }
}
