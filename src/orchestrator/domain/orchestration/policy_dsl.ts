import { RemediationAction } from "./policy_engine.ts";

export type Operator = "==" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "matches";

export interface Condition {
    field: string;
    operator: Operator;
    value: any;
}

export interface Rule {
    id: string;
    name: string;
    description: string;
    conditions: Condition[];
    conjunction: "AND" | "OR";
    action: RemediationAction;
    priority: number;
}

/**
 * PolicyDSL
 * Parser and evaluator for structured security rules.
 */
export class PolicyDSL {
    /**
     * Evaluates a set of rules against a set of facts (threat context).
     * Returns the highest priority action that matches.
     */
    evaluate(rules: Rule[], facts: Record<string, any>): Rule | null {
        const matchingRules = rules.filter(rule => this.evaluateRule(rule, facts));

        if (matchingRules.length === 0) return null;

        // Sort by priority (descending)
        return matchingRules.sort((a, b) => b.priority - a.priority)[0];
    }

    private evaluateRule(rule: Rule, facts: Record<string, any>): boolean {
        if (rule.conjunction === "AND") {
            return rule.conditions.every(c => this.evaluateCondition(c, facts));
        } else {
            return rule.conditions.some(c => this.evaluateCondition(c, facts));
        }
    }

    private evaluateCondition(condition: Condition, facts: Record<string, any>): boolean {
        const factValue = facts[condition.field];
        if (factValue === undefined) return false;

        switch (condition.operator) {
            case "==": return factValue === condition.value;
            case "!=": return factValue !== condition.value;
            case ">":  return factValue > condition.value;
            case "<":  return factValue < condition.value;
            case ">=": return factValue >= condition.value;
            case "<=": return factValue <= condition.value;
            case "contains":
                if (Array.isArray(factValue)) return factValue.includes(condition.value);
                if (typeof factValue === "string") return factValue.includes(condition.value);
                return false;
            case "matches":
                if (typeof factValue === "string") return new RegExp(condition.value).test(factValue);
                return false;
            default: return false;
        }
    }
}
