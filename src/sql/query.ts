import { parseExpression } from "@babel/parser";
import { IConnection } from "./connection-pool.js";
import { DatabaseExpressionVisitor } from "./expression-visitors/database-expression.visitor.js";
import { CallExpression, Expression, NullLiteral, StringLiteral } from "./expressions/index.js";
import { NumericLiteral } from "./expressions/numeric-literal.js";
import { IGrouping, IQueryable, IQueryProvider } from "./queryable.interfaces.js";
export class Query<T> implements IQueryable<T>{

    constructor(
        public readonly provider: IQueryProvider,
        public readonly expression: Expression,
        public readonly connection?: IConnection,
    ) {
        if (!provider) { throw new Error("provider is required."); }
        if (!expression) { throw new Error("expression is required."); }
    }

    async toArrayAsync(log: boolean): Promise<T[]> {
        return await this.provider.executeAsync<T[]>(this.expression, this.connection, log);
    }

    toDataBaseExpression(): Expression {
        const visitor = new DatabaseExpressionVisitor();
        return visitor.execute(this.expression);
    }

    filter(predicate: string | ((value: T) => boolean), scope?: any): IQueryable<T> {
        const predicateExpression = parseExpression(predicate.toString());
        const call = new CallExpression(this.expression, "filter", [predicateExpression], scope);
        return this.provider.createQuery(call, this.connection);
    }

    slice(start: number, end: number): IQueryable<T> {
        const startLiteral = start ? new NumericLiteral(start) : new NullLiteral();
        const endLiteral = end ? new NumericLiteral(end) : new NullLiteral();
        const call = new CallExpression(this.expression, "slice", [startLiteral, endLiteral], null);
        return this.provider.createQuery(call, this.connection);
    }

    sort(property: string | ((value: T) => any), direction: 'Ascending' | 'Descending' = 'Ascending'): IQueryable<T> {
        const propertyExpression = parseExpression(property.toString()) as Expression;
        const call = new CallExpression(this.expression, "sort", [propertyExpression, new StringLiteral(direction)], null);
        return this.provider.createQuery(call, this.connection);
    }

    map<TResult>(projection: string | ((value: T) => TResult), scope?: any): IQueryable<TResult> {
        const projectionExpression = parseExpression(projection.toString());
        const call = new CallExpression(this.expression, "map", [projectionExpression], scope);
        return this.provider.createQuery(call, this.connection);
    }

    join<TRight, TResult>(type: 'Inner' | 'Outer', right: IQueryable<TRight>, on: (left: T, right: TRight) => boolean, map: (left: T, right: TRight) => TResult, scope?: any): IQueryable<TResult> {
        const onExpression = parseExpression(on.toString());
        const mapExpression = parseExpression(map.toString());
        const call = new CallExpression(this.expression, 'join', [right.expression, onExpression, mapExpression, new StringLiteral(type)], scope);
        return this.provider.createQuery(call, this.connection);
    }


    groupBy<TKey, TAggregates, TResult>(
        key: (element: T) => TKey,
        aggregates: (group: IGrouping<T>) => TAggregates,
        map: (key: TKey, aggregates: TAggregates, elements: T[]) => TResult): IQueryable<TResult> {

        if (!aggregates) {
            aggregates = (g: IGrouping<T>) => ({} as TAggregates);
        }
        const keyExpression = parseExpression(key.toString());
        const aggregatesExpression = parseExpression(aggregates?.toString());
        const mapExpression = parseExpression(map.toString());
        const call = new CallExpression(this.expression, "groupBy", [keyExpression, aggregatesExpression, mapExpression], { __param_map: map });
        return this.provider.createQuery(call, this.connection);
    }

    distinct(): IQueryable<T> {
        return this.provider.createQuery(new CallExpression(this.expression, "distinct", [], {}), this.connection);
    }

}