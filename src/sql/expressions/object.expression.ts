
import { Expression, ObjectProperty } from "./index.js";

export class ObjectExpression extends Expression {
    public readonly type: 'ObjectExpression' = "ObjectExpression";
    constructor(public readonly properties: readonly ObjectProperty[]) {
        super();
    }
}