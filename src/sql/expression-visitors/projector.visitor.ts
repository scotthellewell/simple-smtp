import { ArrowFunctionExpression, CallExpression, ColumnDeclaration, ColumnExpression, Expression, GroupingExpression, Identifier, MemberExpression, NewObjectExpression, ObjectExpression, ObjectProperty, ProjectorExpression, PropertyProjector } from "../expressions/index.js";
import { ExpressionVisitor, paramValues, Scope } from "./expression.visitor.js";

export class ProjectorVisitor extends ExpressionVisitor<any>{
    private row: any;
    private columns: readonly ColumnDeclaration[];
    project(row, columns: readonly ColumnDeclaration[], projector: ProjectorExpression, parameterValues?: any[]) {
        this.row = row;
        this.columns = columns;
        return this.visit(projector, { [paramValues]: parameterValues });
    }

    private visitNewObject(newObject: NewObjectExpression, scope: Scope) {
        const value = new newObject.objectType();
        for (const pp of newObject.propertyProjectors) {
            value[pp.property] = this.visit(pp.value);
        }
        return value;
    }

    private visitIdentifier(identifier: Identifier, scope: Scope) {
        if (this.row)
            return this.row[identifier.name];
        else {
            const value = this.resolveFromScope([identifier.name], scope);
            return value;
        }
    }

    private visitMemberExpression(member: MemberExpression, scope) {
        const identifiers = this.getIdentifiers(member);
        if (this.columns) {
            const column = this.columns.find(c => c.alias === (member.object as Identifier).name && (c.expression as ColumnExpression).columnName === member.property.name);
            return this.row[column.name];
        } else {
            const valueFromScope = this.resolveFromScope(identifiers, scope);
            if (valueFromScope !== undefined) return valueFromScope;
        }
    }

    private visitColumnDeclaration(columnDeclaration: ColumnDeclaration) {
        return this.row[columnDeclaration.name];
    }

    private visitGrouping(grouping: GroupingExpression, scope) {
        return this.visit(new NewObjectExpression(
            Object, [new PropertyProjector("key", grouping.key as any), new PropertyProjector("aggregates", grouping.aggregates as any), new PropertyProjector("elements", grouping.elements as any)]), scope);
    }

    private visitObjectExpression(objectExpression: ObjectExpression, scope: Scope) {
        const value = new Object();
        for (const property of objectExpression.properties) {
            value[property.key.name] = this.visit(property.value, scope);
        }
        return value;
    }

    private callMap(map: CallExpression, scope: Scope) {
        const projectorVisitor = new ProjectorVisitor();
        const array: any[] = this.visit(map.callee.object, scope);
        const mappedArray = [];
        for (const item of array) {
            const newScope = { ...scope, [paramValues]: [item] };
            const mappedArrayValue = projectorVisitor.project(null, null, map.arguments[0] as any, [item]);
            if (!this.isDeepNull(mappedArrayValue)) {
                mappedArray.push(mappedArrayValue);
            }
        }
        return mappedArray;
    }

    private isDeepNull(value): boolean {
        if (value === undefined || value === null)
            return true;
        for (const prop in value) {
            if (value[prop] !== undefined && value[prop] !== null) {
                if (typeof value[prop] !== "object" || !this.isDeepNull(value[prop])) {
                    return false;
                }
            }
        }
        return true;
    }
}
