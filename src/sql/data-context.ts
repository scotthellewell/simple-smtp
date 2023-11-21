import { QueryProvider } from "./index.js";
import { IConnection } from "./connection-pool.js";
import { Class, ColumnExpression, getColumns, getDataSourceMetadata, SqlExpression } from "./expressions/index.js";
import { IQueryable } from "./queryable.interfaces.js";

export interface ITransactionContext {
    insertAsync<T>(elementType: Class<T>, element: T, log?: boolean): Promise<void>;
    updateAsync<T>(elementType: Class<T>, element: T, log?: boolean): Promise<void>;
    upsertAsync<T>(elementType: Class<T>, element: T, log?: boolean): Promise<void>;
    deleteAsync<T>(elementType: Class<T>, element: T, log?: boolean): Promise<void>;
}

export class TransactionContext implements ITransactionContext {
    constructor(
        protected readonly provider: QueryProvider,
        protected readonly connection: IConnection
    ) { }

    async insertAsync<T>(elementType: Class<T>, element: T, log = false) {
        const columns = getColumns(elementType);
        const datasourceMeta = getDataSourceMetadata(elementType);
        let text = `INSERT [${datasourceMeta.name}] (`;
        let firstColumn = true;
        for (const [index, column] of columns.filter(c => !c.isReadOnly || c.isKey).entries()) {
            if (column.defaultValue !== undefined && (element[column.propertyName] === undefined)) {
                element[column.propertyName] = column.defaultValue;
            }
            if (element[column.propertyName] !== undefined) {
                if (!firstColumn) {
                    text += ", ";
                }
                text += `[${column.columnName}]`;
                firstColumn = false;
            }
        }
        text += ") VALUES (";
        const parameters = [];
        let index = 0;
        for (const column of columns.filter(c => !c.isReadOnly || c.isKey)) {
            if (element[column.propertyName] !== undefined) {
                if (index > 0) {
                    text += ", ";
                }
                text += `@${index}`;;
                parameters.push(element[column.propertyName]);
                index++;
            }
        }
        text += ")";
        const expression = new SqlExpression(text, parameters);
        await this.provider.executeAsync(expression, this.connection, log)
    }

    async updateAsync<T>(elementType: Class<T>, element: T, log = false) {
        const columns = getColumns(elementType);
        const datasourceMeta = getDataSourceMetadata(elementType);
        const parameters = [];
        let text = `UPDATE [${datasourceMeta.name}]\n`;
        text += "SET ";
        for (const [index, column] of columns.filter(c => !c.isKey && !c.isReadOnly).entries()) {
            if (index > 0) {
                text += ", ";
            }
            text += `[${column.columnName}] = @${parameters.length}`;
            parameters.push(element[column.propertyName]);
        }
        text += "\nWHERE (";
        for (const [index, column] of columns.filter(c => c.isKey).entries()) {
            if (index > 0) {
                text += " AND ";
            }
            text += `[${column.columnName}] = @${parameters.length}`;
            parameters.push(element[column.propertyName]);
        }
        text += ")";
        const expression = new SqlExpression(text, parameters);
        await this.provider.executeAsync(expression, this.connection, log)
    }

