import { Router, Response, Request, NextFunction } from "express";
import cors from "cors";
import { config } from "dotenv";
import Queue, { DoneCallback, Job } from "bull";
import redis from "ioredis";
import axios from "axios";
import { sanitize } from "string-sanitizer";
import { v4 as uuidV4 } from "uuid";
import { readFileSync, existsSync } from "fs";

config();

export const router = Router();

const envs = process.env;

if (envs.REDIS_HOST === undefined) throw new Error("REDIS_HOST is undefined!");
if (envs.REDIS_PORT === undefined) throw new Error("REDIS_PORT is undefined!");
if (envs.AI_NODE === undefined) throw new Error("AI_NODE is undefined!");
if (envs.ORIGIN_URL === undefined) throw new Error("ORIGIN_URL is undefined!");
if (envs.CUSTOM_PROMPT === undefined) throw new Error("CUSTOM_PROMPT is undefined!");
if (process.env.AI_NODES === undefined)
  throw new Error("AI_NODES is undefined!");

const prompt = getPrompt();

function getPrompt() { 
  if (envs.CUSTOM_PROMPT != "true" || !existsSync("./prompt.txt"))
    return `Narrative Statements are a narrative style used to communicate accomplishments and results in the United States Air Force. They should be efficient and increase clarity of an Airman's performance.
      In the United States Air Force, Narrative Statements should be a standalone sentence with action and at least one of impact or results/outcome and written in plain language without uncommon acronyms and abbreviations.
      The first word of a narrative statement should be a strong action verb.
      The performance statement should be one sentence and written in past tense. It should also include transition words like "by" and "which".
      Personal pronouns (I, me, my, we, us, our, etc.) should not be used.
      Rewrite the USER prompt to follow these conventions. 
      Generate Three seporate and unique ways to rewrite what you were given in JSON format labled "V1", "V2", and "V3", and how it has improved in "V1_Reason", "V2_Reason", and "V3_Reason".
      Generate impartial feedback on how the user can improve the statement in a JSON object labled "Feedback"`;
  else 
    return readFileSync("./prompt.txt");
}

console.log( "Using prompt: [" + prompt + "]");

const json_schema = {
  "type": "object",
  "required": [
      "V1",
      "V2",
      "V3",
      "Feedback"
  ],
  "properties": {
      "V1": {
          "type": "object",
          "required": [
              "new_statement",
              "reasoning"
          ],
          "properties": {
              "new_statement": {
                  "type": "string"
              },
              "reasoning": {
                  "type": "string"
              }
          }
      },
      "V2": {
          "type": "object",
          "required": [
              "new_statement",
              "reasoning"
          ],
          "properties": {
              "new_statement": {
                  "type": "string"
              },
              "reasoning": {
                  "type": "string"
              }
          }
      },
      "V3": {
          "type": "object",
          "required": [
              "new_statement",
              "reasoning"
          ],
          "properties": {
              "new_statement": {
                  "type": "string"
              },
              "reasoning": {
                  "type": "string"
              }
          }
      },
      "Feedback": {
          "type": "string"
      }
  }
}

const redisConfig = {
  host: envs.REDIS_HOST || "localhost",
  port: parseInt(envs.REDIS_PORT) || 6379,
  defaultJobOptions: {
    attempts: 30,
    backoff: {
      type: "fixed",
      delay: "10000",
    },
  },
  removeOnFailure: true,
};

const jobQueue = Queue("jobQueue4", { redis: redisConfig });
const processingTimes = Queue("processingTime", { redis: redisConfig });

const nodes = () => {
  const nodeList = process.env.AI_NODES;
  if (nodeList === undefined) return ["undefined"];
  if (nodeList.indexOf(",") > -1)
    return nodeList.replaceAll(" ", "").split(",");
  else return [nodeList];
};

let AverageProcessingTime = 2.15 * 60 * 1000;
const updateFrequency = 1;
// setInterval(function() {
//     updateAverageProcessingTime()
// }, minutes * 60 * 1000);

function updateAverageProcessingTime() {
  const client = new redis(redisConfig);

  client.on("connect", () => {
    console.log("Connected to Redis");
  });

  client.on("error", (err) => {
    console.error("Redis Client Error:", err);
  });

  // Get jobs from the last hour
  client.lrange(`bull:processingTime`, "-3600", "+", (err, jobs) => {
    if (err || jobs == undefined) {
      console.error("Error retrieving jobs:", err);
    } else if (jobs.length == 0) {
      // ?????
    } else {
      let totalSum = 0;
      let count = 0;

      for (let i = 0; i < jobs.length; i++) {
        const jobData = JSON.parse(jobs[i]);
        totalSum += jobData.data.proccessingTime;
        count++;
      }

      if (count > 0) {
        const averageValue = totalSum / count;
        AverageProcessingTime = totalSum / count;
        // console.log("Average value over last minute: " + AverageProcessingTime);
      }
    }
  });
  client.disconnect(true);
}

