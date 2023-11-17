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
            tls: {rejectUnauthorized: false},
            auth: {
                user: "REPLACE-WITH-YOUR-ALIAS@YOURDOMAIN.COM",
                pass: "REPLACE-WITH-YOUR-GENERATED-PASSWORD",
            },
        });
        try{
        const info = await transporter.sendMail({
            from: '"Fred Foo 👻" <foo@example.com>', // sender address
            to: "bar@example.com, baz@example.com", // list of receivers
            subject: "Hello ✔", // Subject line
            text: "Hello world?", // plain text body
            html: "<b>Hello world?</b>", // html body
        });
    } catch(error){
        console.error(error);
    }
    }
}