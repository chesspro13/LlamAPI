import { Router, Response, Request } from "express";
import {fileURLToPath} from "url";
import path from "path";
import {LlamaModel, LlamaContext, LlamaChatSession} from "node-llama-cpp";

export const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const model = new LlamaModel({
    modelPath: path.join(__dirname, "../models", "capybarahermes-2.5-mistral-7b.Q4_K_M.gguf")
});
const context = new LlamaContext({model});
const session = new LlamaChatSession({context});

router.get("/status", async (req: Request, res: Response) => {
    const a1 = await session.prompt("What is the second letter of the alphabet?").then(a => {
        console.log(a); 
        res.send( {result: "success", message: a} )
    });
});
