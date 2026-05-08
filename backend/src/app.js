import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import healthRoutes from "./routes/healthRoutes.js";
import transactionsRoutes from "./routes/transactionsRoutes.js";
import recurringRoutes from "./routes/recurringRoutes.js";
import budgetsRoutes from "./routes/budgetsRoutes.js";
import masterDataRoutes from "./routes/masterDataRoutes.js";
import importExportRoutes from "./routes/importExportRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  const configuredOrigins = String(env.corsOrigin || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...configuredOrigins
  ]);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Not allowed by CORS"));
      }
    })
  );
  app.use(express.json());

  app.use("/health", healthRoutes);
  app.use("/api/transactions", transactionsRoutes);
  app.use("/api/recurring", recurringRoutes);
  app.use("/api/budgets", budgetsRoutes);
  app.use("/api/master-data", masterDataRoutes);
  app.use("/api/io", importExportRoutes);

  app.use(errorHandler);
  return app;
}
