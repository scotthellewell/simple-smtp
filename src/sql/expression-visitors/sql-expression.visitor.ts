
import { NumericLiteral, BinaryExpression, CallExpression, ColumnDeclaration, ColumnExpression, DataSource, Expression, NullLiteral, SelectExpression, SqlExpression, StringLiteral, getDataSourceMetadata, NewExpression, BigIntLiteral, BooleanLiteral, UnaryExpression } from "../expressions/index.js";
import { ExpressionVisitor, Scope } from "./expression.visitor.js";
import { ProjectorColumnVisitor } from "./projector-column.visitor.js";

export class SqlExpressionVisitor extends ExpressionVisitor<Expression> {
    private getFunctionName(name: string): string {
        if (name === "join") {
            return "STRING_AGG";
        } else if (name === "average") {
            return "AVG";
        }
        return name.toUpperCase();
    }

    queryText = "";
    parameters = [];
    translate(expression: Expression) {
        if (expression.type === "Sql") {
            return expression as SqlExpression;
        }
        this.queryText = "";
        this.parameters = [];
        this.visit(expression);
        return new SqlExpression(this.queryText, this.parameters);
    }

    protected visitBinaryExpression(binary: BinaryExpression, scope: Scope) {
        this.queryText += "(";
        this.visit(binary.left, scope);
        this.queryText += " ";
        if (binary.right.type === "NullLiteral") {
            if (binary.operator === "==" || binary.operator === "===") {
                this.queryText += "IS";
            } else if (binary.operator === "!=" || binary.operator === "!==") {
                this.queryText += "IS NOT";
            } else {
                throw new Error("unhandled null operator: " + binary.operator);
            }
        } else {
            this.visitOperator(binary.operator);
        }
        this.queryText += " ";
        this.visit(binary.right, scope);
        this.queryText += ")";
        return binary;
    }


    protected visitUnaryExpression(unary: UnaryExpression, scope: Scope) {
        if (unary.operator == "!"){
            this.queryText += "NOT ";
        } else {
            throw new Error("Unknown operator: " + unary.operator);
        }
        this.queryText += "(";
        this.visit(unary.argument, scope);
        this.queryText += ")";
        return unary;
    }

    protected visitOperator(operator: string) {
        if (operator === '===' || operator === '==') { this.queryText += "="; }
        else if (operator === '!==' || operator === '!=') { this.queryText += "!="; }
        else if (operator === '&&') { this.queryText += "AND" }
        else if (operator === "||") { this.queryText += "OR" }
        else { this.queryText += operator; }
        return operator;
    }

    private _indent = 0;
    private indent(change = 0) {
        this._indent += change;
        if (change >= 0) {
            if (this.queryText != "") { this.queryText += "\n"; }
            for (let i = 1; i < this._indent; i++) {
                this.queryText += "    ";
            }
        }
    }

    private callIncludes(call: CallExpression, scope: Scope) {
        if (Array.isArray(call.callee.object)) {
            this.visit(call.arguments[0], scope);
            this.queryText += " IN (";
            for (const [i, item] of call.callee.object.entries()) {
                if (i > 0) {
                    this.queryText += ", ";
                }
                switch (typeof item) {
                    case "string":
                        this.visit(new StringLiteral(item));
                        break;
                    case "number":
                        this.visit(new NumericLiteral(item));
                        break;
                    case "boolean":
                        this.visit(new BooleanLiteral(item));
                        break;
                    default:
                        throw new Error("Array.includes doesn't inplement type: " + typeof item);
                }
            }
            this.queryText += ")";
        } else {
            this.queryText += "(";
            this.visit(call.callee.object, scope);
            this.queryText += " LIKE '%' + CAST(";
            this.visit(call.arguments[0], scope);
            this.queryText += " as nvarchar(1000)) + '%')";
            return call;

        }
    }

    private callEndsWith(call: CallExpression, scope: Scope) {
        this.queryText += "(";
        this.visit(call.callee.object, scope);
        this.queryText += " LIKE '%' + CAST(";
        this.visit(call.arguments[0], scope);
        this.queryText += " AS NVARCHAR(1000)))";
        return call;
    }

