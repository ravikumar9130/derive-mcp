#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest, } from '@modelcontextprotocol/sdk/types.js';
import { DeriveClient, DeriveApiError } from './client.js';
import { tools } from './tools.js';
const client = new DeriveClient();
function createMcpServer() {
    const server = new Server({ name: 'derive-market-data', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args = {} } = request.params;
        const a = args;
        try {
            let result;
            switch (name) {
                case 'get_all_currencies':
                    result = await client.getAllCurrencies();
                    break;
                case 'get_currency':
                    result = await client.getCurrency(a);
                    break;
                case 'get_all_instruments':
                    result = await client.getAllInstruments(a);
                    break;
                case 'get_instrument':
                    result = await client.getInstrument(a);
                    break;
                case 'get_ticker':
                    result = await client.getTicker(a);
                    break;
                case 'get_tickers':
                    result = await client.getTickers(a);
                    break;
                case 'get_spot_feed_history':
                    result = await client.getSpotFeedHistory(a);
                    break;
                case 'get_spot_feed_history_candles':
                    result = await client.getSpotFeedHistoryCandles(a);
                    break;
                case 'get_funding_rate_history':
                    result = await client.getFundingRateHistory(a);
                    break;
                case 'get_interest_rate_history':
                    result = await client.getInterestRateHistory(a);
                    break;
                case 'get_option_settlement_history':
                    result = await client.getOptionSettlementHistory(a);
                    break;
                case 'get_latest_signed_feeds':
                    result = await client.getLatestSignedFeeds(a);
                    break;
                case 'get_liquidation_history':
                    result = await client.getLiquidationHistory(a);
                    break;
                case 'get_margin':
                    result = await client.getMargin(a);
                    break;
                case 'get_statistics':
                    result = await client.getStatistics(a);
                    break;
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (error) {
            const message = error instanceof DeriveApiError
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
async function main() {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;
    if (port) {
        // HTTP mode — with session management for Streamable HTTP transport
        const transports = {};
        const app = express();
        app.use(express.json());
        // CORS — allow all origins so browser-based and remote MCP clients can connect
        app.use((_req, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, mcp-session-id, MCP-Protocol-Version');
            res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
            next();
        });
        app.options('*', (_req, res) => {
            res.status(204).end();
        });
        app.get('/health', (_req, res) => {
            res.json({ status: 'ok' });
        });
        app.get('/metrics', (_req, res) => {
            res.json(client.getMetrics());
        });
        app.post('/mcp', async (req, res) => {
            const sessionId = req.headers['mcp-session-id'];
            console.log(`[MCP] POST /mcp - Session: ${sessionId || 'none'}`);
            try {
                if (sessionId && transports[sessionId]) {
                    console.log(`[MCP] Reusing existing session: ${sessionId}`);
                    await transports[sessionId].handleRequest(req, res, req.body);
                }
                else if (sessionId && !transports[sessionId]) {
                    // Session ID provided but not found — likely a server restart; client must reinitialise
                    console.log(`[MCP] Session not found: ${sessionId}`);
                    res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found. Please reinitialise.' }, id: null });
                }
                else if (!sessionId && isInitializeRequest(req.body)) {
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
                }
                else {
                    console.log(`[MCP] Bad request - no session ID and not initialize`);
                    res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID' }, id: null });
                }
            }
            catch (error) {
                console.error('[MCP] Error:', error);
                if (!res.headersSent) {
                    res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
                }
            }
        });
        app.get('/mcp', async (req, res) => {
            const sessionId = req.headers['mcp-session-id'];
            console.log(`[MCP] GET /mcp - Session: ${sessionId || 'none'}`);
            if (!sessionId) {
                return res.status(400).json({ error: 'Missing mcp-session-id header' });
            }
            if (!transports[sessionId]) {
                return res.status(404).json({ error: 'Session not found. Please reinitialise.' });
            }
            // Disable nginx buffering so SSE events are flushed immediately
            res.setHeader('X-Accel-Buffering', 'no');
            try {
                await transports[sessionId].handleRequest(req, res);
            }
            catch (error) {
                console.error('[MCP] GET error:', error);
                if (!res.headersSent)
                    res.status(500).end();
            }
        });
        app.delete('/mcp', async (req, res) => {
            const sessionId = req.headers['mcp-session-id'];
            console.log(`[MCP] DELETE /mcp - Session: ${sessionId || 'none'}`);
            if (!sessionId) {
                return res.status(400).json({ error: 'Missing mcp-session-id header' });
            }
            if (!transports[sessionId]) {
                return res.status(404).json({ error: 'Session not found.' });
            }
            try {
                await transports[sessionId].handleRequest(req, res);
            }
            catch (error) {
                console.error('[MCP] DELETE error:', error);
                if (!res.headersSent)
                    res.status(500).end();
            }
        });
        app.get('/.well-known/oauth-authorization-server', (_req, res) => {
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
