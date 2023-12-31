import { QueryProvider } from "./index.js";
import { IConnection } from "./connection-pool.js";
import { Class, ColumnExpression, getColumns, getDataSourceMetadata, SqlExpression } from "./expressions/index.js";
import { IQueryable } from "./queryable.interfaces.js";

export interface ITransactionContext {
    insert<T>(elementType: Class<T>, element: T, log?: boolean): Promise<void>;
    update<T>(elementType: Class<T>, element: T, log?: boolean): Promise<void>;
    upsert<T>(elementType: Class<T>, element: T, log?: boolean): Promise<void>;
    delete<T>(elementType: Class<T>, element: T, log?: boolean): Promise<void>;
}

export class TransactionContext implements ITransactionContext {
    constructor(
        protected readonly provider: QueryProvider,
        protected readonly connection: IConnection
    ) { }

    async insert<T>(elementType: Class<T>, element: T, log = false) {
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
        await this.provider.execute(expression, this.connection, log)
    }

    async update<T>(elementType: Class<T>, element: T, log = false) {
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
        await this.provider.execute(expression, this.connection, log)
    }

    async upsert<T>(elementType: Class<T>, element: T, log = false) {
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
        await this.provider.execute(expression, this.connection, log)
    }

    async delete<T>(elementType: Class<T>, element: T, log: boolean = false) {
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
        await this.provider.execute(expression, this.connection, log)
    }

    async beginTransaction() {
        await this.connection.beginTransaction();
    }

    async commitTransaction() {
        await this.connection.commitTransaction();
    }

    async rollbackTransaction() {
        await this.connection.rollbackTransaction();
    }
}

export class DataContext {
    constructor(
        protected readonly provider: QueryProvider
    ) { }

    async executeTransaction<T>(transactionFunction: (context: ITransactionContext) => Promise<T>) {
        const connection = await this.provider.getConnection();
        try {
            const context = await this.getTransactionContext(connection);
            let result: T;
            try {
                await context.beginTransaction();
                result = await transactionFunction(context);
                await context.commitTransaction();
                return result;
            } catch (err) {
                await context.rollbackTransaction();
                throw err;
            }
        }
        finally {
            await connection.close();
        }
    }

    query<T>(elementType: Class<T>): IQueryable<T> {
        return this.provider.query(elementType);
    }

    async querySql<T>(elementType: Class<T>, sql: string, parameters: any[]) {
        const items = await this.provider.execute<any[]>(new SqlExpression(sql, parameters));
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
