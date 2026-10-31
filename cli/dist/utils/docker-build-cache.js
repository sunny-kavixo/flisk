// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FliskError } from "./errors.js";
import { findOnPath } from "./which.js";
const execFilePromise = promisify(execFile);
const DOCKER_TIMEOUT_MS = 15_000;
export const DOCKER_BUILD_CACHE_CHECK = "Docker Build Cache";
/** Warning threshold in GiB (matching DISK_WARN_GIB from #2362). */
export const DOCKER_BUILD_CACHE_WARN_GIB = 10;
export const defaultDockerRunner = async (args) => {
    const { stdout } = await execFilePromise("docker", args, {
        encoding: "utf-8",
        timeout: DOCKER_TIMEOUT_MS,
        windowsHide: true,
    });
    return stdout;
};
/** Parses human size string like "11.82GB", "9.19 GB", "500MB", "0B" into bytes. */
export function parseSizeToBytes(raw) {
    const match = raw.trim().match(/^([\d.]+)\s*([a-zA-Z]+)?$/);
    if (!match)
        return 0;
    const num = Number.parseFloat(match[1] ?? "0");
    if (!Number.isFinite(num))
        return 0;
    const unit = (match[2] ?? "B").toUpperCase();
    if (unit === "B")
        return num;
    if (unit === "KB" || unit === "KIB" || unit === "K")
        return num * 1024;
    if (unit === "MB" || unit === "MIB" || unit === "M")
        return num * 1024 ** 2;
    if (unit === "GB" || unit === "GIB" || unit === "G")
        return num * 1024 ** 3;
    if (unit === "TB" || unit === "TIB" || unit === "T")
        return num * 1024 ** 4;
    return num;
}
/**
 * Parses `docker system df --format "{{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}"` output.
 */
export function parseDockerBuildCache(dfOutput) {
    for (const line of dfOutput.split(/\r?\n/)) {
        const parts = line.split("\t");
        const type = (parts[0] ?? "").trim();
        if (type.toLowerCase() === "build cache") {
            const entries = Number.parseInt((parts[1] ?? "").trim(), 10) || 0;
            const rawSize = (parts[2] ?? "").trim() || "0B";
            const rawReclaimable = (parts[3] ?? "").replace(/\s*\(.*\)/, "").trim() || "0B";
            const sizeBytes = parseSizeToBytes(rawSize);
            const reclaimableBytes = parseSizeToBytes(rawReclaimable);
            return {
                size: rawSize,
                sizeBytes,
                sizeGib: sizeBytes / 1024 ** 3,
                entries,
                reclaimable: rawReclaimable,
                reclaimableBytes,
            };
        }
    }
    return null;
}
/**
 * Checks the size of Docker's build cache and warns if it exceeds DOCKER_BUILD_CACHE_WARN_GIB.
 */
export async function checkDockerBuildCache(runner = defaultDockerRunner, hasDocker = Boolean(findOnPath("docker"))) {
    if (!hasDocker) {
        return {
            name: DOCKER_BUILD_CACHE_CHECK,
            didPass: false,
            message: "Docker CLI not found",
            fix: "Install Docker: https://docs.docker.com/get-docker/",
        };
    }
    let stdout;
    try {
        stdout = await runner([
            "system",
            "df",
            "--format",
            "{{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}",
        ]);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            name: DOCKER_BUILD_CACHE_CHECK,
            didPass: true,
            isSkipped: true,
            message: `Could not read Docker build cache: ${msg.split(/\r?\n/)[0]}`,
        };
    }
    const info = parseDockerBuildCache(stdout);
    if (!info) {
        return {
            name: DOCKER_BUILD_CACHE_CHECK,
            didPass: true,
            isSkipped: true,
            message: "Could not parse Docker build cache information",
        };
    }
    const buildCache = {
        size: info.size,
        entries: info.entries,
        reclaimable: info.reclaimable,
    };
    const entryLabel = info.entries === 1 ? "entry" : "entries";
    if (info.sizeGib >= DOCKER_BUILD_CACHE_WARN_GIB) {
        return {
            name: DOCKER_BUILD_CACHE_CHECK,
            didPass: false,
            isWarning: true,
            message: `${info.size} across ${info.entries} ${entryLabel}: Docker build cache exceeds ${DOCKER_BUILD_CACHE_WARN_GIB} GB threshold. Cache is shared across all projects on this machine`,
            fix: "Prune old build cache: flisk down --prune-cache; or docker builder prune --filter until=24h. Note: this affects other projects on this machine.",
            buildCache,
        };
    }
    const shown = info.entries === 0 || info.sizeBytes === 0
        ? "0 B in 0 entries (Docker build cache is empty)"
        : `${info.size} across ${info.entries} ${entryLabel} (shared across all projects on this machine)`;
    return {
        name: DOCKER_BUILD_CACHE_CHECK,
        didPass: true,
        message: shown,
        buildCache,
    };
}
/** Validates that the age filter is safe (e.g. "24h", "7d", "168h", "30m", or ISO date). */
export function validateCacheUntil(until) {
    if (!until || typeof until !== "string")
        return false;
    const trimmed = until.trim();
    // Duration format like 24h, 7d, 2h30m, 168h
    if (/^(\d+[hmsd])+$/i.test(trimmed))
        return true;
    // ISO date format like 2026-10-01 or 2026-10-01T00:00:00
    if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/.test(trimmed))
        return true;
    return false;
}
/** Parses reclaimed size from `docker builder prune` output. */
export function parseReclaimedFromPrune(stdout) {
    const match = stdout.match(/(?:Total reclaimed space|Total):\s*([0-9.]+\s*[a-zA-Z]+)/i);
    return match?.[1]?.trim() ?? "0 B";
}
/**
 * Prunes Docker build cache using `docker builder prune -f --filter until=<age>`.
 */
export async function pruneDockerBuildCache(options = {}) {
    const until = options.until ?? "24h";
    if (!validateCacheUntil(until)) {
        throw new FliskError(`Invalid --cache-until format: "${until}"`, [
            "Use a duration such as 24h, 168h, 7d, or 2h30m",
        ]);
    }
    const runner = options.runner ?? defaultDockerRunner;
    const stdout = await runner(["builder", "prune", "-f", "--filter", `until=${until}`]);
    const reclaimed = parseReclaimedFromPrune(stdout);
    return { reclaimed, until };
}
