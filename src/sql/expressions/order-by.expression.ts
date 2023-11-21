import { ColumnDeclaration, Expression, Identifier } from "./index.js";
import { StringLiteral } from "./string-literal.js";

export class OrderByExpression extends Expression {
    public readonly type: 'OrderByExpression' = 'OrderByExpression';
    constructor(
        public readonly property: ColumnDeclaration,
        public readonly direction: StringLiteral
    ) {
        super();
    }
}