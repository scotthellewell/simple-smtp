import { Expression } from "./index.js";

export class SqlExpression extends Expression {
    public readonly type: 'Sql' = "Sql";
    constructor(
        public readonly text: string,
        public readonly parameters: readonly any[]
    ) {
        super();
    }
}
