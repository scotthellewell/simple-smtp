import { Class, getColumns } from "./sql/expressions/index.js";
import { DataContext, QueryProvider } from "./sql/index.js";
import fs from 'fs';
import { IQueryable } from "./sql/queryable.interfaces.js";
import { Settings } from "./settings.js";

export class SimpleSmtpDatacontext extends DataContext {

    constructor() {
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
}