import { OPTIONAL_INFRA_SERVICES } from "./constants.js";
// Starts and ends with a letter or digit: "-x" and "--json" (an option swallowed as a value) are not names.
export const KEBAB_CASE_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
function isKebabCase(value) {
    return KEBAB_CASE_REGEX.test(value);
}
const KEBAB_RULE = "Use lowercase letters, numbers, and hyphens only";
function invalidNameMessage(label, value) {
    const example = label === "Resource name" ? "my-service" : "my-stack";
    return `${label} "${value}" is not valid. ${KEBAB_RULE}, e.g. "${example}".`;
}
export function validateResourceName(name) {
    if (!name.trim()) {
        return { valid: false, error: "Resource name is required" };
    }
    if (!isKebabCase(name)) {
        return { valid: false, error: invalidNameMessage("Resource name", name) };
    }
    return { valid: true };
}
export function validateStackName(name) {
    if (!name.trim()) {
        return { valid: false, error: "Stack name is required" };
    }
    if (!isKebabCase(name)) {
        return { valid: false, error: invalidNameMessage("Stack name", name) };
    }
    return { valid: true };
}
export function createKebabCaseValidator(context) {
    const validate = context === "resource" ? validateResourceName : validateStackName;
    return (input) => {
        const result = validate(input);
        return result.valid ? true : (result.error ?? "Invalid name");
    };
}
export function validateOptionalInfraService(service) {
    if (includes(OPTIONAL_INFRA_SERVICES, service)) {
        return { valid: true };
    }
    return {
        valid: false,
        error: `Invalid service. Must be one of: ${OPTIONAL_INFRA_SERVICES.join(", ")}`,
    };
}
/**
 * Validate that a port is a valid TCP/UDP port number (1-65535).
 * Accepts either a number or a string representation without leading zeros.
 */
export function isValidPort(port) {
    if (typeof port === "number") {
        return Number.isInteger(port) && port >= 1 && port <= 65535;
    }
    return typeof port === "string" && /^[1-9]\d{0,4}$/.test(port) && Number(port) <= 65535;
}
/**
 * Check a filesystem path segment for characters that are unsafe to use in a
 * path (null bytes, or characters that are invalid on common filesystems).
 * Does not check for path traversal (`..`) - callers that resolve the path
 * against a base directory should check that separately.
 */
export function isPathSafe(path) {
    return !path.includes("\0") && !/[<>:"|?*]/.test(path);
}
export function sanitizeForShell(value, replacement = "_") {
    return value.replace(/[^a-zA-Z0-9-]/g, replacement).substring(0, 100);
}
export function includes(array, value) {
    return array.includes(value);
}
