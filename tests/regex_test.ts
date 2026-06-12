const DANGEROUS_PATTERN = /[&|;><`()!\n\r$]|\.\./;
const isPotentiallyDangerous = (arg) => DANGEROUS_PATTERN.test(arg);

const validateSensitiveArgument = (arg, baseCmd) => {
    if (/[;&|><`$()!\n\r\t]/.test(arg)) {
        return { valid: false, reason: "shell metachars detected" };
    }

    if ((baseCmd === "scp" || baseCmd === "ssh") && /^[a-z0-9]+@([a-z0-9.-]+|\[[a-f0-9:]+\]):.*$/.test(arg)) {
        const lastColonIndex = arg.lastIndexOf(":");
        const pathPortion = lastColonIndex !== -1 ? arg.substring(lastColonIndex + 1) : "";
        if (pathPortion && isPotentiallyDangerous(pathPortion)) {
            return { valid: false, reason: "dangerous remote path" };
        }
        return { valid: true };
    }
    return { valid: true };
}

console.log(validateSensitiveArgument("user@host:$(whoami)", "scp"));
