"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { nowIso } = require("../core/time-provider.js");

const DEFAULT_LOG_DIR = path.resolve(__dirname, "../../workspace/api-contracts");
const MAX_BODY_BYTES = 64 * 1024;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function truncateBody(body) {
  if (body === null || body === undefined) return null;
  const json = JSON.stringify(body);
  if (Buffer.byteLength(json) > MAX_BODY_BYTES) {
    return { _truncated: true, _bytes: Buffer.byteLength(json), _preview: json.slice(0, 2048) };
  }
  return body;
}

function createPayloadLogger(options) {
  const logDir = (options && options.logDir) || DEFAULT_LOG_DIR;
  const enabled = options && typeof options.enabled === "boolean" ? options.enabled : true;

  if (!enabled) {
    return Object.freeze({
      logRequest() {},
      logResponse() {},
      logPair() {}
    });
  }

  ensureDir(logDir);

  const logFile = path.join(logDir, "research-api-payloads.jsonl");
  const stream = fs.createWriteStream(logFile, { flags: "a" });

  function write(entry) {
    stream.write(JSON.stringify(entry) + "\n");
  }

  function logRequest(method, routePath, routeType, body) {
    write({
      timestamp: nowIso(),
      direction: "request",
      method,
      path: routePath,
      route_type: routeType,
      body: truncateBody(body)
    });
  }

  function logResponse(method, routePath, routeType, status, body) {
    write({
      timestamp: nowIso(),
      direction: "response",
      method,
      path: routePath,
      route_type: routeType,
      status,
      body: truncateBody(body)
    });
  }

  function logPair(method, routePath, routeType, requestBody, responseStatus, responseBody) {
    write({
      timestamp: nowIso(),
      direction: "roundtrip",
      method,
      path: routePath,
      route_type: routeType,
      request_body: truncateBody(requestBody),
      response_status: responseStatus,
      response_body: truncateBody(responseBody)
    });
  }

  return Object.freeze({ logRequest, logResponse, logPair });
}

module.exports = { createPayloadLogger };
