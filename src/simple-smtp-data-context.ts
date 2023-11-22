import { Class, getColumns } from "./sql/expressions/index.js";
import { DataContext, QueryProvider } from "./sql/index.js";
import fs from 'fs';
import { IQueryable } from "./sql/queryable.interfaces.js";
import { Settings } from "./settings.js";
import { TransactionContext } from "./sql/data-context.js";
import { IConnection } from "./sql/connection-pool.js";
import { HttpContext } from "./web/shared/http-context.js";
import { User } from "./models/user.js";
export interface IDataObject {
    id: string;
    created: Date;
    createdBy: string;
    modified: Date;
    modifiedBy: string;
    deleted?: Date;
    deletedBy?: string;
}


export class SimpleSmtpDatacontext extends DataContext {

    constructor(private readonly user?: User) {
        if (!user && HttpContext.current) {
            user = HttpContext.current?.user;
        }
        const provider = new QueryProvider(Settings.connectionString);
        super(provider);
    }

    query<T>(elementType: Class<T>, includeDeleted = false): IQueryable<T> {
        let query = super.query(elementType);

        if (!includeDeleted) {
            const columns = getColumns(elementType);
            if (!columns) return;
            const deletedDateColumn = columns.find(c => c.columnName.toLowerCase() === "deleteddate");
            if (deletedDateColumn) {
                query = query.filter(`a => a.${deletedDateColumn.propertyName} === null`, {});
            }
        }
        return query;
    }
    protected async getTransactionContext(connection: IConnection): Promise<TransactionContext> {
        return new SimpleSmtpTransactionContext(this.provider, connection, this, this.user);
    }
}

export class SimpleSmtpTransactionContext extends TransactionContext {

    constructor(provider: QueryProvider, connection: IConnection, private readonly ssdc: SimpleSmtpDatacontext, private readonly user: User) {
        super(provider, connection);
    }

    private readonly systemUserId = '00000000-0000-0000-0000-000000000000';
    private get userId() {
        if (this.user && this.user.id) {
            return this.user.id;
        }
        return this.systemUserId;
    }

    async insert<T>(elementType: Class<T>, element: T & IDataObject, log?: boolean): Promise<void> {
        if (!element.id) {
            element.id = crypto.randomUUID();
        }
        if (!element.created) {
            element.created = new Date();
        }
        if (!element.createdBy) {
            element.createdBy = this.userId;
        }
        element.modified = new Date();
        HttpContext.current.user
        element.modifiedBy = this.userId;
        await super.insert(elementType, element, log);
    }

    async update<T>(elementType: Class<T>, element: T & IDataObject, log?: boolean): Promise<void> {
        if (!element.createdBy) {
            // this should always be set, but if it isn't, set it to the system user id.
            element.createdBy = this.systemUserId;
        }
        element.modified = new Date();
        element.modifiedBy = this.userId;
        await super.update(elementType, element, log);
    }

    async upsert<T>(elementType: Class<T>, element: T & IDataObject, log?: boolean): Promise<void> {
        const exists = element.id && (await this.ssdc.query(elementType).filter("q => q.id === element.id", { element }).map("q => q.id").toArray())[0];
        if (exists) {
            await this.update(elementType, element, log);
        }
        else {
            await this.insert(elementType, element, log);
        }
    }

    async delete<T>(elementType: Class<T>, element: T & IDataObject, log?: boolean): Promise<void> {
        const existing = (await this.ssdc.query(elementType).filter("q => q.id === element.id", { element }).toArray()) as T & IDataObject;
        if (existing) {
            existing.deleted = new Date();
            existing.deletedBy = this.userId;
            await super.delete(elementType, element, log);
        } else {
            throw new Error(`error deleting ${elementType.name} with id ${element.id}`);
        }
    }
}