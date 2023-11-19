import nodemailer from "nodemailer";

export class SmtpTestClient {

    constructor() {
        this.start();
    }
    async start() {
        const transporter = nodemailer.createTransport({
            host: "localhost",
            port: 25,
            secure: false,
            tls: { rejectUnauthorized: false },
            auth: {
                user: "REPLACE-WITH-YOUR-ALIAS@YOURDOMAIN.COM",
                pass: "REPLACE-WITH-YOUR-GENERATED-PASSWORD",
            },
        });
        try {
            const info = await transporter.sendMail({
                from: '"Test 👻" <test@dev.elevateh.net>',
                to: '"Scott Hellewell" <scooth@elevateh.com>',
                subject: "Test Subject",
                html: "Test Content<br/><br/>--Test",
            });
        } catch (error) {
            console.error(error);
        }
    }
}