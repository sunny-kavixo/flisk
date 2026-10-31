// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { VALID_RESOURCE_TYPES } from "../constants.js";
import {
  createKebabCaseValidator,
  includes,
  isPathSafe,
  isValidPort,
  sanitizeForShell,
  validateOptionalInfraService,
  validateResourceName,
  validateStackName,
} from "../validation.js";

describe("validateResourceName", () => {
  it.each([
    ["hyphenated", "my-service"],
    ["letters and digits", "service123"],
    ["hyphenated gateway", "api-gateway"],
    ["single letter", "a"],
    ["digits and hyphens", "test-123-abc"],
  ])("should validate correct kebab-case name (%s): %s", (_label, name) => {
    expect(validateResourceName(name)).toEqual({ valid: true });
  });

  it("should reject empty names", () => {
    const result = validateResourceName("");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("should reject whitespace-only names", () => {
    const result = validateResourceName("   ");
    expect(result.valid).toBe(false);
  });

  it.each([
    ["camelCase", "myService"],
    ["underscores", "my_service"],
    ["uppercase letters", "My-Service"],
    ["spaces", "my service"],
    ["dots", "my.service"],
  ])("should reject %s: %s", (_label, name) => {
    expect(validateResourceName(name).valid).toBe(false);
  });
});

describe("createKebabCaseValidator", () => {
  it("should return true for valid resource names", () => {
    const validator = createKebabCaseValidator("resource");
    expect(validator("my-resource")).toBe(true);
  });

  it("should return error for empty resource name", () => {
    const validator = createKebabCaseValidator("resource");
    expect(validator("")).toBe("Resource name is required");
  });

  it("should return error for invalid resource name", () => {
    const validator = createKebabCaseValidator("resource");
    expect(validator("MyResource")).toBe(
      'Resource name "MyResource" is not valid. Use lowercase letters, numbers, and hyphens only, e.g. "my-service".',
    );
  });

  it("should return error for empty stack name", () => {
    const validator = createKebabCaseValidator("stack");
    expect(validator("")).toBe("Stack name is required");
  });

  it("should return error for invalid stack name", () => {
    const validator = createKebabCaseValidator("stack");
    expect(validator("MyStack")).toBe(
      'Stack name "MyStack" is not valid. Use lowercase letters, numbers, and hyphens only, e.g. "my-stack".',
    );
  });
});

describe("validateStackName", () => {
  it("accepts kebab-case names", () => {
    expect(validateStackName("my-stack")).toEqual({ valid: true });
    expect(validateStackName("shop2")).toEqual({ valid: true });
  });

  it("rejects spaces and capitals, naming the value and giving an example", () => {
    expect(validateStackName("Bad Stack")).toEqual({
      valid: false,
      error:
        'Stack name "Bad Stack" is not valid. Use lowercase letters, numbers, and hyphens only, e.g. "my-stack".',
    });
    expect(validateStackName("a/b").valid).toBe(false);
  });

  it("rejects a name that starts or ends with a hyphen, such as an option taken as a value", () => {
    for (const name of ["--json", "-x", "x-", "-", "--"]) {
      expect(validateStackName(name).valid, name).toBe(false);
      expect(validateResourceName(name).valid, name).toBe(false);
    }
    expect(validateStackName("a-b--c").valid).toBe(true);
  });

  it("requires a name", () => {
    expect(validateStackName("  ")).toEqual({ valid: false, error: "Stack name is required" });
  });
});

describe("validateOptionalInfraService", () => {
  it.each([
    ["monitoring", "monitoring"],
    ["elk", "elk"],
    ["debezium", "debezium"],
    ["golden image", "golden_image"],
  ])("should accept valid infra service (%s): %s", (_label, service) => {
    expect(validateOptionalInfraService(service).valid).toBe(true);
  });

  it("should reject invalid infra services", () => {
    const result = validateOptionalInfraService("redis");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid service");
  });

  it("should reject empty string", () => {
    expect(validateOptionalInfraService("").valid).toBe(false);
  });
});

describe("isValidPort", () => {
  it.each([
    ["lowest number", 1],
    ["1024", 1024],
    ["3000", 3000],
    ["8080", 8080],
    ["highest number", 65535],
    ["lowest string", "1"],
    ["string 1024", "1024"],
    ["string 3000", "3000"],
    ["string 8080", "8080"],
    ["string 10350", "10350"],
    ["highest string", "65535"],
  ])("should accept valid port (%s): %s", (_label, port) => {
    expect(isValidPort(port)).toBe(true);
  });

  it.each([
    ["number 0", 0],
    ["negative number", -1],
    ["number above 65535", 65536],
    ["NaN", NaN],
    ["positive infinity", Infinity],
    ["negative infinity", -Infinity],
    ["non-integer number", 80.5],
    ["string 0", "0"],
    ["leading zero '01'", "01"],
    ["leading zeros '00123'", "00123"],
    ["string above 65535", "65536"],
    ["large string port", "99999"],
    ["six-digit string port", "100000"],
    ["empty string", ""],
    ["whitespace string", "   "],
    ["string with leading space", " 10350"],
    ["string with trailing space", "10350 "],
    ["non-numeric string", "abc"],
    ["negative string", "-1"],
    ["decimal string", "80.5"],
    ["null", null as unknown as number],
    ["undefined", undefined as unknown as number],
    ["boolean", true as unknown as number],
    ["object", {} as unknown as number],
  ])("should reject %s: %j", (_label, port) => {
    expect(isValidPort(port)).toBe(false);
  });
});

describe("sanitizeForShell", () => {
  it("should replace special characters", () => {
    expect(sanitizeForShell("hello$world")).toBe("hello_world");
  });

  it("should keep alphanumeric and hyphens", () => {
    expect(sanitizeForShell("my-service-123")).toBe("my-service-123");
  });

  it("should limit output to 100 chars", () => {
    const long = "a".repeat(200);
    expect(sanitizeForShell(long).length).toBe(100);
  });
});

describe("isPathSafe", () => {
  it("accepts ordinary names and relative paths", () => {
    expect(isPathSafe("my-service")).toBe(true);
    expect(isPathSafe("a/b")).toBe(true);
  });

  it.each(["\0", "<", ">", ":", '"', "|", "?", "*"])(
    "rejects unsafe path character %j",
    (character) => {
      expect(isPathSafe(character)).toBe(false);
    },
  );

  it.each(["a\0b", "../a\0", "a/b\0", "\0../escape"])(
    "rejects NUL anywhere in the path: %j",
    (path) => {
      expect(isPathSafe(path)).toBe(false);
    },
  );

  it.each(["C:\\temp\\x", "a:b", "build/out<1>"])(
    "rejects reserved characters in a Windows-style or mixed path: %j",
    (path) => {
      expect(isPathSafe(path)).toBe(false);
    },
  );

  // isPathSafe only screens characters. Traversal and absolute paths are not
  // branches of this function: callers resolve the path against the project
  // root and check the relative result (see resource.ts). These cases pin that
  // contract so a change to it is deliberate.
  it.each(["../escape", "a/../../b", "/etc/passwd", "", "a\\b", "..\\..\\x"])(
    "leaves traversal, absolute and separator checks to callers: %j",
    (path) => {
      expect(() => isPathSafe(path)).not.toThrow();
      expect(isPathSafe(path)).toBe(true);
    },
  );
});

describe("includes", () => {
  const resourceTypes = ["backend", "worker"] as const;

  it("returns true for a member and false for a non-member", () => {
    expect(includes(resourceTypes, "backend")).toBe(true);
    expect(includes(resourceTypes, "frontend")).toBe(false);
  });

  it("narrows a string to the readonly array's element type", () => {
    const candidate: string = "worker";
    if (!includes(resourceTypes, candidate)) {
      throw new Error("Expected candidate to be a resource type");
    }

    const narrowed: (typeof resourceTypes)[number] = candidate;
    expect(narrowed).toBe("worker");
  });
});

describe("VALID_RESOURCE_TYPES", () => {
  it("should include all expected types", () => {
    const expected = [
      "backend",
      "frontend",
      "library",
      "sdk",
      "worker",
      "migrator",
      "mcp",
      "agent",
      "database",
      "bring-your-own",
    ];
    expect(VALID_RESOURCE_TYPES.sort()).toEqual(expected.sort());
  });
});
