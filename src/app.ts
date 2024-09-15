import express from "express";
import { router as apiRouter } from "./api.js";
import { config } from "dotenv";
import cors from "cors";

// Environment Variables
config();
const API_PORT = process.env.API_PORT || 27415;

const allowedOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173']

const options: cors.CorsOptions = {
    origin: allowedOrigins
  };

// API
const api = express();
api.use(express.json());
api.use(cors(options));

api.use("/api", apiRouter);
api.listen(API_PORT, () => {
    console.log("API server listening on port: ", API_PORT);
});