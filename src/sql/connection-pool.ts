import { parseSqlConnectionString } from "@tediousjs/connection-string";
import { Connection, ISOLATION_LEVEL, Request, TediousType, TYPES } from "tedious";
import { Mutex } from "async-mutex";

export class ConnectionPool {
    private static poolsMutex = new Mutex();
    private static connectionPools: ConnectionPool[] = [];
    private static async getPool(connectionString: string): Promise<ConnectionPool> {
        let pool = this.connectionPools.find(p => p.connectionString === connectionString);
        if (pool) {
            return pool;
        }
        await this.poolsMutex.runExclusive(() => {
            pool = this.connectionPools.find(p => p.connectionString === connectionString);
            if (pool) {
                return pool;
            }
            pool = new ConnectionPool(connectionString);
            this.connectionPools.push(pool);
        });
        return pool
    }


    private static releaseUnusedConnections() {
        let count = 0;
        for (const pool of this.connectionPools) {
            pool.releaseUnusedConnections();
            count += pool.used.length + pool.available.length;
        }
        if (count === 0) {
            this.timeout = null;
        } else {
            this.timeout = setTimeout(() => { this.releaseUnusedConnections(); }, 10000);
        }
    }

    private static timeout;
    static async getConnection(connectionString: string): Promise<IConnection> {
        if (!this.timeout) {
            this.timeout = setTimeout(() => { this.releaseUnusedConnections(); }, 1000);
        }

        const pool = await this.getPool(connectionString);
        return pool.getConnection();
    }

    static releaseConnection(connection: IConnection, removeFromPool = false) {
        const pool = this.connectionPools.find(p => p.connectionString === (connection as PooledConnection).connectionString);
        pool.releaseConnection(connection as PooledConnection, removeFromPool);
    }

    static async drainPools() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        for (const pool of this.connectionPools) {
            pool.drainPool();
        }
    }

    private constructor(private connectionString: string) { }

    releaseUnusedConnections() {
        const now = new Date().getTime();
        this.poolMutex.runExclusive(() => {
            for (const connection of this.available) {
                if (now - connection.released.getTime() > 30000) {
                    this.available.splice(this.available.indexOf(connection), 1);
                    try {
                        connection.connection.close();
                    } catch (error) { }
                }
            }
        });
    }

    poolMutex = new Mutex();
    async getConnection(): Promise<IConnection> {
        let connection: PooledConnection;
        await this.poolMutex.runExclusive(async () => {

            for (const connection of this.available) {
                if (!connection.isValid) {
                    this.available.splice(this.available.indexOf(connection), 1);
                }
            }

            if (this.available.length > 0) {
                connection = this.available.pop();
                connection.released = null;
                this.used.push(connection);
            } else {
                connection = new PooledConnection(this.connectionString);
                await connection.connectAsync();
                this.used.push(connection);
            }
        });
        return connection;
    }

    async releaseConnection(connection: PooledConnection, removeFromPool = false) {
        await this.poolMutex.runExclusive(() => {
            if (this.used.indexOf(connection) >= 0)
                this.used.splice(this.used.indexOf(connection), 1);
            if (this.available.indexOf(connection) >= 0)
                this.used.splice(this.available.indexOf(connection), 1);
            connection.released = new Date();
            if (removeFromPool) {
                connection.connection.close();
            } else {
                this.available.push(connection);
            }
        });
    }

    async drainPool() {
        while (this.available.length > 0) {
            const connection = this.available.pop();
            await this.releaseConnection(connection, true);
        }
        while (this.used.length > 0) {
            const connection = this.used.pop();
            await this.releaseConnection(connection, true);
        }
    }

    available: PooledConnection[] = [];
    used: PooledConnection[] = [];
}

export interface IConnection {
    // execSql(request: Request): Promise<any>;
    closeAsync(): Promise<void>;
    beginTransactionAsync(): Promise<void>;
    commitTransactionAsync(): Promise<void>;
    rollbackTransactionAsync(): Promise<void>;
    executeAsync(command): Promise<any>;
}

export interface ICommand {
    text: string;
    parameters: any[];
}

class PooledConnection implements IConnection {

    async beginTransactionAsync(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.connection.beginTransaction(err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            }, "", ISOLATION_LEVEL.READ_UNCOMMITTED);
        });
    }

    async commitTransactionAsync(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.connection.commitTransaction(err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async rollbackTransactionAsync(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.connection.rollbackTransaction(err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    private uuidRegEx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    async executeAsync(command: ICommand): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            const request = new Request(command.text, (err, rowCount) => {
                if (err) {
                    reject(err);
                }
            });
            if (command.parameters) {
                for (let [index, value] of command.parameters.entries()) {
                    let type: TediousType;
                    let precision: number;
                    let scale: number
                    switch (typeof value as string) {
                        case "bigint":
                            type = TYPES.BigInt; break;
                        case "boolean":
                            type = TYPES.Bit; break;
                        case "number":
                            type = Number.isInteger(value) ? TYPES.Int : TYPES.Decimal;
                            if (type == TYPES.Decimal) {
                                const length = Math.floor(value).toString().length;
                                precision = 18;
                                scale = 18 - length;
                            }
                            break;
                        case "string":
                            if (this.uuidRegEx.test(value)) {
                                type = TYPES.UniqueIdentifier; break;
                            }
                            type = TYPES.NVarChar; break;
                        case "object":
                            if (value === null) {
                                type = TYPES.NVarChar;
                                break;
                            }
                            switch (value.constructor.name) {
                                case "Date":
                                    type = TYPES.DateTime; break;
                                default:
                                    throw new Error("Type '" + value.constructor.name + "' not implemented.")
                            }
                            break;
                        default:
                            if (value === undefined) {
                                type = TYPES.NVarChar;
                                value = null;
                            } else {
                                throw new Error("Type '" + typeof value + "' not implemented.")
                            }
                    }
                    request.addParameter(index.toString(), type, value, { precision, scale });
                }
            }
            const results = [];
            request.on("error", err => reject(err));
            request.on("row", columns => {
                let row: any = {}
                for (const column of columns) {
                    row[column.metadata.colName] = column.value;
                }
                results.push(row);
            });
            request.on("requestCompleted", () => {
                resolve(results);
            });
            this.connection.execSql(request);
        });
    }

    released: Date;
    connection: Connection;

    constructor(public connectionString: string) {
        const cs = parseSqlConnectionString(connectionString);
        let server = cs["server"] as string;
        if (server.startsWith("tcp:")) { server = server.substring(4); }
        const split = server.split(',');
        server = split[0];
        const port: number = split.length > 1 ? Number.parseInt(split[1]) : 1433;
        this.connection = new Connection({
            authentication: { options: { userName: cs["user id"], password: cs["password"] }, type: "default" },
            server: server,
            options: {
                database: cs["initial catalog"], encrypt: cs["encrypt"], trustServerCertificate: false, port: port, lowerCaseGuids: true, packetSize: 16368, keepactive: true, requestTimeout: 0
            } as any
        });
    }

    get isValid() {
        const closed = this.connection["closed"];
        return !closed;
    }

    async connectAsync() {
        return new Promise<void>((resolve, reject) => {
            this.connection.connect(err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async closeAsync(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.connection.reset(err => {
                if (err) {
                    ConnectionPool.releaseConnection(this, true);
                } else {
                    ConnectionPool.releaseConnection(this);
                }
                resolve();
            });
        });
    }
}
