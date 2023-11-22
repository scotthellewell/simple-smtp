import { Connection, Request, TediousType, TYPES } from "tedious";
import { parseSqlConnectionString } from '@tediousjs/connection-string'
import { DatabaseExpressionVisitor } from "./expression-visitors/database-expression.visitor.js";
import { ProjectorVisitor } from "./expression-visitors/projector.visitor.js";
import { SqlExpressionVisitor } from "./expression-visitors/sql-expression.visitor.js";
import { Class, DataSource, Expression, SelectExpression } from "./expressions/index.js";
import { IQueryable, IQueryProvider } from "./queryable.interfaces.js";
import { Query } from "./query.js";
import { ConnectionPool, ICommand, IConnection } from "./connection-pool.js";
import { GroupingVisitor } from "./expression-visitors/grouping.visitor.js";
// import fs from "fs";

export class QueryProvider implements IQueryProvider {

    constructor(private connectionString: string) { }

    getConnection(): Promise<IConnection> {
        return ConnectionPool.getConnection(this.connectionString);
    }

    createQuery<T>(expression: Expression, connection?: IConnection): IQueryable<T> {
        return new Query(this, expression, connection);
    }

    query<T>(dataSource: Class<T>, connection?: IConnection): IQueryable<T> {
        return this.createQuery(new DataSource(dataSource), connection);
    }

    async execute<TResult>(expression: Expression, connection?: IConnection, log = false): Promise<TResult> {
        const dbVisitor = new DatabaseExpressionVisitor();
        const sqlVisitor = new SqlExpressionVisitor();
        const projectorVisitor = new ProjectorVisitor();
        const dbExpression = dbVisitor.execute(expression) as SelectExpression;
        const sqlExpression = sqlVisitor.translate(dbExpression);
        if (log) {
            console.debug(sqlExpression);
            console.debug(sqlExpression.parameters);
            console.debug(sqlExpression.text);
            // fs.writeFileSync("text.sql", sqlExpression.text);
        }
        let rows: any;

        if (!connection) {
            connection = await this.getConnection();
            rows = await connection.execute(sqlExpression);
            await connection.close();
        } else {
            rows = await connection.execute(sqlExpression);
        }
        if (!dbExpression.projector) {
            return rows;
        }
        const projectedRows = [];
        for (const row of rows) {
            const projectedRow = projectorVisitor.project(row, dbExpression.columns, dbExpression.projector);
            projectedRows.push(projectedRow);
        }
        if (dbExpression.projector) {
            const groupingVisitor = new GroupingVisitor();
            const groupedRows = groupingVisitor.groupResults(projectedRows, dbExpression.projector);
            if (log) {
                console.debug(groupedRows);
            }
            return groupedRows as any as TResult;
        }
    }
}