    private callStartsWith(call: CallExpression, scope: Scope) {
        this.queryText += "(";
        this.visit(call.callee.object, scope);
        this.queryText += " LIKE CAST(";
        this.visit(call.arguments[0], scope);
        this.queryText += " AS NVARCHAR(1000)) + '%')";
        return call;
    }

    private callBetween(call: CallExpression, scope: Scope) {
        this.queryText += "(";
        this.visit(call.callee.object, scope)
        this.queryText += " BETWEEN ";
        this.visit(call.arguments[0], scope);
        this.queryText += " AND ";
        this.visit(call.arguments[1], scope);
        this.queryText += ")";
        return call;
    }

    private callRowNumber(call: CallExpression, scope) {
        const select = call.callee.object as SelectExpression;
        this.queryText += " ROW_NUMBER() OVER (";
        if (select.orderBy.length > 0) {
            this.visitOrderBy(select, { ...scope, ...{ select } });
        } else {
            this.queryText += "ORDER BY (SELECT NULL)";
        }
        this.queryText += ") ";
        return call;
    }

    private callSubstring(call: CallExpression, scope) {
        this.queryText += "SUBSTRING(";
        this.visit(call.callee.object, scope);
        this.queryText += ", ";
        this.visit(call.arguments[0], scope);
        this.queryText += " + 1, ";
        this.visit(call.arguments[1], scope);
        this.queryText += ")";
        return call;
    }

    protected visitCallExpression(call: CallExpression, scope: Scope): Expression {
        scope = { ...scope, ...call.scope };
        const callMethod = this[`call${call.callee.property.name.charAt(0).toUpperCase()}${call.callee.property.name.substring(1)}`];
        if (callMethod) {
            return callMethod.bind(this)(call, scope);
        }
        return this.callSqlFunction(call, scope);
    }

    private callSqlFunction(call: CallExpression, scope: Scope) {
        let name = call.callee.property.name;
        let distinct = false;
        if (name.startsWith("distinct")) {
            name = name.substring(8);
            name = name.substring(0, 1).toLowerCase() + name.substring(1);
            distinct = true;
        }
        this.queryText += `${this.getFunctionName(name)}(`;
        if (distinct) {
            this.queryText += "DISTINCT ";
        }
        let args = call.arguments.slice();
        if (call.callee.object.type === "ColumnDeclaration") {
            this.visit(call.callee.object, scope);
        } else {
            const _column = args.shift() as ColumnDeclaration;
            const column = new ColumnDeclaration(scope.select.alias, _column.name, new ColumnExpression(_column.name, _column.name));
            this.visit(column, scope);
        }
        for (const arg of args) {
            this.queryText += ', ';
            this.visit(arg, scope);
        }
        this.queryText += ")";
        return call;
    }

    private visitSelect(select: SelectExpression, scope: Scope) {
        const innerSelect = scope && scope.select ? scope.select : null;
        scope = { ...scope, innerSelect, ...{ select } };
        let first = true;
        const projectorColumnVisitor = new ProjectorColumnVisitor();
        let innerColumns = null;
        if (innerSelect) {
            innerColumns = projectorColumnVisitor.getColumns(innerSelect, true);
        }
        const columns = projectorColumnVisitor.getColumns(select);
        this.indent(1);
        this.queryText += "SELECT ";
        if (select.distinct) {
            this.queryText += "DISTINCT ";
        }
        first = true;
        for (const column of columns) {
            if (column) {
                if (!innerColumns || innerColumns.some(c => c.name === column.name)) {
                    if (!first) {
                        this.queryText += ", ";
                    }
                    first = false;
                    this.queryText += `[${column.name}] = `;
                    this.visit(column, scope);
                }
            }
        }
        this.indent();
        this.queryText += "FROM ";
        if (select.from.type === "Select") {
            this.queryText += "(";
            this.visit(select.from, scope);
            this.queryText += ")";
        } else {
            this.visit(select.from, scope);
        }
        this.queryText += " AS [" + select.alias + ']';
        if (select.joins) {
            for (const join of select.joins) {
                this.indent();
                if (join.joinType.value === "Inner") {
                    this.queryText += "JOIN ";
                } else {
                    this.queryText += "LEFT JOIN ";
                }
                let joinExpression: Expression = null;
                if (join.from.isSimpleSelect) {
                    joinExpression = join.from.from;
                } else {
                    joinExpression = join.from;
                }
                if (joinExpression.type === "Select") {
                    this.queryText += "(";
                    this.visit(joinExpression, scope);
                    this.queryText += ")";
                } else {
                    this.visit(joinExpression, scope);
                }
                this.queryText += " AS [" + join.from.alias + '] on ';
                this.visit(join.on, scope);
            }
        }
        if (select.where) {
            this.indent();
            this.queryText += "WHERE ";
            this.visit(select.where, scope);
        }
        if (!innerSelect && select.orderBy && select.orderBy.length > 0) {
            this.indent();
            this.visitOrderBy(select, scope);
        }
        if (select.groupBys && select.groupBys.length > 0) {
            this.indent();
            this.queryText += "GROUP BY ";
            first = true;
            for (const column of select.groupBys) {
                if (!first) {
                    this.queryText += ", ";
                }
                first = false;
                this.visit(column, scope);
            }
        }
        this.indent(-1);
    }

