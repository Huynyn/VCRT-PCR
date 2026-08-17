// Must run before anything else in this file - many modules imported below
// read process.env.* (DATABASE_PATH, JWT_SECRET, etc.) at module-load time,
// so .env has to be loaded first or those reads just see undefined. Electron
// doesn't ship a .env file (it sets what it needs directly on process.env
// before loading this module - see electron/main.ts), so this is a no-op
// there rather than an error; dotenv silently does nothing if the file
// isn't found.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import http from 'http';

// Import routes
import authRoutes from './routes/auth';
import pcrRoutes from './routes/pcr';
import userRoutes from './routes/users';
import logsRoutes from './routes/logs';
import respondersRoutes from './routes/responders';
import psmMembersRoutes from './routes/psmMembers';
import settingsRoutes from './routes/settings';

// Import database to initialize
import { initDatabase, closeDatabase, getDatabaseHealth } from './database';
import { cleanupService } from './services/cleanup';

// Electron environment detection
const isElectron = process.env.IS_ELECTRON === 'true';

// Track if we're running embedded in Electron main process
let isEmbedded = false;
let embeddedServer: http.Server | null = null;

/**
 * Create and configure the Express app
 */
function createApp(): express.Application {
  const app = express();

  // Middleware
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(helmet({
    // CSP off in development so the Vite dev server's inline/HMR scripts
    // aren't blocked; on in production, where no such dev tooling runs.
    contentSecurityPolicy: isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false
  }));

  // CORS: Disable in Electron (not needed), enable for web
  if (!isElectron) {
    app.use(cors({
      origin: ['http://localhost:5173', 'http://localhost:3000'],
      credentials: true
    }));
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // This app isn't deployed behind a reverse proxy, so trusting
  // X-Forwarded-For here would let any client spoof the IP address that
  // ends up in the activity-log audit trail. Leave Express's default
  // (don't trust proxy headers) in place.

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/pcr', pcrRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/logs', logsRoutes);
  app.use('/api/responders', respondersRoutes);
  app.use('/api/psm-members', psmMembersRoutes);
  app.use('/api/settings', settingsRoutes);

  // Special route for submissions to match frontend expectation
  app.post('/api/submissions', (req, res, next) => {
    // Forward to PCR submit route
    req.url = '/submit';
    pcrRoutes(req, res, next);
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      message: 'PCR API Server is running',
      timestamp: new Date().toISOString(),
      database: getDatabaseHealth()
    });
  });

  // Serve static files in production (only when not embedded - Electron loads files directly)
  if (process.env.NODE_ENV === 'production' && !isEmbedded) {
    app.use(express.static(path.join(__dirname, '../../../dist/frontend')));

    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../../dist/frontend/index.html'));
    });
  }

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Error:', err);

    res.status(err.status || 500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
  });

  // 404 handler
  app.use((req: express.Request, res: express.Response) => {
    res.status(404).json({
      success: false,
      message: 'Route not found'
    });
  });

  return app;
}

/**
 * Start the server embedded in Electron main process
 * Returns the port number once the server is ready
 */
export async function startEmbeddedServer(databasePath?: string): Promise<number> {
  isEmbedded = true;

  // Set database path if provided
  if (databasePath) {
    process.env.DATABASE_PATH = databasePath;
  }

  // Set Electron flag
  process.env.IS_ELECTRON = 'true';

  return new Promise(async (resolve, reject) => {
    try {
      console.log('Initializing database...');
      await initDatabase();
      console.log('Database initialized');

      const app = createApp();

      // Use port 0 to get a random available port
      embeddedServer = app.listen(0, () => {
        const address = embeddedServer!.address();
        const port = typeof address === 'object' && address ? address.port : 0;

        console.log(`🚀 PCR API Server running on port ${port} (embedded)`);

        // Start cleanup service
        cleanupService.start();

        resolve(port);
      });

      embeddedServer.on('error', (error) => {
        console.error('Server error:', error);
        reject(error);
      });
    } catch (error) {
      console.error('Failed to start embedded server:', error);
      reject(error);
    }
  });
}

/**
 * Stop the embedded server
 */
export function stopEmbeddedServer(): void {
  if (embeddedServer) {
    embeddedServer.close();
    embeddedServer = null;
  }
  cleanupService.stop();
  // Flush any pending debounced save before Electron exits - without this,
  // data written in the last second before quit could be silently dropped.
  closeDatabase();
}

// Start server in standalone mode (not embedded in Electron)
async function startStandaloneServer() {
  const PORT = isElectron ? 0 : (process.env.PORT || 3000);

  try {
    console.log('Initializing database...');
    await initDatabase();
    console.log('Database initialized');

    const app = createApp();

    const server = app.listen(PORT, () => {
      const actualPort = (server.address() as any).port;
      console.log(`🚀 PCR API Server running on port ${actualPort}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${actualPort}/api/health`);

      // Notify Electron main process of server port if running as forked process
      if (isElectron && process.send) {
        process.send({ type: 'server-ready', port: actualPort });
      }

      // Start cleanup service
      cleanupService.start();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start standalone server if this file is run directly (not imported)
// Check if we're the main module
const isMainModule = require.main === module;
if (isMainModule) {
  startStandaloneServer();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    cleanupService.stop();
    closeDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down server...');
    cleanupService.stop();
    closeDatabase();
    process.exit(0);
  });

  // Last-resort safety net: catches shutdown paths not covered above (e.g. an
  // uncaught exception elsewhere calling process.exit()). Only synchronous
  // work is guaranteed to run here, which closeDatabase()'s save/close is.
  process.on('exit', () => {
    try {
      closeDatabase();
    } catch {
      // Already closed, or nothing to flush - safe to ignore
    }
  });
}

export default createApp();