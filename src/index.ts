#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { DeriveClient, DeriveApiError } from './client.js';
import { IncomingMessage } from 'node:http';
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

function readBody(req: IncomingMessage | any): Promise<string> {
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

    const app = express();
    app.use(express.json());

    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    app.get('/metrics', (_req: Request, res: Response) => {
      res.json(client.getMetrics());
    });

    app.post('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      console.log(`[MCP] POST /mcp - Session: ${sessionId || 'none'}`);
      
      try {
        if (sessionId && transports[sessionId]) {
          console.log(`[MCP] Reusing existing session: ${sessionId}`);
          await transports[sessionId].handleRequest(req, res, req.body);
        } else if (!sessionId && isInitializeRequest(req.body)) {
          console.log(`[MCP] Creating new session for initialize request`);
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => { 
              console.log(`[MCP] Session initialized: ${id}`);
              transports[id] = transport; 
            },
          });
          transport.onclose = () => {
            if (transport.sessionId) {
              console.log(`[MCP] Session closed: ${transport.sessionId}`);
              delete transports[transport.sessionId];
            }
          };
          const serverInstance = createMcpServer();
          await serverInstance.connect(transport);
          await transport.handleRequest(req, res, req.body);
        } else {
          console.log(`[MCP] Bad request - no session ID and not initialize`);
          res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID' }, id: null });
        }
      } catch (error) {
        console.error('[MCP] Error:', error);
        if (!res.headersSent) {
          res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
        }
      }
    });

    app.get('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      console.log(`[MCP] GET /mcp - Session: ${sessionId || 'none'}`);
      
      if (!sessionId || !transports[sessionId]) {
        return res.status(400).send('Invalid or missing session ID');
      }
      try {
        await transports[sessionId].handleRequest(req, res);
      } catch (error) {
        console.error('[MCP] GET error:', error);
        if (!res.headersSent) res.status(500).end();
      }
    });

    app.delete('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      console.log(`[MCP] DELETE /mcp - Session: ${sessionId || 'none'}`);
      
      if (!sessionId || !transports[sessionId]) {
        return res.status(400).send('Invalid or missing session ID');
      }
      try {
        await transports[sessionId].handleRequest(req, res);
      } catch (error) {
        console.error('[MCP] DELETE error:', error);
        if (!res.headersSent) res.status(500).end();
      }
    });

    app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
      res.json({
        issuer: `https://derive-mcp-production.up.railway.app`,
        authorization_endpoint: '',
        token_endpoint: '',
        response_types_supported: [],
      });
    });

    app.listen(port, '0.0.0.0', () => {
      console.log(`[MCP] Server listening on port ${port}`);
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
