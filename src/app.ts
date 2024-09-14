import express from "express";
import { router as apiRouter } from "./api.js";
import { config } from "dotenv";

// Environment Variables
config();
const API_PORT = process.env.API_PORT || 27415;

// API
const api = express();
api.use(express.json());
api.use("/api", apiRouter);
api.listen(API_PORT, () => {
    console.log("API server listening on port: ", API_PORT);
});