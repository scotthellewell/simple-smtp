import fs from 'fs'
export class Settings {

    static #settings: { connectionString?: string, testUser?: string, testPassword?: string, domain: string };

    static get connectionString() {
        let connectionString = process.env.SQLAZURECONNSTR_SimpleSmtp;
        this.#loadSettings();
        if (!connectionString) {
            connectionString = this.#settings.connectionString;
        }
        return connectionString;
    }

    static #loadSettings() {
        if (!this.#settings) {
            const connectionStringFilePath = "./settings/settings.json";
            const buffer = fs.readFileSync(connectionStringFilePath);
            this.#settings = JSON.parse(buffer.toString());
        }
    }

    static get testUser() {
        this.#loadSettings();
        return this.#settings.testUser;
    }

    static get testPassword() {
        this.#loadSettings();
        return this.#settings.testPassword;
    }

    static get domain() {
        this.#loadSettings();
        return this.#settings.domain;
    }
}