    private visitOrderBy(select: SelectExpression, scope) {
        this.queryText += "ORDER BY ";
        for (const [index, orderBy] of select.orderBy.entries()) {
            if (index > 0) {
                this.queryText += ", ";
            }
            this.visit(orderBy.property, scope);
            if (orderBy.direction.value === "Descending") {
                this.queryText += " DESC";
            }
        }
    }

    private visitDataSource(dataSource: DataSource<unknown>) {
        const dsmeta = getDataSourceMetadata(dataSource.elementType);
        this.queryText += '[' + dsmeta.name + ']';
    }

    private visitColumnDeclaration(columnDeclaration: ColumnDeclaration, scope: Scope) {
        let column: ColumnDeclaration;
        if (scope.select) {
            column = (scope.select as SelectExpression).columns.find(c => c.alias === columnDeclaration.alias && c.name === columnDeclaration.name);
            if (!column) {
                for (const join of (scope.select as SelectExpression).joins) {
                    const select = join.from;
                    column = select.columns.find(c => c.alias === columnDeclaration.alias && c.name === columnDeclaration.name);
                    if (column) { break; }
                }
            }
        }
        if (!column) {
            column = columnDeclaration;
        }
        if (column) {
            if (column.expression.type === "Column") {
                this.queryText += `[${column.alias}].[${column.expression.columnName}]`;
            } else if (column.expression.type === "CallExpression") {
                this.visit(column.expression, scope);
            }
        }
    }

    private visitStringLiteral(literal: StringLiteral) {
        const index = this.parameters.indexOf(literal.value);
        if (index >= 0) {
            this.queryText += `@${index}`;
        } else {
            this.queryText += `@${this.parameters.length}`;
            this.parameters.push(literal.value);
        }
    }

    private visitBooleanLiteral(literal: BooleanLiteral) {
        this.queryText += literal.value ? "1" : "0";
    }

    private visitNumericLiteral(liteal: NumericLiteral) {
        this.queryText += liteal.value.toString();
    }

    private visitNullLiteral(literal: NullLiteral) {
        this.queryText += "NULL";
    }

    private visitNewExpression(expression: NewExpression, scope: Scope) {
        if (expression.callee.name === "Date") {
            let evalString = "new Date(";
            for (const [index, arg] of expression.arguments.entries()) {
                if (index > 0) { evalString += ","; }
                if (arg.type.endsWith("Literal")) {
                    evalString += JSON.stringify((arg as StringLiteral).value);
                }
            }
            evalString += ");";
            const value = eval(evalString);

            const index = this.parameters.indexOf(value);
            if (index >= 0) {
                this.queryText += `@${index}`;
            } else {
                this.queryText += `@${this.parameters.length}`;
                this.parameters.push(value);
            }
        }
        else {
            throw new Error("Not Implemented: " + expression.callee.name);
        }
        return expression;
    }

}