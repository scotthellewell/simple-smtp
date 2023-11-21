import nodemailer from "nodemailer";
import { Settings } from "./settings.js";

export class SmtpTestClient {

    constructor() {
        this.start();
    }
    async start() {
        
        const transporter = nodemailer.createTransport({
            host: "scotth2.elevateh.net",
            port: 25,
            secure: false,
            tls: { rejectUnauthorized: false },
            auth: {
                user: Settings.testUser,
                pass: Settings.testPassword,
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