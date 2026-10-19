import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scamfindRouter from "./scamfind";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scamfindRouter);

export default router;
