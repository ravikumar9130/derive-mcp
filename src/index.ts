#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { DeriveClient, DeriveApiError } from './client.js';
import { tools } from './tools.js';
import type {
  GetCurrencyParams,
  GetAllInstrumentsParams,
  GetInstrumentParams,
  GetTickerParams,
  GetTickersParams,
  GetSpotFeedHistoryParams,
  GetSpotFeedHistoryCandlesParams,
  GetFundingRateHistoryParams,
  GetInterestRateHistoryParams,
  GetOptionSettlementHistoryParams,
  GetLatestSignedFeedsParams,
  GetLiquidationHistoryParams,
  GetMarginParams,
  GetStatisticsParams,
} from './types.js';

const client = new DeriveClient();

function createMcpServer() {
  const server = new Server(
    { name: 'derive-market-data', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const a = args as Record<string, unknown>;

  try {
    let result: unknown;

    switch (name) {
      case 'get_all_currencies':
        result = await client.getAllCurrencies();
        break;
      case 'get_currency':
        result = await client.getCurrency(a as unknown as GetCurrencyParams);
        break;
      case 'get_all_instruments':
        result = await client.getAllInstruments(a as unknown as GetAllInstrumentsParams);
        break;
      case 'get_instrument':
        result = await client.getInstrument(a as unknown as GetInstrumentParams);
        break;
      case 'get_ticker':
        result = await client.getTicker(a as unknown as GetTickerParams);
        break;
      case 'get_tickers':
        result = await client.getTickers(a as unknown as GetTickersParams);
        break;
      case 'get_spot_feed_history':
        result = await client.getSpotFeedHistory(a as unknown as GetSpotFeedHistoryParams);
        break;
      case 'get_spot_feed_history_candles':
        result = await client.getSpotFeedHistoryCandles(a as unknown as GetSpotFeedHistoryCandlesParams);
        break;
      case 'get_funding_rate_history':
        result = await client.getFundingRateHistory(a as unknown as GetFundingRateHistoryParams);
        break;
      case 'get_interest_rate_history':
        result = await client.getInterestRateHistory(a as unknown as GetInterestRateHistoryParams);
        break;
      case 'get_option_settlement_history':
        result = await client.getOptionSettlementHistory(a as unknown as GetOptionSettlementHistoryParams);
        break;
      case 'get_latest_signed_feeds':
        result = await client.getLatestSignedFeeds(a as unknown as GetLatestSignedFeedsParams);
        break;
      case 'get_liquidation_history':
        result = await client.getLiquidationHistory(a as unknown as GetLiquidationHistoryParams);
        break;
      case 'get_margin':
        result = await client.getMargin(a as unknown as GetMarginParams);
        break;
      case 'get_statistics':
        result = await client.getStatistics(a as unknown as GetStatisticsParams);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    const message =
      error instanceof DeriveApiError
        ? `Derive API error (${error.status}): ${error.message}`
        : error instanceof Error
          ? error.message
          : 'An unexpected error occurred';

    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
  });

  return server;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;

  if (port) {
    // HTTP mode — with session management for Streamable HTTP transport
    const transports: Record<string, StreamableHTTPServerTransport> = {};

    const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '/';
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      
      console.error(`[MCP] ${req.method} ${url} - Session: ${sessionId || 'none'}`);

      if (req.method === 'GET' && url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (req.method === 'GET' && url === '/metrics') {
        const metrics = client.getMetrics();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metrics, null, 2));
        return;
      }

      if (url === '/mcp') {
        // Existing session: reuse transport
        if (sessionId && transports[sessionId]) {
          await transports[sessionId].handleRequest(req, res);
          return;
        }

        // New session: create transport
        if (req.method === 'POST') {
          const body = await readBody(req).catch(() => '{}');
          console.error(`[MCP] POST body: ${body.substring(0, 200)}`);
          const parsedBody = JSON.parse(body);
          
          // Check if this is an initialize request
          console.error(`[MCP] Checking isInitializeRequest: ${isInitializeRequest(parsedBody)}, method: ${parsedBody?.method}`);
          if (isInitializeRequest(parsedBody)) {
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (id) => { transports[id] = transport; },
            });
            transport.onclose = () => {
              if (transport.sessionId) delete transports[transport.sessionId];
            };
            
            const serverInstance = createMcpServer();
            await serverInstance.connect(transport);
            (req as IncomingMessage & { body: unknown }).body = parsedBody;
            
            console.error(`[MCP] Handling initialize, transport.sessionId before: ${transport.sessionId}`);
            await transport.handleRequest(req, res);
            console.error(`[MCP] Initialize response sent, sessionId: ${transport.sessionId}`);
            return;
          }
        }

        // No valid session and not an initialize request
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID' }, id: null }));
        return;
      }

      // OAuth well-known endpoints (Claude compatibility)
      if (url === '/.well-known/oauth-authorization-server') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          issuer: `https://derive-mcp-production.up.railway.app`,
          authorization_endpoint: '',
          token_endpoint: '',
          response_types_supported: [],
        }));
        return;
      }

      res.writeHead(404).end();
    });

    httpServer.listen(port, '0.0.0.0', () => {
      console.error(`Derive MCP server v1.0.0 listening on port ${port}`);
    });
    return;
  }

  // Stdio mode for local MCP clients
  const stdioServer = createMcpServer();
  const transport = new StdioServerTransport();
  await stdioServer.connect(transport);
  console.error('Derive Market Data MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal server error:', error);
  process.exit(1);
});