// TODO: This is unused. Need to make it work with multiple nodes!
async function getAiNode() {
  //TODO: Round robin a list of nodes
  for (let i = 0; i < nodes().length; i++) {
    const node = nodes()[i];
    const result = await axios
      .get(node + "/status", {})
      .then((result) => {
        if (result.data.status === true) {
          console.log("Node [" + node + "] willing to accept jobs");
          return true;
        } else return false;
      })
      .catch((error) => {
        console.log(error);
        return false;
      });
    if (result) return node;
  }
}

async function getQueuePosition(jobId:string) {
  const activeJobs = await jobQueue.getActive();
  if ( activeJobs.find( (job) => job.id == jobId  ))
    return 0;

  const quededJobs = await jobQueue.getWaiting();
  const index = quededJobs.findIndex( (job) => job.id == jobId );
  return index + 1;
}

jobQueue.process(async (job: Job, done: DoneCallback) => {
  const data = job.data;
  const startTime = Date.now();
  console.log("Starting job...");

  if (job.data.status == "Removed") {
    done();
    return;
  }

  let user_prompt : string = "";

  if ( job.data.prompt != "" && job.data.prompt != undefined )
  {
    user_prompt = (job.data.prompt).toString();
  }
  else
    user_prompt = prompt.toString();

  const params = {
    "model": process.env.AI_MODEL,
    "prompt": user_prompt + " user input: "  + (job.data.package).toString(),
    "format": json_schema,
    "stream": false,
  }

  console.log("Sending job to [" + process.env.AI_NODE + "/generate]");
  // const update = job.data.startTime = startTime;
    await axios.post(process.env.AI_NODE + "/generate", params)
      .then((result) => {
        if (result.data.error !== undefined) {
          console.log("Problem with server: " + result.data.error);
        } else {
          job.update({response: result.data.response});
          done();
          console.log("Job complete.");
        }
      })
      .catch((error) => {
        done(new Error("Unable to generate feedback"));
        console.log("Error while generating!");
        console.log( error);
      });
  });

router.use(cors({ origin: process.env.ORIGIN_URL }));

router.use(function (req: Request, res: Response, next: NextFunction) {
  if( process.env.ORIGIN_URL === undefined)
    return

  res.header("Access-Control-Allow-Orgin", process.env.ORIGIN_URL);
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );

  if ("OPTIONS" === req.method) {
    res.sendStatus(200);
  } else {
    next();
  }
});

router.post("/queue", async (req: Request, res: Response) => {
  if (req.body.data.current_job !== null && req.body.data.current_job !== undefined) {
    console.log("Canceling existing job [" + req.body.data.current_job + "]");
    jobQueue.getJob(req.body.data.current_job).then((job) => {
      job?.update({ status: "Removed" });
    });
  }

  const job = jobQueue.add(
    { package: req.body.data.package, token: "ADD TOKENS" },
    { jobId: uuidV4() }
  );

  job
    .then((id) => {
      console.log("Job added. ID: " + id.id);
      res.status(200).json({ jobID: id.id });
    })
    .catch((err) => {
      console.log( err );
      res.sendStatus(500);
    });
});

router.post("/prompt-queue", async (req: Request, res: Response) => {
  if (req.body.data.current_job !== null && req.body.data.current_job !== undefined) {
    console.log("Canceling existing job [" + req.body.data.current_job + "]");
    jobQueue.getJob(req.body.data.current_job).then((job) => {
      job?.update({ status: "Removed" });
    });
  }

  const uuid = uuidV4()

  const job = jobQueue.add( 
    { package: req.body.data.package, prompt: req.body.data.prompt },
    { jobId: uuid },
  ).then( (job) => {
    console.log("job [" + job.id + "] queued!");
    res.status(200).json({jobID: job.id})
  }).catch((err) => {
    console.log( err );
    res.sendStatus(500);
  });
});

router.get("/status/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  const job = await jobQueue.getJob(id);

  if (job === null) {
    console.log("NULL JOB");
    res.status(500).send({error: "Job null!"});
    return;
  }

  job.getState().then((status) => {
    if (status == "completed") {
      job.remove();
      res.status(200).json({ status: "completed", data: job.data.response });
    } else {
      // const timeRemaining = Date.now() - job.data.startTime;
      // console.log(job.data.startTime);
      console.log("Processing [" + id + "]");
      getQueuePosition( id ).then( (position) => 
        res.status(200).send({ status: status, position: position })
      ).catch( () => res.status(500));
    }
  });
});
