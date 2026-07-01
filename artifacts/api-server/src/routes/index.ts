// تسجيل جميع مسارات API
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import banksRouter from "./banks";
import applicationsRouter from "./applications";
import sessionsRouter from "./sessions";
import adminRouter from "./admin";
import settingsRouter from "./settings";
import pageContentsRouter from "./page_contents";
import customFieldsRouter from "./custom_fields";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/banks", banksRouter);
router.use("/applications", applicationsRouter);
router.use("/sessions", sessionsRouter);
router.use("/admin", adminRouter);
router.use("/settings", settingsRouter);
router.use("/page-contents", pageContentsRouter);
router.use("/custom-fields", customFieldsRouter);
router.use("/push", pushRouter);

export default router;
