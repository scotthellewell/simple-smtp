import { column, dataSource, QueryProvider, ConnectionPool, keyColumn } from "../sql/index.js";
@dataSource("user")
export class User {
    @keyColumn() id: string;
    @column() created: Date;
    @column() createdBy: string;
    @column() modified: Date;
    @column() modifiedBy: string;
    @column() deleted?: Date;
    @column() deletedBy?: string;
    @column() email: string;
    @column() firstName?: string;
    @column() lastName?: string;
    @column() displayName?: string;
    @column() lastLogin?: Date;
    @column() passwordHash?: string;
}