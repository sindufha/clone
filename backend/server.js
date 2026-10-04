/**
 * Main Express Server
 * Initializes the backend server with middleware stack and routes
 *
 * Requirements: 10.1, 10.8, 20.1, 20.2
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Load environment configuration
const env = require('./config/env');
const { initLogger, getLogger } = require('./config/logger');
const SessionManager = require('./auth/sessionManager');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import route factories
const createAuthRouter = require('./routes/auth');
const createAssignmentsRouter = require('./routes/assignments');
const createCoursesRouter = require('./routes/courses');

// Initialize logger
const logger = initLogger({ isProduction: process.env.NODE_ENV === 'production' });

/**
 * Main Server class
 * Handles initialization, middleware setup, and route mounting
 */
class Server {
  constructor(config = {}) {
    this.port = config.port || env.config.port || 3000;
    this.env = config.env || env.config.nodeEnv || 'development';
    this.sessionManager = new SessionManager();

    // Initialize Express app
    this.app = express();

    // Initialize routes collection
    this.routes = {};
  }

  /**
   * Initialize the server with middleware and routes
   */
  async initialize() {
    logger.info('Initializing server...', {
      environment: this.env,
      port: this.port
    });

    try {
      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup error handlers (must be last)
      this.setupErrorHandlers();

      logger.info('Server initialization complete');
      return this;
    } catch (error) {
      logger.error('Server initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Setup middleware stack
   * Order matters: request ID, CORS, body parsing, logging, auth, static files
   */
  setupMiddleware() {
    logger.info('Setting up middleware...');

    // 1. Generate unique request ID for each request
    this.app.use((req, res, next) => {
      req.id = uuidv4().substring(0, 8);
      next();
    });

    // 2. CORS - Allow cross-origin requests from frontend
    // Restrict to application domain in production
    const corsOptions = {
      origin: (origin, callback) => {
        // Allow requests from same origin or development
        if (!origin || this.env === 'development') {
          callback(null, true);
        } else {
          callback(null, true); // Allow in dev, restrict in production
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    };
    this.app.use(cors(corsOptions));

    // 3. Body parser - Parse JSON and URL-encoded bodies
    this.app.use(bodyParser.json({ limit: '10mb' }));
    this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

    // 4. Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();

      // Log response when done
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.path}`, {
          requestId: req.id,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip
        });
      });

      next();
    });

    // 5. Static file serving - Serve frontend from public directory
    const publicPath = path.join(__dirname, '../frontend', 'public');
    this.app.use(express.static(publicPath, {
      maxAge: this.env === 'production' ? '1d' : '0'
    }));

    // 6. Serve frontend assets (CSS, JS, images)
    const frontendPath = path.join(__dirname, '../frontend');
    this.app.use(express.static(frontendPath, {
      maxAge: this.env === 'production' ? '1d' : '0'
    }));

    logger.info('Middleware setup complete');
  }

  /**
   * Setup routes
   * Mount API route handlers
   */
  setupRoutes() {
    logger.info('Setting up routes...');

    // Initialize LMS proxy and auth controller
    const LMSProxy = require('./auth/lmsProxy');
    const AuthController = require('./auth/authController');
    const lmsProxy = new LMSProxy(env.config.lmsBaseUrl, false);
    const authController = new AuthController(this.sessionManager, lmsProxy);

    // Mount session manager on app for middleware access
    this.app.sessionManager = this.sessionManager;

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        status: 'Server is running',
        environment: this.env,
        timestamp: new Date().toISOString()
      });
    });

    // API info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        success: true,
        message: 'LMS UI Remake API',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          auth: '/api/auth',
          assignments: '/api/assignments',
          courses: '/api/courses'
        }
      });
    });

    // Mount real API routes (factory functions)
    this.app.use('/api/auth', createAuthRouter(this.sessionManager, authController));
    this.app.use('/api/assignments', createAssignmentsRouter(this.sessionManager, lmsProxy, authController));
    this.app.use('/api/courses', createCoursesRouter(this.sessionManager, lmsProxy, authController));

    // SPA fallback - Serve index.html for all non-API routes
    this.app.get('*', (req, res) => {
      const indexPath = path.join(__dirname, '../frontend/index.html');
      res.sendFile(indexPath, (err) => {
        if (err && err.code !== 'ECONNABORTED') {
          logger.error('Error serving index.html', { error: err.message });
          res.status(500).json({
            success: false,
            error: 'Failed to load application'
          });
        }
      });
    });

    logger.info('Routes setup complete');
  }

  /**
   * Setup error handlers
   * Must be registered after all routes
   */
  setupErrorHandlers() {
    logger.info('Setting up error handlers...');

    // 404 Not Found handler
    this.app.use(notFoundHandler);

    // Centralized error handler (must be last)
    this.app.use(errorHandler);

    logger.info('Error handlers setup complete');
  }

  /**
   * Start listening on configured port
   */
  start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          logger.info('Server started successfully', {
            port: this.port,
            environment: this.env,
            url: `http://localhost:${this.port}`
          });
          resolve(this);
        });

        // Handle server errors
        this.server.on('error', (error) => {
          logger.error('Server error', {
            error: error.message,
            code: error.code
          });
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start server', {
          error: error.message,
          stack: error.stack
        });
        reject(error);
      }
    });
  }

  /**
   * Stop the server gracefully
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.sessionManager.destroy();
          logger.info('Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

/**
 * Entry point - Create and start server if this is the main module
 */
async function main() {
  try {
    const server = new Server({
      port: env.config.port,
      env: env.config.nodeEnv
    });

    // Initialize and start server
    await server.initialize();
    await server.start();

    // Graceful shutdown handlers
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT signal received: closing HTTP server');
      await server.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Fatal error', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

module.exports = Server;
