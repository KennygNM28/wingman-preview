import { Router, type IRouter } from "express";
import communityRouter from "./community";
import healthRouter from "./health";
import mlbRouter from "./mlb";
import sportsRouter from "./sports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mlbRouter);
router.use(sportsRouter);
router.use(communityRouter);

export default router;
