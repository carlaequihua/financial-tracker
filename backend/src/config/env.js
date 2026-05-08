import dotenv from "dotenv";
dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: process.env.DATABASE_URL || "",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173"
};

if (!env.databaseUrl) {
  console.warn("DATABASE_URL is not set. Some commands may fail.");
}
