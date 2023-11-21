import { Class, Expression } from "./index.js";

export class DataSource<T> extends Expression {
    type: 'DataSource' = 'DataSource';
    constructor(public readonly elementType: Class<T>) {
        super();
    }
}