import { Expression, Identifier, MemberExpression, ObjectExpression } from "./index.js";

export class ObjectProperty extends Expression {
    public readonly type: 'ObjectProperty' = "ObjectProperty";
    constructor(
        public readonly key: Identifier,
        public readonly value: ObjectExpression | MemberExpression | Identifier
    ) {
        super();
    }
}