    async upsertAsync<T>(elementType: Class<T>, element: T, log = false) {
        const columns = getColumns(elementType);
        const datasourceMeta = getDataSourceMetadata(elementType);
        const parameters = [];
        let text = "BEGIN TRANSACTION\n\n";
        text += `UPDATE [${datasourceMeta.name}] WITH (UPDLOCK, SERIALIZABLE)\n`;
        text += "SET ";
        for (const [index, column] of columns.filter(c => !c.isKey && !c.isReadOnly).entries()) {
            if (index > 0) {
                text += ", ";
            }
            text += `[${column.columnName}] = @${parameters.length}`;
            parameters.push(element[column.propertyName]);
        }
        text += "\nWHERE (";
        for (const [index, column] of columns.filter(c => c.isKey).entries()) {
            if (index > 0) {
                text += " AND ";
            }
            text += `[${column.columnName}] = @${parameters.length}`;
            parameters.push(element[column.propertyName]);
        }
        text += ")\n\n";
        text += "IF @@ROWCOUNT = 0 \n";
        text += "BEGIN\n";
        text += `    INSERT [${datasourceMeta.name}] (`;
        let index = 0;
        let firstColumn = true;
        for (const column of columns.filter(c => !c.isKey && !c.isReadOnly)) {
            if (element[column.propertyName] !== undefined) {
                if (!firstColumn) {
                    text += ", ";
                }
                text += `[${column.columnName}]`;
                firstColumn = false;
            }
            index++;
        }
        for (const column of columns.filter(c => c.isKey)) {
            if (!firstColumn) {
                text += ", ";
            }
            text += `[${column.columnName}]`;
            index++;
        }
        text += ")\n    VALUES (";
        index = 0;
        firstColumn = true;
        for (const column of columns.filter(c => !c.isKey && !c.isReadOnly)) {
            if (element[column.propertyName] !== undefined) {
                {
                    if (!firstColumn) {
                        text += ", ";
                    }
                    text += `@${index}`;
                    firstColumn = false;
                }
            }
            index++;
        }
        for (const column of columns.filter(c => c.isKey)) {
            if (!firstColumn) {
                text += ", ";
            }
            text += `@${index}`;
            index++;
        }
        text += ")\nEND\n\nCOMMIT TRANSACTION";
        const expression = new SqlExpression(text, parameters);
        await this.provider.executeAsync(expression, this.connection, log)
    }

    async deleteAsync<T>(elementType: Class<T>, element: T, log: boolean = false) {
        const columns = getColumns(elementType);
        const datasourceMeta = getDataSourceMetadata(elementType);
        const keys = columns.filter(c => c.isKey);

        const parameters = [];
        let text = `DELETE FROM [${datasourceMeta.name}] WHERE (`;
        for (const [index, column] of keys.entries()) {
            if (index > 0) {
                text += " AND ";
            }
            text += `[${column.columnName}]`;
            text += ` = @${index}`;
            parameters.push(element[column.propertyName]);
        }
        text += ")";
        const expression = new SqlExpression(text, parameters);
        await this.provider.executeAsync(expression, this.connection, log)
    }

    async beginTransactionAsync() {
        await this.connection.beginTransactionAsync();
    }

    async commitTransactionAsync() {
        await this.connection.commitTransactionAsync();
    }

    async rollbackTransactionAsync() {
        await this.connection.rollbackTransactionAsync();
    }
}

export class DataContext {
    constructor(
        protected readonly provider: QueryProvider
    ) { }

    async executeTransactionAsync<T>(transactionFunction: (context: ITransactionContext) => Promise<T>) {
        const connection = await this.provider.getConnectionAsync();
        try {
            const context = await this.getTransactionContext(connection);
            let result: T;
            try {
                await context.beginTransactionAsync();
                result = await transactionFunction(context);
                await context.commitTransactionAsync();
                return result;
            } catch (err) {
                await context.rollbackTransactionAsync();
                throw err;
            }
        }
        finally {
            await connection.closeAsync();
        }
    }

    query<T>(elementType: Class<T>): IQueryable<T> {
        return this.provider.query(elementType);
    }

    async querySqlAsync<T>(elementType: Class<T>, sql: string, parameters: any[]) {
        const items = await this.provider.executeAsync<any[]>(new SqlExpression(sql, parameters));
        const results: T[] = [];
        if (items.length > 0) {
            const columns = getColumns(elementType);
            const mappings: any = {};
            for (const prop in items[0]) {
                const column = columns?.find(c => c.columnName.toLowerCase() === prop.toLowerCase());
                if (column) {
                    mappings[prop] = [column.propertyName];
                } else {
                    mappings[prop] = prop[0].toLowerCase() + prop.substring(1);
                }
            }

            for (const item of items) {
                const result = new elementType();
                for (const prop in mappings) {
                    result[mappings[prop]] = item[prop];
                }
                results.push(result);
            }
        }
        return results;
    }

    protected async getTransactionContext(connection: IConnection): Promise<TransactionContext> {
        return new TransactionContext(this.provider, connection);
    }

}

interface ColumnInformation { tableName: string, columnName: string, type: string, }
