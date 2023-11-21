import { CallExpression, ColumnDeclaration, ColumnExpression, ConditionalExpression, GroupingExpression, Identifier, MemberExpression, NewExpression, NewObjectExpression, ObjectExpression, SelectExpression } from "../expressions/index.js";
import { ExpressionVisitor, paramValues, Scope } from "./expression.visitor.js";

export class ProjectorColumnVisitor extends ExpressionVisitor<any>{
    private columns: ColumnDeclaration[];
    private includeReferenced: boolean;
    private select: SelectExpression;

    getColumns(select: SelectExpression, includeReferenced = false) {
        this.select = select;
        this.includeReferenced = includeReferenced;
        this.columns = [];
        this.visit(select.projector);
        if (select.where) {
            this.visit(select.where);
        }
        for (const orderBy of select.orderBy) {
            this.visit(orderBy.property);
        }
        for (const join of select.joins) {
            this.visit(join.on);
        }
        return this.columns;
    }

    visitundefined(object, scope) {

    }

    private visitNewObject(newObject: NewObjectExpression, scope: Scope) {
        const value = {};
        for (const property of newObject.propertyProjectors) {
            value[property.property] = this.visit(property.value);
        }
        return value;
    }


    private visitConditionalExpression(conditionalExpression: ConditionalExpression) {
        return conditionalExpression;
    }

    private visitIdentifier(identifier: Identifier, scope: Scope) {
        if (scope && scope[identifier.name] !== undefined) {
            return scope[identifier.name];
        }
        const columnDeclaration = this.select.columns.find(c => c.name === identifier.name);
        this.visitColumnDeclaration(columnDeclaration, scope);
        return columnDeclaration;
    }

    private visitColumnDeclaration(columnDeclaration: ColumnDeclaration, scope: Scope) {
        if (columnDeclaration != null) {
            let existing;
            existing = this.select.columns.find(c => c.name === columnDeclaration.name);
            if (existing && this.columns.indexOf(existing) < 0) {
                this.columns.push(existing);
            }
            if (columnDeclaration.expression.type === "Column") {
                return existing;
            } else {
                return this.visit(columnDeclaration.expression);
            }
        }
    }

    private visitColumn(column: ColumnExpression, scope: Scope) {
        const existing = this.select.columns.find(c => c.name == column.columnName);
        if (existing && this.columns.indexOf(existing) < 0) {
            this.columns.push(existing);
        }
        return existing;
    }

    private visitMemberExpression(member: MemberExpression, scope: Scope) {
        const identifiers = this.getIdentifiers(member);
        const value = this.resolveFromScope(identifiers, scope);
        this.visitValue(value, scope);
        return member;
    }

    private visitGrouping(grouping: GroupingExpression) {
        const columns = this.columns;
        const key = this.visit(grouping.key);
        const aggregates = this.visit(grouping.aggregates);
        this.columns = [];
        const elements = this.visit(grouping.elements);
        this.columns = columns;
        this.visit(grouping.map, { [paramValues]: [key, aggregates, elements] });
    }

    private visitObjectExpression(objectExpression: ObjectExpression, scope: Scope) {
        let object = null;
        for (const property of objectExpression.properties) {
            if (property.value.type === "Identifier") {
                const identifiers = this.getIdentifiers(property.value);
                const value = this.resolveFromScope(identifiers, scope);
                this.visitValue(value, scope);
            }
            else {
                this.visit(property.value, scope);
            }
        }
        return null;
    }

    private visitValue(value: any, scope: Scope) {
        if (value) {
            if (value.type === undefined) {
                for (const property in value) {
                    const propertyValue = value[property];
                    if (propertyValue.type === "ColumnDeclaration") {
                        this.visitColumnDeclaration(propertyValue, scope);
                    }
                }
            } else {
                this.visit(value, scope);
            }
        }
    }

    private visitStringLiteral() { }

    private visitNullLiteral() { }

    private visitNumericLiteral() { }

    private visitBooleanLiteral() { }

    protected visitCallExpression(call: CallExpression, scope: Scope): any {
        scope = { ...scope, ...call.scope };
        const methodName = call.callee.property.name;
        const callMethod = this[`call${methodName.charAt(0).toUpperCase()}${methodName.substring(1)}`];
        if (callMethod) {
            return callMethod.bind(this)(call, scope);
        } else {
            if (this.includeReferenced || methodName === "map") {
                const identifiers = this.getIdentifiers(call.callee);
                identifiers.pop();
                const value = this.resolveFromScope(identifiers, scope);
                scope = { ...scope, ...{ [paramValues]: [value] } };
                if (call.callee.object.type) {
                    this.visit(call.callee.object, scope);
                }
                for (const arg of call.arguments) {
                    if (arg.type === "ColumnDeclaration") {
                        const _column = arg as ColumnDeclaration;
                        const column = new ColumnDeclaration(this.select.alias, _column.name, new ColumnExpression(_column.name, _column.name));
                        this.columns.push(column);
                    } else {
                        this.visit(arg, scope);
                    }
                }
                return call;
            }
        }
    }
    private visitNewExpression(expression: NewExpression, scope: Scope) {
        return expression;
    }
}

