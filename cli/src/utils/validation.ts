// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { ValidationResult } from "../types/index.js";
import { OPTIONAL_INFRA_SERVICES } from "./constants.js";

// Starts and ends with a letter or digit: "-x" and "--json" (an option swallowed as a value) are not names.
export const KEBAB_CASE_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function isKebabCase(value: string): boolean {
  return KEBAB_CASE_REGEX.test(value);
}

const KEBAB_RULE = "Use lowercase letters, numbers, and hyphens only";

function invalidNameMessage(label: "Resource name" | "Stack name", value: string): string {
  const example = label === "Resource name" ? "my-service" : "my-stack";
  return `${label} "${value}" is not valid. ${KEBAB_RULE}, e.g. "${example}".`;
}

export function validateResourceName(name: string): ValidationResult {
  if (!name.trim()) {
    return { valid: false, error: "Resource name is required" };
  }
  if (!isKebabCase(name)) {
    return { valid: false, error: invalidNameMessage("Resource name", name) };
  }
  return { valid: true };
}

export function validateStackName(name: string): ValidationResult {
  if (!name.trim()) {
    return { valid: false, error: "Stack name is required" };
  }
  if (!isKebabCase(name)) {
    return { valid: false, error: invalidNameMessage("Stack name", name) };
  }
  return { valid: true };
}

export function createKebabCaseValidator(context: "resource" | "stack") {
  const validate = context === "resource" ? validateResourceName : validateStackName;
  return (input: string): true | string => {
    const result = validate(input);
    return result.valid ? true : (result.error ?? "Invalid name");
  };
}

export function validateOptionalInfraService(service: string): ValidationResult {
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
export function isValidPort(port: number | string): boolean {
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
export function isPathSafe(path: string): boolean {
  return !path.includes("\0") && !/[<>:"|?*]/.test(path);
}

export function sanitizeForShell(value: string, replacement: string = "_"): string {
  return value.replace(/[^a-zA-Z0-9-]/g, replacement).substring(0, 100);
}

export function includes<T extends readonly string[]>(array: T, value: string): value is T[number] {
  return (array as readonly string[]).includes(value);
}
