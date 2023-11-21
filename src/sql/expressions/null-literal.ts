import { Expression } from "./index.js";

export class NullLiteral extends Expression {
    public readonly type: "NullLiteral" = "NullLiteral"; 
}