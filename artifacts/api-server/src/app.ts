import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// الخادم يعمل خلف بروكسي Replit — ضروري لكوكيز الجلسة الآمنة
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد جلسات المدير
app.use(
  session({
    secret: process.env.SESSION_SECRET || "jazeera-finance-secret-2024",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 ساعة
    },
  }),
);

// Serve static files from jazeera-finance frontend
const frontendPath = process.env.NODE_ENV === "production"
  ? path.resolve("/app/artifacts/jazeera-finance/dist/public")
  : path.resolve("/workspace/project/newjazera2/artifacts/jazeera-finance/dist/public");
app.use(express.static(frontendPath));

// Serve API routes
app.use("/api", router);

// Serve index.html for all other routes (SPA support)
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Also handle root path
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

export default app;
