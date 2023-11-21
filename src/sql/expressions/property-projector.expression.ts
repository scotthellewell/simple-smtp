import { CallExpression } from "./call.expression.js";
import { ColumnDeclaration } from "./column.expression.js";
import { ColumnExpression, Expression, Identifier } from "./index.js";
import { NewObjectExpression } from "./new-object.expression.js";

export class PropertyProjector extends Expression {
    public readonly type: 'PropertyProjector' = 'PropertyProjector';
    constructor(
        public readonly property: string,
        public readonly value: ColumnExpression | CallExpression | Identifier | NewObjectExpression | ColumnDeclaration
    ) {
        super();
    }
}