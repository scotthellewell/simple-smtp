import { IConnection } from "./connection-pool.js";
import { Class, DataSource, Expression } from "./expressions/index.js";

export interface IQueryProvider {
    getConnectionAsync(): Promise<IConnection>
    createQuery<T>(expression: Expression, connection?: IConnection): IQueryable<T>;
    query<T>(dataSource: Class<T>, connection?: IConnection): IQueryable<T>
    executeAsync<TResult>(expression: Expression, connection?: IConnection, log?: boolean): Promise<TResult>;
}

export interface IQueryable<T> {
    /**
     * Executes the query and returns a promise to its results.
     */
    toArrayAsync(log?: boolean): Promise<T[]>;
    toDataBaseExpression(): Expression;
    expression: Expression;
    provider: IQueryProvider;

    /**
     * Adds a filter to a query.
     * @param predicate - arrow function that returns what items should be included.
     * @param scope - include any items needing to be evaluated from local scope.
     */
    filter(predicate: string | ((value: T) => boolean), scope: any): IQueryable<T>;

    /**
     * Adds a sort to a query.
     * @param property - arrow function returning property to sort on.
     * @param direction  - the direction to sort, accepts ('Ascending' | 'Descending'). Defaults to Ascending if nto specified.
     */
    sort(property: string | ((value: T) => any), direction?: 'Ascending' | 'Descending'): IQueryable<T>;

    /**
     * Maps the results of a query into a new form.
     * @param projection - arrow function the projects to the new form.
     */
    map<TResult>(projection: string | ((value: T) => TResult)): IQueryable<TResult>;

    /**
     * Joins an IQueryable to an existing IQueryable returning a new combined IQueryable
     * @param query - query to join to the existing query.
     * @param on - arrow function that defines the join
     * @param map - arrow function projecting the new object structure
     * @param scope - include any items needing to be evaluated from local scope.
     */
    join<TQuery, TResult>(type: 'Inner' | 'Outer', right: IQueryable<TQuery>, on: (left: T, query: TQuery) => boolean, map: (left: T, right: TQuery) => TResult, scope: any): IQueryable<TResult>;

    /**
     * Returns a slice of the rows from a query.
     * @param start - rownumber of the first row you want to receive
     * @param end - rownumber of the last row you want to receive
     */
    slice(start: number, end: number): IQueryable<T>;

    groupBy<TKey, TAggregates, TResult>(
        key: (element: T) => TKey,
        aggregates: (group: IGrouping<T>) => TAggregates,
        map: (key: TKey, aggregates: TAggregates, elements: T[]) => TResult): IQueryable<TResult>;

    distinct(): IQueryable<T>;

}
export interface IGrouping<T> {
    toArray(): T[];
    map<TResult>(mapFunction: (value: T) => TResult): TResult[];
    sum(property: (value: T) => number): number;
    average(property: (value: T) => number): number;
    count(property: (value: T) => number | string): number;
    distinctSum(property: (value: T) => number): number;
    distinctAverage(property: (value: T) => number): number;
    distinctCount(property: (value: T) => number | string): number;
    max<TResult extends number | string>(property: (value: T) => TResult): TResult;
    min<TResult extends number | string>(property: (value: T) => TResult): TResult;
    join(property: (value: T) => string, separator: string): string;
}


