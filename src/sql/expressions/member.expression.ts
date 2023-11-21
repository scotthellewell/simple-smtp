import { Expression, Identifier } from "./index.js";

export class MemberExpression extends Expression {
    public readonly type: 'MemberExpression' = 'MemberExpression';
    constructor(
        public readonly object: Expression,
        public readonly property: Identifier
    ) {
        super();
    }
}
