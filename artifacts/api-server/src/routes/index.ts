import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dddRouter from "./ddd";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dddRouter);

export default router;
