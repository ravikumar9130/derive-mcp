#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const API_BASE = "https://api.lyra.finance";

// --- Public API caller (no auth needed) ---
async function callPublicApi(method, params = {}) {
  const response = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

function cleanParams(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
}

async function handleToolCall(method, params = {}) {
  try {
    const result = await callPublicApi(method, cleanParams(params));
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
}

// --- Tool registration ---
function registerTools(server) {
  server.tool("get_all_currencies", "Get all available currencies on Derive", {},
    async () => handleToolCall("public/get_all_currencies"));

  server.tool("get_currency", "Get details for a specific currency",
    { currency: z.string().describe("Currency symbol, e.g. ETH, BTC") },
    async ({ currency }) => handleToolCall("public/get_currency", { currency }));

  server.tool("get_all_instruments", "Get all available instruments (options, perps, or ERC20 tokens)", {
    expired: z.boolean().describe("If true, include expired instruments"),
    instrument_type: z.enum(["erc20", "option", "perp"]).describe("Instrument type"),
    currency: z.string().optional().describe("Filter by currency, e.g. ETH, BTC"),
    page: z.number().int().optional().describe("Page number (default 1)"),
    page_size: z.number().int().max(1000).optional().describe("Results per page (default 100, max 1000)"),
  }, async (params) => handleToolCall("public/get_all_instruments", params));

  server.tool("get_instrument", "Get details for a specific instrument by name",
    { instrument_name: z.string().describe("Instrument name, e.g. ETH-PERP, BTC-20260328-50000-C") },
    async ({ instrument_name }) => handleToolCall("public/get_instrument", { instrument_name }));

  server.tool("get_ticker", "Get current price, volume, bid/ask for an instrument",
    { instrument_name: z.string().describe("Instrument name, e.g. ETH-PERP") },
    async ({ instrument_name }) => handleToolCall("public/get_ticker", { instrument_name }));

  server.tool("get_tickers", "Get tickers for all instruments of a given type", {
    instrument_type: z.enum(["erc20", "option", "perp"]).describe("Instrument type"),
    currency: z.string().optional().describe("Currency filter (required for options)"),
    expiry_date: z.string().optional().describe("Expiry date filter for options (YYYYMMDD format)"),
  }, async (params) => handleToolCall("public/get_tickers", params));

  server.tool("get_spot_feed_history", "Get historical spot price data for a currency", {
    currency: z.string().describe("Currency, e.g. ETH, BTC"),
    start_timestamp: z.number().int().describe("Start timestamp in seconds"),
    end_timestamp: z.number().int().describe("End timestamp in seconds"),
    period: z.number().int().describe("Time interval between data points in seconds"),
  }, async (params) => handleToolCall("public/get_spot_feed_history", params));

  server.tool("get_spot_feed_history_candles", "Get OHLC candlestick data for spot prices", {
    currency: z.string().describe("Currency, e.g. ETH, BTC"),
    start_timestamp: z.number().int().describe("Start timestamp in seconds"),
    end_timestamp: z.number().int().describe("End timestamp in seconds"),
    period: z.number().int().describe("Candle period in seconds: 60, 300, 900, 1800, 3600, 14400, 28800, 86400, or 604800"),
  }, async (params) => handleToolCall("public/get_spot_feed_history_candles", params));

  server.tool("get_funding_rate_history", "Get historical funding rates for a perpetual instrument", {
    instrument_name: z.string().describe("Perp instrument name, e.g. ETH-PERP"),
    start_timestamp: z.number().int().optional().describe("Start timestamp in seconds (default 0, max 30 days ago)"),
    end_timestamp: z.number().int().optional().describe("End timestamp in seconds (default now)"),
    period: z.enum(["900", "3600", "14400", "28800", "86400"]).optional().describe("Period in seconds"),
  }, async (params) => handleToolCall("public/get_funding_rate_history", params));

  server.tool("get_interest_rate_history", "Get historical borrowing interest rates", {
    from_timestamp_sec: z.number().int().describe("Start timestamp in seconds"),
    to_timestamp_sec: z.number().int().describe("End timestamp in seconds"),
    page: z.number().int().optional().describe("Page number (default 1)"),
    page_size: z.number().int().max(1000).optional().describe("Results per page (default 100, max 1000)"),
  }, async (params) => handleToolCall("public/get_interest_rate_history", params));

  server.tool("get_option_settlement_history", "Get historical option settlement data", {
    page: z.number().int().optional().describe("Page number (default 1)"),
    page_size: z.number().int().max(1000).optional().describe("Results per page (default 100, max 1000)"),
    subaccount_id: z.number().int().optional().describe("Filter by subaccount ID"),
  }, async (params) => handleToolCall("public/get_option_settlement_history", params));

  server.tool("get_latest_signed_feeds", "Get current oracle price feeds", {
    currency: z.string().optional().describe("Currency filter (defaults to all)"),
    expiry: z.number().int().optional().describe("Expiry filter (0 for spot/perp only, defaults to all)"),
  }, async (params) => handleToolCall("public/get_latest_signed_feeds", params));

  server.tool("get_liquidation_history", "Get historical liquidation events", {
    start_timestamp: z.number().int().optional().describe("Start timestamp in seconds (default 0)"),
    end_timestamp: z.number().int().optional().describe("End timestamp in seconds (default now)"),
    page: z.number().int().optional().describe("Page number (default 1)"),
    page_size: z.number().int().max(1000).optional().describe("Results per page (default 100, max 1000)"),
  }, async (params) => handleToolCall("public/get_liquidation_history", params));

  server.tool("get_margin", "Simulate margin requirements for a hypothetical portfolio", {
    margin_type: z.enum(["PM", "PM2", "SM"]).describe("Margin type: PM (Portfolio), PM2, or SM (Standard)"),
    simulated_collaterals: z.array(z.object({
      amount: z.string().describe("Collateral amount"),
      asset_name: z.string().describe("Asset name, e.g. USDC"),
    })).describe("List of simulated collaterals"),
    simulated_positions: z.array(z.object({
      amount: z.string().describe("Position size"),
      instrument_name: z.string().describe("Instrument name"),
      entry_price: z.string().optional().describe("Entry price"),
    })).describe("List of simulated positions"),
    market: z.string().optional().describe("Market (required for Portfolio Margin)"),
  }, async (params) => handleToolCall("public/get_margin", params));

  server.tool("get_statistics", "Get aggregate platform statistics (volume, open interest, etc.)", {
    instrument_name: z.string().describe("Instrument name or 'ALL', 'OPTION', 'PERP', 'SPOT'"),
    currency: z.string().optional().describe("Currency filter"),
    end_time: z.number().int().optional().describe("End time in milliseconds"),
  }, async (params) => handleToolCall("public/statistics", params));
}

// --- Start ---
const PORT = process.env.PORT;

if (PORT) {
  // Railway / remote: Streamable HTTP transport
  const { default: express } = await import("express");
  const { randomUUID } = await import("node:crypto");
  const { isInitializeRequest } = await import("@modelcontextprotocol/sdk/types.js");

  const app = express();
  app.use(express.json());

  const transports = {};

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    try {
      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res, req.body);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => { transports[id] = transport; },
        });
        transport.onclose = () => {
          if (transport.sessionId) delete transports[transport.sessionId];
        };
        const serverInstance = new McpServer({ name: "derive-market-data", version: "1.0.0" });
        registerTools(serverInstance);
        await serverInstance.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } else {
        res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request: No valid session ID" }, id: null });
      }
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) return res.status(400).send("Invalid or missing session ID");
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) return res.status(400).send("Invalid or missing session ID");
    await transports[sessionId].handleRequest(req, res);
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.listen(PORT, "0.0.0.0", () => console.log(`Derive MCP server listening on port ${PORT}`));
} else {
  // Local: stdio transport
  const server = new McpServer({ name: "derive-market-data", version: "1.0.0" });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Derive Market Data MCP server running on stdio");
}
