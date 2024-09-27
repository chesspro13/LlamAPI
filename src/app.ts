import express from "express";
import { router as apiRouter } from "./scheduler.js";
import { config } from "dotenv";
import helmet from "helmet";

// Environment Variables
config();
const API_PORT = process.env.API_PORT || 27415


// API
const api = express();
api.use(express.json());
api.use(helmet());
api.use("/api", apiRouter);
api.listen(API_PORT, () => {
    console.log("API server listening on port: ", API_PORT);
});