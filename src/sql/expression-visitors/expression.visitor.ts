
import { ArrowFunctionExpression, UnaryExpression, BinaryExpression, CallExpression, Expression, Identifier, MemberExpression, NewObjectExpression, SelectExpression } from "../expressions/index.js";

export const params = Symbol("Scope_Params");

export const paramValues = Symbol("Scope_Identifier");

export interface Scope extends Record<string, any> {
    [params]?: string[];
    [paramValues]?: any[];
}

export abstract class ExpressionVisitor<T> {

    protected visit(exp: Expression, scope?: Scope): T {
        if (exp === null || exp === undefined) { return null; }
        const visitMethod = this["visit" + exp.type];
        if (visitMethod) {
            return visitMethod.bind(this)(exp, scope) as T;
        }
        throw new Error(`visit${exp.type} not implemented on ${this.constructor.name}.`);
    }

    protected visitCallExpression(call: CallExpression, scope?: Scope): T {
        scope = { ...scope, ...call.scope };
        const callMethod = this[`call${call.callee.property.name.charAt(0).toUpperCase()}${call.callee.property.name.substring(1)}`];
        if (callMethod) {
            return callMethod.bind(this)(call, scope);
        }
        throw new Error(`call${call.callee.property.name.charAt(0).toUpperCase()}${call.callee.property.name.substring(1)} was not implemented on ${this.constructor.name}`)
    }

    protected visitOperator(operator: string) {
        return operator;
    }

    protected visitArrowFunctionExpression(arrow: ArrowFunctionExpression, scope: Scope): T {
        return this.visit(arrow.body, { ...scope, ...{ [params]: arrow.params.map(p => p.name) } });
    }

    protected visitBinaryExpression(binary: BinaryExpression, scope: Scope) {
        this.visit(binary.left, scope);
        this.visitOperator(binary.operator);
        this.visit(binary.right, scope);
        return binary;
    }

    protected visitUnaryExpression(unary: UnaryExpression, scope: Scope) {
        this.visit(unary.argument, scope);
        return unary;
    }

    protected getIdentifiers(member: MemberExpression | Identifier) {
        let identifiers: string[] = [];
        let expression: MemberExpression | Identifier | any = member;
        while (expression.type === "MemberExpression") {
            identifiers.push((expression.property.name));
            member = expression;
            expression = expression.object as MemberExpression;
        }
        if (expression.type === "Identifier") {
            identifiers.push((expression as Identifier).name);
        } else if (expression.type === "ThisExpression") {
            identifiers.push("this");
        }
        return identifiers.reverse();
    }

    protected resolveFromScope(identifiers: string[], scope?: Scope) {
        if (!scope || !identifiers || identifiers.length === 0) { return undefined; }
        let value: any;
        if (scope[params] && scope[params].indexOf(identifiers[0]) !== -1) {
            const index = scope[params].indexOf(identifiers.shift());
            value = scope[paramValues][index];
        } else if (scope[identifiers[0]] !== undefined) {
            value = scope[identifiers.shift()];
        } else {
            return undefined;
        }
        let selects: SelectExpression[] = [];
        if (typeof value === "object" && value.constructor.name === "SelectExpression") {
            selects.push(value as SelectExpression);
            value = value.projector;
        }
        for (const identifier of identifiers) {
            if (typeof value === "object" && value.constructor.name === "NewObjectExpression") {
                const newObject = value as NewObjectExpression;
                value = newObject.propertyProjectors.find(p => p.property === identifier).value;
            }
            else {
                value = value[identifier];
            }
            if (typeof value === "object" && value.constructor.name === "SelectExpression") {
                selects.push(value as SelectExpression);
                value = value.projector;
            }
        }
        if (typeof value === "object" && value?.constructor?.name === "Identifier") {
            for (const select of selects) {
                const column = select.columns.find(c => c.name === (value as Identifier).name && c.expression.type === "Column");
                if (column) return column;
            }
        }
        return value;
    }
}