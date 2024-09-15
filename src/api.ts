import { Router, Response, Request } from "express";
import {fileURLToPath} from "url";
import path from "path";
import {LlamaModel, LlamaContext, LlamaChatSession} from "node-llama-cpp";

export const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const model = new LlamaModel({
    modelPath: path.join(__dirname, "../models", "capybarahermes-2.5-mistral-7b.Q4_K_M.gguf"),
    gpuLayers: 128
});

function prompt( userPackage: string){
    return `<|im_start|>system
        Narrative Statements are a narrative style used to communicate accomplishments and results in the United States Air Force. They should be efficient and increase clarity of an Airman's performance.
        In the United States Air Force, Narrative Statements should be a standalone sentence with action and at least one of impact or results/outcome and written in plain language without uncommon acronyms and abbreviations.
        The first word of a narrative statement should be a strong action verb.
        The performance statement should be one sentence and written in past tense. It should also include transition words like "by" and "which".
        Personal pronouns (I, me, my, we, us, our, etc.) should not be used.
        Rewrite the USER prompt to follow these conventions. 
        Generate Three seporate and unique ways to rewrite what you were given in JSON format labled "V1", "V2", and "V3".
        <|im_end|>
        <|im_start|>user
        ` + userPackage + `
        <|im_end|>
        <|im_start|>assistant`
}

router.post("/status", (req: Request, res: Response) => {
    const context = new LlamaContext({model});
    const session = new LlamaChatSession({context});
    console.log( req.body.package )
    session.prompt(prompt(req.body.package)).then(a => {
        console.log("\n\nGenerated Text: [" + a + "]")
        var cleanJson = "{" + a.toString().split("{")[1].split("}")[0] + "}";
        cleanJson = cleanJson.replaceAll("\\n","").replaceAll("\n","")
        cleanJson = cleanJson.replaceAll("\\","").replaceAll(/\s+/g,' ').trim();
        console.log("Clean JSON: [" + cleanJson + "]")
        res.send( {result: "success", message: cleanJson }  )
    });
});
