import { Router } from "express";
import communityRouter from "./community.js";
import healthRouter from "./health.js";
import mlbRouter from "./mlb.js";
import sportsRouter from "./sports.js";

const router = Router();

router.use(healthRouter);
router.use(mlbRouter);
router.use(sportsRouter);
router.use(communityRouter);

export default router;
