import { CallExpression } from "./call.expression.js";
import { Class, Expression } from "./index.js";

export class ColumnExpression extends Expression {
    readonly type: 'Column' = 'Column';
    constructor(
        public readonly columnName: string,
        public readonly propertyName: string,
        public readonly isKey = false,
        public readonly isReadOnly = false,
        public defaultValue = undefined,
    ) {
        super();
    }
}

export class ColumnDeclaration extends Expression {
    readonly type: 'ColumnDeclaration' = 'ColumnDeclaration';
    constructor(
        public readonly alias: string,
        public readonly name: string,
        public readonly expression: ColumnExpression | CallExpression) {
        super();
    }
}

const columnsSymbol = Symbol("ColumnSymbol");
export const getColumns = (classDef: Class<unknown>): ColumnExpression[] => {
    if (!classDef) return;
    return classDef.prototype[columnsSymbol];
};

export const column = (columnName?: string) => <T>(target: T & any, key: keyof T) => {
    if (!target[columnsSymbol]) {
        target[columnsSymbol] = [];
    }
    target[columnsSymbol].push(new ColumnExpression(columnName ?? key as string, key as string, false, false));
};

export const keyColumn = (columnName?: string) => <T>(target: T & any, key: keyof T) => {
    if (!target[columnsSymbol]) {
        target[columnsSymbol] = [];
    }
    target[columnsSymbol].push(new ColumnExpression(columnName ?? key as string, key as string, true, true));
};

export const readOnlyColumn = (columnName?: string) => <T>(target: T & any, key: keyof T) => {
    if (!target[columnsSymbol]) {
        target[columnsSymbol] = [];
    }
    target[columnsSymbol].push(new ColumnExpression(columnName ?? key as string, key as string, false, true));
};

interface DataSourceMetadata {
    name: string;
}

const dataSourceSymbol = Symbol("DataSourceSymbol")
export const getDataSourceMetadata = (object: Class<unknown>): DataSourceMetadata => {
    const dataSource = object.prototype[dataSourceSymbol];
    if (dataSource) {
        return dataSource;
    }
    return { name: object.constructor.name };
}

export const dataSource = (tableName?: string) => (constructor: Function) => {
    constructor.prototype[dataSourceSymbol] = { name: tableName ? tableName : constructor.name } as DataSourceMetadata;
};
