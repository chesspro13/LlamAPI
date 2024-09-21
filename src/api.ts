import { Router, Response, Request, NextFunction } from "express";
import {fileURLToPath} from "url";
import path from "path";
import {LlamaModel, LlamaContext, LlamaChatSession, LlamaJsonSchemaGrammar} from "node-llama-cpp";
import cors from "cors";
import {config} from "dotenv"


config();

export const router = Router();

const llm = process.env.LLM_MODEL;
if ( llm === undefined)
    throw new Error("NO LLM GIVEN");

const originURL = process.env.ORIGIN_URL;
if ( originURL === undefined)
    throw new Error("NO ORIGIN URL GIVEN");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
        
const model = new LlamaModel({
    modelPath: path.join(__dirname, "../models", llm),
    gpuLayers: 33
});

const grammer = new LlamaJsonSchemaGrammar({
    "type": "object",
    "properties": {
        "V1": {
            "type": "string"
        },
        "V2": {
            "type": "string"
        },
        "V3": {
            "type": "string"
        },
        "V1_Reason": {
            "type": "string"
        },
        "V2_Reason": {
            "type": "string"
        },
        "V3_Reason": {
            "type": "string"
        },
        "Feedback": {
            "type": "string"
        }
    }
} as const);

function prompt( userPackage: string){
    return `<|im_start|>system
        Narrative Statements are a narrative style used to communicate accomplishments and results in the United States Air Force. They should be efficient and increase clarity of an Airman's performance.
        In the United States Air Force, Narrative Statements should be a standalone sentence with action and at least one of impact or results/outcome and written in plain language without uncommon acronyms and abbreviations.
        The first word of a narrative statement should be a strong action verb.
        The performance statement should be one sentence and written in past tense. It should also include transition words like "by" and "which".
        Personal pronouns (I, me, my, we, us, our, etc.) should not be used.
        Rewrite the USER prompt to follow these conventions. 
        Generate Three seporate and unique ways to rewrite what you were given in JSON format labled "V1", "V2", and "V3", and how it has improved in "V1_Reason", "V2_Reason", and "V3_Reason".
        At the very end generate impartial feedback on how to improve the statement in JSON labled "Feedback"
        <|im_end|>
        <|im_start|>user
        ` + userPackage + `
        <|im_end|>
        <|im_start|>assistant`
}

router.use(
    cors({ origin: originURL}));

router.use(function(req: Request, res: Response, next: NextFunction) {
    res.header("Access-Control-Allow-Orgin", originURL)
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
    
    if ('OPTIONS' === req.method) {
        //respond with 200
        res.send(200);
      }
      else {
      //move on
        next();
      }
})

router.get("/testing", (req: Request, res: Response) => {
    res.send( {result: "success" }  )
});

router.post("/status", async (req: Request, res: Response) => {
    const context = new LlamaContext({model});
    const session = new LlamaChatSession({context});
	console.log( req.body.data.package )
    await session.prompt(prompt(req.body.data.package), { grammar: grammer, maxTokens: context.getContextSize() }).then(a => {
        console.log("\n\nGenerated Text: [" + a + "]")
        res.status(200).send( {result: "success", message: grammer.parse(a) }  )
    }).catch( result => {
        console.log("ERROR: " + result)
        console.log("OFFENDING PROMPT: " + req.body.data.package)
        res.sendStatus(500)
    });
});

router.post("/test", (req: Request, res: Response) => {
    res.send( {result: "success" }  )
});

